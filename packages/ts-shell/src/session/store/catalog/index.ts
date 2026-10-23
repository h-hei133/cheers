import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { compareSessionChoices, sessionChoices, type SessionSelectionContext } from '../../navigation/selection.js';
import type { SessionStoreLayout } from '../sessionFileLayout.js';
import { discoverSessions } from './discovery.js';
import { locateCatalogFiles, readCatalogFile } from './files.js';
import {
  CATALOG_LIMITS,
  type SessionCatalogBoundary,
  type SessionCatalogContinuation,
  type SessionCatalogQuery,
  type SessionCatalogSnapshot,
  type SessionReferenceQuery,
  type SessionReferenceResolution,
  type SessionSummary,
} from './model.js';
import { decodeSessionSummary } from './projection.js';
import { SessionCatalogPage } from './query.js';
import { resolveCatalogReference } from './reference.js';

export interface SessionCatalogDiagnostic {
  /** Bounded samples; snapshot.unreadable keeps the full source failure count. */
  readonly unreadableSessionIds: readonly string[];
  readonly unreadableDirectories: readonly string[];
}

interface CatalogAttempt {
  readonly key: string;
  readonly total: number;
  readonly entries: readonly SessionCatalogBoundary[];
  readonly unreadable: number;
  readonly limited: number;
  readonly indexTruncated: boolean;
}

const MAX_ATTEMPTS = 8;

/** Bounded, process-local listing index; every use checks the actual core-file version. */
export class SessionCatalog {
  private readonly cache = new Map<string, SessionSummary>();
  private readonly attempts = new Map<string, CatalogAttempt>();

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
    const after = query?.after;
    const attempt = after ? this.readAttempt(after) : undefined;
    const attemptId = after?.attemptId ?? randomUUID();
    const selection = query ? new SessionCatalogPage(context, limit, query, attemptId, attempt?.total,
      attempt?.indexTruncated) : undefined;
    let scanned = 0;
    let unreadable = attempt?.unreadable ?? 0;
    let limited = attempt?.limited ?? 0;
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
      if (attempt && after) {
        const entries = entriesAfter(attempt.entries, after.boundary).slice(0, limit + 1);
        const loaded = await this.readBatch(entries, signal, onSource);
        for (const summary of loaded) {
          scanned++;
          if (summary.quality === 'limited') limited++;
          selection!.accept(summary);
        }
        signal?.throwIfAborted();
        selection!.assertBoundary(await this.read(after.boundary.id, signal));
        this.remember(selection!.snapshot(true).sessions);
        yield snapshot(unreadable || limited || selection!.indexTruncated ? 'partial' : 'complete');
        return;
      }
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
      const final = snapshot(unreadable || limited || selection?.indexTruncated ? 'partial' : 'complete');
      if (selection && final.continuation) {
        const entries = attempt?.entries ?? selection.matchedBoundaries().slice().sort(compareSessionChoices);
        this.rememberAttempt(final.continuation, entries,
          final.total ?? 0, unreadable, limited, selection.indexTruncated);
      }
      yield final;
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

  private readAttempt(after: SessionCatalogContinuation): CatalogAttempt {
    const attempt = this.attempts.get(after.attemptId);
    if (!attempt || attempt.key !== attemptKey(after)) {
      throw new Error('Session page expired. Reopen the session picker.');
    }
    this.attempts.delete(after.attemptId);
    this.attempts.set(after.attemptId, attempt);
    return attempt;
  }

  private rememberAttempt(continuation: SessionCatalogContinuation,
    entries: readonly SessionCatalogBoundary[], total: number, unreadable: number, limited: number,
    indexTruncated: boolean): void {
    this.attempts.set(continuation.attemptId, { key: attemptKey(continuation), entries, total,
      unreadable, limited, indexTruncated });
    while (this.attempts.size > MAX_ATTEMPTS) this.attempts.delete(this.attempts.keys().next().value!);
  }

  private async readBatch(entries: readonly SessionCatalogBoundary[], signal?: AbortSignal,
    onSource?: (target: string) => void): Promise<SessionSummary[]> {
    const loaded = new Array<SessionSummary>(entries.length);
    let next = 0;
    const worker = async (): Promise<void> => {
      while (next < entries.length) {
        const index = next++;
        const expected = entries[index]!;
        signal?.throwIfAborted();
        const summary = await this.read(expected.id, signal, undefined, onSource);
        if (!summary || summary.version !== expected.version) {
          throw new Error('Session page changed while browsing. Reopen the session picker to refresh.');
        }
        loaded[index] = summary;
      }
    };
    const settled = await Promise.allSettled(Array.from({ length: Math.min(CATALOG_LIMITS.concurrency, entries.length) }, worker));
    const failure = settled.find(result => result.status === 'rejected');
    if (failure?.status === 'rejected') throw failure.reason;
    return loaded;
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

function attemptKey(value: Pick<SessionCatalogContinuation, 'sessionId' | 'projectRoot' | 'allProjects' | 'needle' | 'limit'>): string {
  return JSON.stringify([value.sessionId, value.projectRoot, value.allProjects, value.needle, value.limit]);
}

function entriesAfter(entries: readonly SessionCatalogBoundary[], boundary: SessionCatalogBoundary): readonly SessionCatalogBoundary[] {
  let low = 0;
  let high = entries.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (compareSessionChoices(entries[middle]!, boundary) <= 0) low = middle + 1;
    else high = middle;
  }
  return entries.slice(low);
}
