import path from 'node:path';
import { sessionChoices, type SessionSelectionContext } from '../../navigation/selection.js';
import type { SessionStoreLayout } from '../sessionFileLayout.js';
import { discoverSessions } from './discovery.js';
import { locateCatalogFiles, readCatalogFile } from './files.js';
import { CATALOG_LIMITS, type SessionCatalogSnapshot, type SessionReferenceQuery, type SessionReferenceResolution, type SessionSummary } from './model.js';
import { decodeSessionSummary } from './projection.js';
import { resolveCatalogReference } from './reference.js';

/** Bounded, process-local listing index; every use checks the actual core-file version. */
export class SessionCatalog {
  private readonly cache = new Map<string, SessionSummary>();

  constructor(private readonly layout: SessionStoreLayout) {}

  resolve(reference: string, options: SessionReferenceQuery = {}): Promise<SessionReferenceResolution> {
    return resolveCatalogReference(this.layout, (id, signal, directory) => this.read(id, signal, directory), reference, options);
  }

  async *list(context: SessionSelectionContext, signal?: AbortSignal, limit = 40,
    onSource?: (target: string) => void): AsyncGenerator<SessionCatalogSnapshot> {
    signal?.throwIfAborted();
    if (!Number.isInteger(limit) || limit < 1 || limit > 10_000) throw new RangeError('Invalid session listing limit.');
    let scanned = 0;
    let unreadable = 0;
    let limited = 0;
    let recent: readonly SessionSummary[] = [];
    const read = async (id: string, directory?: string): Promise<SessionSummary | undefined> => {
      try {
        const summary = await this.read(id, signal, directory, onSource);
        if (summary) { scanned++; if (summary.quality === 'limited') limited++; }
        return summary;
      } catch {
        signal?.throwIfAborted();
        unreadable++;
        return undefined;
      }
    };
    const current = await read(context.sessionId);
    if (current) { recent = [current]; this.remember([current]); }
    const snapshot = (status: SessionCatalogSnapshot['status']): SessionCatalogSnapshot => ({
      ...sessionChoices(recent, context, limit), scanned, unreadable, limited, status,
    });
    // The runtime identity is available before historical discovery starts.
    yield snapshot('scanning');
    for await (const page of discoverSessions(this.layout, signal, onSource)) {
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
      const choices = sessionChoices([...recent, ...loaded], context, limit);
      recent = choices.sessions;
      // Retain even an out-of-scope/empty current record solely for its explanation.
      if (current && !recent.some(item => item.id === current.id)) recent = [...recent, current];
      yield snapshot('scanning');
    }
    signal?.throwIfAborted();
    this.remember(sessionChoices(recent, context, limit).sessions);
    yield snapshot(unreadable || limited ? 'partial' : 'complete');
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
