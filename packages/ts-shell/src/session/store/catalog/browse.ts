import { randomUUID } from 'node:crypto';
import { normalizePathIdentity } from '../../continuation/roots.js';
import type { SessionSelectionContext } from '../../navigation/selection.js';
import { assertSessionStoreProfile, type SessionStoreLayout } from '../sessionFileLayout.js';
import { sessionCatalogReadBudget, SessionCatalogReadLimitError, type SessionCatalogReadBudget } from './files.js';
import { CATALOG_LIMITS, type SessionCatalogBrowse, type SessionSummary } from './model.js';
import { scanCatalog } from './scan.js';
import { CatalogProgress } from './progress.js';

export interface CatalogBrowseState {
  readonly token: SessionCatalogBrowse;
  readonly context: SessionSelectionContext;
  readonly controller: AbortController;
  readonly budget: SessionCatalogReadBudget;
  readonly summaries: Map<string, SessionSummary>;
  readonly forgotten: Set<string>;
  readonly unreadableIds: Set<string>;
  readonly unreadableDirectories: Set<string>;
  readonly ready: Promise<void>;
  readonly publishCurrent: () => void;
  readonly progress: CatalogProgress;
  scanned: number;
  unreadable: number;
  limited: number;
  sourceLimited: boolean;
  indexTruncated: boolean;
  done: boolean;
  mutationRevision: number;
  build?: Promise<void>;
}

export type CatalogRead = (id: string, signal?: AbortSignal, directory?: string, onSource?: (target: string) => void,
  budget?: SessionCatalogReadBudget, resident?: SessionSummary) => Promise<SessionSummary | undefined>;

function contextKey(context: SessionSelectionContext): string {
  return JSON.stringify([context.sessionId, normalizePathIdentity(context.projectRoot), context.allProjects === true]);
}

/** The picker lifetime owns acquisition; individual queries own only their wait. */
export class CatalogBrowses {
  private readonly states = new Map<string, CatalogBrowseState>();

  constructor(private readonly layout: SessionStoreLayout, private readonly limit: number) {}

  begin(context: SessionSelectionContext): SessionCatalogBrowse {
    assertSessionStoreProfile(this.layout);
    const token = Object.freeze({ id: randomUUID() });
    let publishCurrent!: () => void;
    const ready = new Promise<void>(resolve => { publishCurrent = resolve; });
    this.states.set(token.id, { token, context: { ...context }, controller: new AbortController(),
      budget: sessionCatalogReadBudget(this.limit), summaries: new Map(), forgotten: new Set(), unreadableIds: new Set(), unreadableDirectories: new Set(),
      ready, publishCurrent, progress: new CatalogProgress(), scanned: 0, unreadable: 0, limited: 0, sourceLimited: false, indexTruncated: false, done: false, mutationRevision: 0 });
    return token;
  }

  get(token: SessionCatalogBrowse, context: SessionSelectionContext): CatalogBrowseState {
    assertSessionStoreProfile(this.layout);
    const state = this.states.get(token.id);
    if (!state || state.token !== token || contextKey(state.context) !== contextKey(context)) {
      throw new Error('Session browse expired or changed project. Reopen the session picker.');
    }
    state.controller.signal.throwIfAborted();
    return state;
  }

  retire(token: SessionCatalogBrowse): boolean {
    const state = this.states.get(token.id);
    if (state?.token !== token) return false;
    this.states.delete(token.id);
    state.controller.abort(new Error('Session browse retired. Reopen the session picker.'));
    state.summaries.clear();
    return true;
  }

  /** Retains the source and its consumed budget after a confirmed deletion. */
  forget(token: SessionCatalogBrowse, context: SessionSelectionContext, expected: SessionSummary): void {
    const state = this.get(token, context);
    if (state.summaries.get(expected.id) !== expected) throw new Error('Session browse selection changed. Reopen the session picker.');
    state.summaries.delete(expected.id);
    state.forgotten.add(expected.id);
    state.mutationRevision++;
    state.progress.publish();
  }

  start(state: CatalogBrowseState, read: CatalogRead, onSource?: (target: string) => void): void {
    if (state.build) return;
    state.build = captureBrowse(this.layout, state, read, onSource);
    // The source owner observes settlement even when every query detaches.
    void state.build.catch(() => undefined);
  }
}

async function captureBrowse(layout: SessionStoreLayout, state: CatalogBrowseState, read: CatalogRead,
  onSource?: (target: string) => void): Promise<void> {
  const signal = state.controller.signal;
  let pending = 0;
  const observe = (target: string): void => {
    try { onSource?.(target); } catch { /* A detached query observer does not own source acquisition. */ }
  };
  const acquire = async (id: string, directory?: string): Promise<SessionSummary | undefined> => {
    if (state.summaries.has(id) || state.forgotten.has(id)) return undefined;
    if (state.summaries.size + state.forgotten.size + pending >= CATALOG_LIMITS.attemptEntries) {
      state.indexTruncated = true;
      throw new SessionCatalogReadLimitError('Session catalogue entry limit reached.');
    }
    pending++;
    try {
      const summary = await read(id, signal, directory, observe, state.budget);
      signal.throwIfAborted();
      if (state.forgotten.has(id)) return undefined;
      if (summary) {
        state.summaries.set(id, summary); state.scanned++;
        if (summary.quality === 'limited') state.limited++;
      }
      return summary;
    } catch (error) {
      signal.throwIfAborted();
      if (state.forgotten.has(id)) return undefined;
      if (error instanceof SessionCatalogReadLimitError) throw error;
      state.unreadable++;
      if (id !== state.context.sessionId && state.unreadableIds.size < CATALOG_LIMITS.diagnosticSamples) state.unreadableIds.add(id);
      return undefined;
    } finally { pending--; }
  };
  try {
    try { if (state.context.sessionId) await acquire(state.context.sessionId); }
    finally { state.publishCurrent(); }
    for await (const batch of scanCatalog(layout, state.context.sessionId, acquire, signal, observe)) {
      state.unreadable += batch.unreadable;
      if (batch.unreadable && state.unreadableDirectories.size < CATALOG_LIMITS.diagnosticSamples) state.unreadableDirectories.add(batch.directory);
      state.progress.publish();
    }
  } catch (error) {
    signal.throwIfAborted();
    if (!(error instanceof SessionCatalogReadLimitError)) throw error;
    state.sourceLimited = !state.indexTruncated;
  }
  signal.throwIfAborted();
  state.done = true;
  state.progress.publish();
}

/** A query can detach promptly while the shared source keeps its own controller. */
export async function waitForBrowse(state: CatalogBrowseState, signal?: AbortSignal,
  pending: Promise<void> | undefined = state.build): Promise<void> {
  signal?.throwIfAborted();
  if (!signal) { await pending; return; }
  let cancel: (() => void) | undefined;
  try {
    await Promise.race([pending, new Promise<never>((_, reject) => {
      cancel = () => reject(signal.reason);
      signal.addEventListener('abort', cancel, { once: true });
      if (signal.aborted) cancel();
    })]);
  } finally { if (cancel) signal.removeEventListener('abort', cancel); }
  signal.throwIfAborted();
}
