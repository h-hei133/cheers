import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { compareSessionChoices, sessionChoices, type SessionSelectionContext } from '../../navigation/selection.js';
import type { SessionStoreLayout } from '../sessionFileLayout.js';
import { scanCatalog } from './scan.js';
import { CatalogBrowses, waitForBrowse, type CatalogBrowseState } from './browse.js';
import { CatalogContinuations } from './continuation.js';
import {
  locateCatalogFiles,
  readCatalogFile,
  SessionCatalogReadLimitError,
  sessionCatalogReadBudget,
  type SessionCatalogReadBudget,
} from './files.js';
import {
  CATALOG_LIMITS,
  type SessionCatalogBoundary,
  type SessionCatalogBrowse,
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

/** Bounded, process-local listing index; every use checks the actual core-file version. */
export class SessionCatalog {
  private readonly cache = new Map<string, SessionSummary>();
  private readonly continuations = new CatalogContinuations();
  private readonly browses: CatalogBrowses;

  constructor(private readonly layout: SessionStoreLayout,
    private readonly attemptBytes = CATALOG_LIMITS.attemptBytes) {
    if (!Number.isSafeInteger(attemptBytes) || attemptBytes < 1) throw new RangeError('Invalid session catalogue source limit.');
    this.browses = new CatalogBrowses(layout, attemptBytes);
  }

  beginBrowse(context: SessionSelectionContext): SessionCatalogBrowse { return this.browses.begin(context); }

  retireBrowse(token: SessionCatalogBrowse): void {
    if (this.browses.retire(token)) this.continuations.retire(token.id);
  }

  /** Called with the original offered summary only after deletion was confirmed. */
  forgetBrowse(token: SessionCatalogBrowse, context: SessionSelectionContext, expected: SessionSummary): void {
    this.browses.forget(token, context, expected);
    this.cache.delete(expected.id);
    this.continuations.retire(token.id);
  }

  resolve(reference: string, options: SessionReferenceQuery = {}): Promise<SessionReferenceResolution> {
    const budget = sessionCatalogReadBudget(this.attemptBytes, options.signal);
    return resolveCatalogReference(this.layout, (id, signal, directory) => this.read(id, signal, directory, undefined, budget), reference, options);
  }

  async *list(context: SessionSelectionContext, signal?: AbortSignal, limit = 40,
    onSource?: (target: string) => void,
    onUnreadable?: (diagnostic: SessionCatalogDiagnostic) => void,
    query?: SessionCatalogQuery): AsyncGenerator<SessionCatalogSnapshot> {
    signal?.throwIfAborted();
    if (!Number.isInteger(limit) || limit < 1 || limit > 10_000) throw new RangeError('Invalid session listing limit.');
    if (query?.browse) { yield* this.listBrowse(context, query, signal, limit, onSource, onUnreadable); return; }
    const after = query?.after;
    const attempt = after ? this.continuations.claim(after) : undefined;
    // The quota spans pages; each read receives the current page's signal.
    // Retiring an earlier view must not cancel the next page's acquisition.
    const readBudget = attempt?.readBudget ?? sessionCatalogReadBudget(this.attemptBytes);
    const attemptId = after?.attemptId ?? randomUUID();
    const selection = query ? new SessionCatalogPage(context, limit, query, attemptId, attempt?.total,
      attempt?.indexTruncated) : undefined;
    let scanned = 0;
    let unreadable = attempt?.unreadable ?? 0;
    let limited = attempt?.limited ?? 0;
    let sourceLimited = false;
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
        const summary = await this.read(id, signal, directory, onSource, readBudget);
        if (summary) { scanned++; if (summary.quality === 'limited') limited++; }
        return summary;
      } catch (error) {
        signal?.throwIfAborted();
        if (error instanceof SessionCatalogReadLimitError) {
          sourceLimited = true;
          throw error;
        }
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
      if (query?.after) {
        try { selection!.assertBoundary(await this.read(query.after.boundary.id, signal, undefined, onSource, readBudget)); }
        catch (error) {
          if (!(error instanceof SessionCatalogReadLimitError)) throw error;
          sourceLimited = true;
        }
      }
      let current: SessionSummary | undefined;
      try { current = context.sessionId ? await read(context.sessionId) : undefined; }
      catch (error) {
        if (!(error instanceof SessionCatalogReadLimitError)) throw error;
        sourceLimited = true;
      }
      if (current) { recent = [current]; this.remember([current]); }
      if (current) selection?.accept(current);
      const snapshot = (status: SessionCatalogSnapshot['status']): SessionCatalogSnapshot => {
        const result: {
          readonly sessions: readonly SessionSummary[];
          readonly currentUnavailable?: string;
          readonly total?: number;
          readonly hasMore?: boolean;
          readonly continuation?: SessionCatalogContinuation;
        } = selection?.snapshot(status !== 'scanning') ?? sessionChoices(recent, context, limit);
        const { continuation, ...page } = result;
        return {
          ...page, scanned, unreadable, limited, status,
          ...(sourceLimited ? { sourceLimited: true, hasMore: false } : continuation ? { continuation } : {}),
        };
      };
      // The runtime identity is available before historical discovery starts.
      yield snapshot('scanning');
      if (attempt && after) {
        try {
          const entries = entriesAfter(attempt.entries, after.boundary).slice(0, limit + 1);
          const loaded = await this.readBatch(entries, signal, onSource, readBudget);
          for (const summary of loaded) {
            scanned++;
            if (summary.quality === 'limited') limited++;
            selection!.accept(summary);
          }
          signal?.throwIfAborted();
          selection!.assertBoundary(await this.read(after.boundary.id, signal, undefined, onSource, readBudget));
        } catch (error) {
          if (!(error instanceof SessionCatalogReadLimitError)) throw error;
          sourceLimited = true;
        }
        const page = selection!.snapshot(true);
        if (page.continuation) this.continuations.remember(page.continuation, attempt.entries, page.total,
          unreadable, limited, selection!.indexTruncated, readBudget);
        this.remember(page.sessions);
        yield snapshot(sourceLimited || unreadable || limited || selection!.indexTruncated ? 'partial' : 'complete');
        return;
      }
      try {
        for await (const page of scanCatalog(this.layout, context.sessionId, read, signal, onSource)) {
          if (page.unreadable > 0 && unreadableDirectories.size < CATALOG_LIMITS.diagnosticSamples) unreadableDirectories.add(page.directory);
          unreadable += page.unreadable;
          const loaded = page.summaries;
          if (selection) for (const summary of loaded) selection.accept(summary);
          else recent = sessionChoices([...recent, ...loaded], context, limit).sessions;
          // Retain even an out-of-scope/empty current record solely for its explanation.
          if (current && !recent.some(item => item.id === current.id)) recent = [...recent, current];
          yield snapshot('scanning');
        }
      } catch (error) {
        if (!(error instanceof SessionCatalogReadLimitError)) throw error;
        sourceLimited = true;
      }
      signal?.throwIfAborted();
      this.remember(selection?.snapshot(true).sessions ?? sessionChoices(recent, context, limit).sessions);
      const final = snapshot(sourceLimited || unreadable || limited || selection?.indexTruncated ? 'partial' : 'complete');
      if (selection && final.continuation) {
        const entries = attempt?.entries ?? selection.matchedBoundaries().slice().sort(compareSessionChoices);
        this.continuations.remember(final.continuation, entries,
          final.total ?? 0, unreadable, limited, selection.indexTruncated, readBudget);
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

  private async *listBrowse(context: SessionSelectionContext, query: SessionCatalogQuery, signal: AbortSignal | undefined,
    limit: number, onSource?: (target: string) => void,
    onUnreadable?: (diagnostic: SessionCatalogDiagnostic) => void): AsyncGenerator<SessionCatalogSnapshot> {
    const state = this.browses.get(query.browse!, context);
    const mutationRevision = state.mutationRevision;
    const assertCurrent = (): void => {
      this.browses.get(query.browse!, context);
      if (state.mutationRevision !== mutationRevision) throw new Error('Session browse changed. Reload its current page.');
    };
    const after = query.after;
    const selection = new SessionCatalogPage(context, limit, query, after?.attemptId ?? randomUUID());
    const attempt = after ? this.continuations.claim(after) : undefined;
    const read: typeof this.read = async (...args) => {
      try { return await this.read(...args); }
      finally { if (state.forgotten.has(args[0])) this.cache.delete(args[0]); }
    };
    this.browses.start(state, read, onSource);
    await waitForBrowse(state, signal, state.ready);
    assertCurrent();
    const provisional = new SessionCatalogPage(context, limit, query);
    const current = state.summaries.get(context.sessionId);
    if (current) {
      await this.validateBrowseSources([current], state, signal, onSource);
      provisional.accept(current);
    }
    if (after) selection.assertBoundary(await this.read(after.boundary.id, signal, undefined, onSource, state.budget,
      state.summaries.get(after.boundary.id)));
    signal?.throwIfAborted();
    assertCurrent();
    yield browseSnapshot(provisional, state, 'scanning');
    const accepted = new Set<string>();
    const validated = new Set<SessionSummary>();
    if (current) validated.add(current);
    try {
      while (!state.done) {
        const revision = state.progress.revision;
        for (const summary of state.summaries.values()) {
          signal?.throwIfAborted();
          if (!accepted.has(summary.id)) { accepted.add(summary.id); selection.accept(summary); }
        }
        await this.validateBrowseSources(selection.visibleSources(), state, signal, onSource, validated);
        assertCurrent();
        if (!state.done) yield browseSnapshot(selection, state, 'scanning');
        if (!state.done && revision === state.progress.revision) {
          await waitForBrowse(state, signal, Promise.race([state.build!, state.progress.changed]));
        }
      }
      await waitForBrowse(state, signal);
      assertCurrent();
      for (const summary of state.summaries.values()) {
        signal?.throwIfAborted();
        if (!accepted.has(summary.id)) { accepted.add(summary.id); selection.accept(summary); }
      }
      if (after) selection.assertBoundary(await this.read(after.boundary.id, signal, undefined, onSource, state.budget,
        state.summaries.get(after.boundary.id)));
      await this.validateBrowseSources(selection.visibleSources(), state, signal, onSource);
      if (after) selection.assertBoundary(await this.read(after.boundary.id, signal, undefined, onSource, state.budget,
        state.summaries.get(after.boundary.id)));
    } catch (error) {
      signal?.throwIfAborted();
      assertCurrent();
      if (!(error instanceof SessionCatalogReadLimitError)) throw error;
      state.sourceLimited = true;
      // No row whose live identity was not checked may be offered as selectable.
      yield { sessions: [], scanned: state.scanned, unreadable: state.unreadable, limited: state.limited,
        status: 'partial', sourceLimited: true, hasMore: false, total: selection.snapshot(false).total };
      return;
    }
    signal?.throwIfAborted();
    assertCurrent();
    const status = state.sourceLimited || state.indexTruncated || state.unreadable || state.limited ? 'partial' : 'complete';
    const final = browseSnapshot(selection, state, status);
    this.remember(final.sessions);
    if (final.continuation) {
      this.continuations.remember(final.continuation, attempt?.entries ?? selection.matchedBoundaries().slice().sort(compareSessionChoices),
        final.total ?? 0, state.unreadable, state.limited, state.indexTruncated, state.budget);
    }
    if (state.unreadableIds.size || state.unreadableDirectories.size) {
      try { onUnreadable?.({ unreadableSessionIds: [...state.unreadableIds], unreadableDirectories: [...state.unreadableDirectories] }); }
      catch { /* Diagnostics are observational. */ }
    }
    yield final;
  }

  private async validateBrowseSources(entries: readonly SessionSummary[], state: CatalogBrowseState,
    signal?: AbortSignal, onSource?: (target: string) => void, validated?: Set<SessionSummary>): Promise<void> {
    for (const expected of entries) {
      if (validated?.has(expected)) continue;
      signal?.throwIfAborted();
      const actual = await this.read(expected.id, signal, undefined, onSource, state.budget, expected);
      if (!actual || actual.id !== expected.id || actual.version !== expected.version
        || compareSessionChoices(actual, expected) !== 0 || actual.projectRoot !== expected.projectRoot
        || actual.reentry !== expected.reentry || actual.quality !== expected.quality) {
        throw new Error('Session page changed while browsing. Reopen the session picker to refresh.');
      }
      validated?.add(expected);
    }
  }

  private async readBatch(entries: readonly SessionCatalogBoundary[], signal?: AbortSignal,
    onSource?: (target: string) => void, readBudget?: SessionCatalogReadBudget): Promise<SessionSummary[]> {
    const loaded = new Array<SessionSummary>(entries.length);
    let next = 0;
    const worker = async (): Promise<void> => {
      while (next < entries.length) {
        const index = next++;
        const expected = entries[index]!;
        signal?.throwIfAborted();
        const summary = await this.read(expected.id, signal, undefined, onSource, readBudget);
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

  private async read(id: string, signal?: AbortSignal, directory?: string, onSource?: (target: string) => void,
    readBudget?: SessionCatalogReadBudget, resident?: SessionSummary): Promise<SessionSummary | undefined> {
    const before = await locateCatalogFiles(this.layout, id, signal, onSource);
    if (!before) { this.cache.delete(id); return undefined; }
    if (directory && before.layout.sessionDir !== path.join(directory, id)) return undefined;
    const cached = resident ?? this.cache.get(id);
    // A captured browse is a snapshot, not permission to replace a changed row.
    // Refuse before opening core files, including while four source reads run.
    if (resident && resident.version !== before.version) {
      throw new Error('Session page changed while browsing. Reopen the session picker to refresh.');
    }
    let summary = cached?.version === before.version ? cached : undefined;
    if (!summary) {
      const metadata = await readCatalogFile(before.layout.metadataPath, before.stats[0], CATALOG_LIMITS.metadataBytes, signal, readBudget);
      if (metadata === undefined) throw new Error('Session metadata exceeds the listing limit.');
      const state = await readCatalogFile(before.layout.statePath, before.stats[1], CATALOG_LIMITS.stateBytes, signal, readBudget);
      const transcript = await readCatalogFile(before.layout.transcriptPath, before.stats[2], CATALOG_LIMITS.transcriptBytes, signal, readBudget);
      summary = await decodeSessionSummary(id, metadata, state, transcript, before.version, signal);
    }
    const after = await locateCatalogFiles(this.layout, id, signal, onSource);
    if (after?.version !== before.version) { this.cache.delete(id); throw new Error('Session changed while listing.'); }
    signal?.throwIfAborted();
    readBudget?.check();
    // A long sequential scan must not evict every resident just before reaching it.
    // Cache hits refresh their version/order; new admissions use spare space.
    // Current and final visible results are retained explicitly by the query.
    if (cached || this.cache.size < CATALOG_LIMITS.cacheEntries) this.remember([summary]);
    return summary;
  }
}

function browseSnapshot(selection: SessionCatalogPage, state: CatalogBrowseState,
  status: SessionCatalogSnapshot['status']): SessionCatalogSnapshot {
  const { continuation, ...page } = selection.snapshot(status !== 'scanning');
  return { ...page, scanned: state.scanned, unreadable: state.unreadable, limited: state.limited, status,
    ...(state.sourceLimited ? { sourceLimited: true, hasMore: false }
      : continuation ? { continuation } : {}) };
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
