import path from 'node:path';
import { sessionChoices, type SessionSelectionContext } from '../../navigation/selection.js';
import type { SessionStoreLayout } from '../sessionFileLayout.js';
import { discoverSessions } from './discovery.js';
import { locateCatalogFiles, readCatalogFile } from './files.js';
import { CATALOG_LIMITS, type SessionCatalogQuery, type SessionCatalogSnapshot, type SessionReferenceQuery, type SessionReferenceResolution, type SessionSummary } from './model.js';
import { decodeSessionSummary } from './projection.js';
import { SessionCatalogPage } from './query.js';
import { resolveCatalogReference } from './reference.js';

export interface SessionCatalogDiagnostic {
  /** Bounded samples; snapshot.unreadable keeps the full source failure count. */
  readonly unreadableSessionIds: readonly string[];
  readonly unreadableDirectories: readonly string[];
}

/** Bounded, process-local listing index; every use checks the actual core-file version. */
export class SessionCatalog {
  private readonly cache = new Map<string, SessionSummary>();

  constructor(private readonly layout: SessionStoreLayout) {}

  resolve(reference: string, options: SessionReferenceQuery = {}): Promise<SessionReferenceResolution> {
    return resolveCatalogReference(this.layout, (id, signal, directory) => this.read(id, signal, directory), reference, options);
  }

  async *list(context: SessionSelectionContext, signal?: AbortSignal, limit = 40,
    onSource?: (target: string) => void,
    onUnreadable?: (diagnostic: SessionCatalogDiagnostic) => void,
    query?: SessionCatalogQuery): AsyncGenerator<SessionCatalogSnapshot> {
    signal?.throwIfAborted();
    if (!Number.isInteger(limit) || limit < 1 || limit > 10_000) throw new RangeError('Invalid session listing limit.');
    const selection = query ? new SessionCatalogPage(context, limit, query) : undefined;
    let scanned = 0;
    let unreadable = 0;
    let limited = 0;
    let recent: readonly SessionSummary[] = [];
    const unreadableSessionIds = new Set<string>();
    const unreadableDirectories = new Set<string>();
    let diagnosed = false;
    const diagnose = (): void => {
      if (diagnosed) return;
      diagnosed = true;
      if (unreadableSessionIds.size === 0 && unreadableDirectories.size === 0) return;
      try {
        onUnreadable?.({
          unreadableSessionIds: [...unreadableSessionIds],
          unreadableDirectories: [...unreadableDirectories],
        });
      } catch {
        // Diagnostics are observational; they must not change catalog results.
      }
    };
    const read = async (id: string, directory?: string): Promise<SessionSummary | undefined> => {
      try {
        const summary = await this.read(id, signal, directory, onSource);
        if (summary) { scanned++; if (summary.quality === 'limited') limited++; }
        return summary;
      } catch {
        signal?.throwIfAborted();
        unreadable++;
        // The active session can still be completing its first write when the
        // post-frame hint scan starts. Its failure is not a historical entry
        // the user needs to repair, and the current projection already reports
        // it separately.
        if (id !== context.sessionId && unreadableSessionIds.size < CATALOG_LIMITS.diagnosticSamples) unreadableSessionIds.add(id);
        return undefined;
      }
    };
    try {
      if (query?.after) selection!.assertBoundary(await this.read(query.after.boundary.id, signal));
      const current = context.sessionId ? await read(context.sessionId) : undefined;
      if (current) { recent = [current]; this.remember([current]); }
      if (current) selection?.accept(current);
      const snapshot = (status: SessionCatalogSnapshot['status']): SessionCatalogSnapshot => ({
        ...(selection?.snapshot(status !== 'scanning') ?? sessionChoices(recent, context, limit)), scanned, unreadable, limited, status,
      });
      // The runtime identity is available before historical discovery starts.
      yield snapshot('scanning');
      for await (const page of discoverSessions(this.layout, signal, onSource)) {
        if (page.unreadable > 0 && unreadableDirectories.size < CATALOG_LIMITS.diagnosticSamples) unreadableDirectories.add(page.directory);
        unreadable += page.unreadable;
        const ids = page.ids.filter(id => id !== context.sessionId);
        const loaded: SessionSummary[] = [];
        let next = 0;
        const worker = async (): Promise<void> => {
          while (next < ids.length) {
            signal?.throwIfAborted();
            const summary = await read(ids[next++]!, page.directory);
            if (summary) loaded.push(summary);
          }
        };
        const settled = await Promise.allSettled(Array.from({ length: Math.min(CATALOG_LIMITS.concurrency, ids.length) }, worker));
        signal?.throwIfAborted();
        const failure = settled.find(result => result.status === 'rejected');
        if (failure?.status === 'rejected') throw failure.reason;
        if (selection) for (const summary of loaded) selection.accept(summary);
        else recent = sessionChoices([...recent, ...loaded], context, limit).sessions;
        // Retain even an out-of-scope/empty current record solely for its explanation.
        if (current && !recent.some(item => item.id === current.id)) recent = [...recent, current];
        yield snapshot('scanning');
      }
      signal?.throwIfAborted();
      if (query?.after) selection!.assertBoundary(await this.read(query.after.boundary.id, signal));
      this.remember(selection?.snapshot(true).sessions ?? sessionChoices(recent, context, limit).sessions);
      yield snapshot(unreadable || limited ? 'partial' : 'complete');
    } finally {
      diagnose();
    }
  }

  private remember(sessions: readonly SessionSummary[]): void {
    for (const session of sessions) {
      this.cache.delete(session.id);
      this.cache.set(session.id, session);
      while (this.cache.size > CATALOG_LIMITS.cacheEntries) this.cache.delete(this.cache.keys().next().value!);
    }
  }

  private async read(id: string, signal?: AbortSignal, directory?: string, onSource?: (target: string) => void): Promise<SessionSummary | undefined> {
    const before = await locateCatalogFiles(this.layout, id, signal, onSource);
    if (!before) { this.cache.delete(id); return undefined; }
    if (directory && before.layout.sessionDir !== path.join(directory, id)) return undefined;
    const cached = this.cache.get(id);
    let summary = cached?.version === before.version ? cached : undefined;
    if (!summary) {
      const metadata = await readCatalogFile(before.layout.metadataPath, before.stats[0], CATALOG_LIMITS.metadataBytes, signal);
      if (metadata === undefined) throw new Error('Session metadata exceeds the listing limit.');
      const state = await readCatalogFile(before.layout.statePath, before.stats[1], CATALOG_LIMITS.stateBytes, signal);
      const transcript = await readCatalogFile(before.layout.transcriptPath, before.stats[2], CATALOG_LIMITS.transcriptBytes, signal);
      summary = decodeSessionSummary(id, metadata, state, transcript, before.version);
    }
    const after = await locateCatalogFiles(this.layout, id, signal, onSource);
    if (after?.version !== before.version) { this.cache.delete(id); throw new Error('Session changed while listing.'); }
    signal?.throwIfAborted();
    // A long sequential scan must not evict every resident just before reaching it.
    // Cache hits refresh their version/order; new admissions use spare space.
    // Current and final visible results are retained explicitly by the query.
    if (cached || this.cache.size < CATALOG_LIMITS.cacheEntries) this.remember([summary]);
    return summary;
  }
}
