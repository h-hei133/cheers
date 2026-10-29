import type { SessionManager } from '../../../../session/SessionManager.js';
import type { SessionSelectionContext } from '../../../../session/navigation/selection.js';
import { CATALOG_LIMITS, type SessionCatalogBrowse, type SessionCatalogContinuation, type SessionCatalogSnapshot, type SessionSummary } from '../../../../session/store/catalog/model.js';
import { SESSION_SIZE_BATCH, type SessionFileSize } from '../../../../session/store/files.js';
import { normalizePathIdentity } from '../../../../session/continuation/roots.js';

export interface SessionListingPage {
  readonly snapshot: SessionCatalogSnapshot;
  readonly sizes: ReadonlyMap<string, SessionFileSize>;
  readonly stopped?: boolean;
  /** Matches checked so far; a scanning result is not a complete count. */
  readonly total?: number;
}

interface ListingRequest {
  readonly controller: AbortController;
  readonly iterator: AsyncGenerator<SessionCatalogSnapshot>;
  readonly release: () => void;
  readonly context: SessionSelectionContext;
  page?: SessionListingPage;
}

interface CachedSize { readonly version: string; readonly size: SessionFileSize }

/** Transferred only when the current picker admits its next page. */
export interface SessionListingBrowse {
  readonly token: SessionCatalogBrowse;
  readonly context: SessionSelectionContext;
  readonly sizes: Map<string, CachedSize>;
}

/** Owns a browse source; individual queries and subscriptions only own their waits. */
export class SessionListing {
  private request?: ListingRequest;
  private searchController?: AbortController;
  private browse?: SessionListingBrowse;

  constructor(private readonly manager: Pick<SessionManager, 'catalog' | 'files'>, browse?: SessionListingBrowse) {
    this.browse = browse;
  }

  async load(context: SessionSelectionContext, signal?: AbortSignal, limit = 40,
    after?: SessionCatalogContinuation): Promise<SessionListingPage> {
    signal?.throwIfAborted();
    if (this.request) this.stop(this.request);
    const controller = new AbortController();
    const abort = (): void => controller.abort(signal?.reason);
    signal?.addEventListener('abort', abort, { once: true });
    const release = (): void => signal?.removeEventListener('abort', abort);
    controller.signal.addEventListener('abort', release, { once: true });
    this.searchController?.abort();
    let iterator: AsyncGenerator<SessionCatalogSnapshot>;
    try { iterator = this.manager.catalog.list(context, controller.signal, Math.min(CATALOG_LIMITS.pageSize, limit), undefined, undefined,
      { needle: '', browse: this.source(context).token, ...(after ? { after } : {}) }); }
    catch (error) { controller.abort(); release(); throw error; }
    const request: ListingRequest = { controller, iterator, release, context };
    this.request = request;
    try {
      const first = await request.iterator.next();
      if (first.done) throw new Error('Session listing did not produce a result.');
      return await this.project(request, first.value);
    } catch (error) {
      this.stop(request);
      throw error;
    }
  }

  /** Filter the shared authorized browse index, then sample only its visible matches. */
  async search(context: SessionSelectionContext, query: string, signal?: AbortSignal, limit = 40,
    after?: SessionCatalogContinuation): Promise<SessionListingPage> {
    signal?.throwIfAborted();
    const needle = query.trim().toLowerCase();
    if (!needle) return this.load(context, signal, limit);
    const browse = this.source(context);
    this.searchController?.abort();
    const controller = new AbortController();
    this.searchController = controller;
    const abort = (): void => controller.abort(signal?.reason);
    signal?.addEventListener('abort', abort, { once: true });
    let latest: SessionCatalogSnapshot | undefined;
    try {
      for await (const snapshot of this.manager.catalog.list(context, controller.signal, Math.min(CATALOG_LIMITS.pageSize, limit), undefined, undefined,
        { needle, browse: browse.token, ...(after ? { after } : {}) })) {
        controller.signal.throwIfAborted();
        latest = snapshot;
      }
      controller.signal.throwIfAborted();
      if (!latest) throw new Error('Session search did not produce a result.');
      const sizes = await this.sampleSizes(latest.sessions, controller.signal, browse);
      controller.signal.throwIfAborted();
      return { snapshot: latest, sizes, total: latest.total };
    } finally {
      signal?.removeEventListener('abort', abort);
      if (this.searchController === controller) this.searchController = undefined;
    }
  }

  subscribe(publish: (page: SessionListingPage) => void): () => void {
    const request = this.request;
    if (!request) return () => {};
    void this.follow(request, publish);
    return () => {
      this.stop(request);
      if (this.request === request) this.request = undefined;
    };
  }

  private async follow(request: ListingRequest, publish: (page: SessionListingPage) => void): Promise<void> {
    try {
      for await (const snapshot of request.iterator) {
        const page = await this.project(request, snapshot);
        if (this.request !== request || request.controller.signal.aborted) return;
        publish(page);
      }
    } catch {
      if (this.request === request && !request.controller.signal.aborted && request.page) publish({ ...request.page, stopped: true });
    } finally {
      request.release();
    }
  }

  private async project(request: ListingRequest, snapshot: SessionCatalogSnapshot): Promise<SessionListingPage> {
    const signal = request.controller.signal;
    signal.throwIfAborted();
    const sizes = await this.sampleSizes(snapshot.sessions, signal, this.source(request.context));
    signal.throwIfAborted();
    const page = { snapshot, sizes, total: snapshot.total };
    request.page = page;
    return page;
  }

  private async sampleSizes(sessions: readonly SessionSummary[], signal: AbortSignal | undefined,
    browse: SessionListingBrowse): Promise<Map<string, SessionFileSize>> {
    const sampled = new Map<string, SessionFileSize>();
    const changed = sessions.filter(session => browse.sizes.get(session.id)?.version !== session.version);
    for (let offset = 0; offset < changed.length; offset += SESSION_SIZE_BATCH) {
      signal?.throwIfAborted();
      const batch = changed.slice(offset, offset + SESSION_SIZE_BATCH);
      const sizes = await this.manager.files.sizes(batch.map(session => session.id), signal);
      signal?.throwIfAborted();
      for (const session of batch) {
        const size = sizes.get(session.id);
        if (!size) continue;
        browse.sizes.delete(session.id);
        browse.sizes.set(session.id, { version: session.version, size });
        while (browse.sizes.size > CATALOG_LIMITS.cacheEntries) browse.sizes.delete(browse.sizes.keys().next().value!);
      }
    }
    for (const session of sessions) {
      const cached = browse.sizes.get(session.id);
      if (cached?.version === session.version) sampled.set(session.id, cached.size);
    }
    return sampled;
  }

  private source(context: SessionSelectionContext): SessionListingBrowse {
    if (this.browse && !sameContext(this.browse.context, context)) this.close();
    return this.browse ??= { token: this.manager.catalog.beginBrowse(context), context: { ...context }, sizes: new Map() };
  }

  private stop(request: ListingRequest): void {
    request.controller.abort();
    request.release();
    // Returning the generator drains dispatched work and closes its directory cursor.
    void request.iterator.return(undefined).catch(() => {});
  }

  cancelQueries(): void {
    if (this.request) this.stop(this.request);
    this.request = undefined;
    this.searchController?.abort();
    this.searchController = undefined;
  }

  cancelSearch(): void {
    this.searchController?.abort();
    this.searchController = undefined;
  }

  takeBrowse(): SessionListingBrowse | undefined {
    this.cancelQueries();
    const browse = this.browse;
    this.browse = undefined;
    return browse;
  }

  close(): void {
    this.cancelQueries();
    if (this.browse) this.manager.catalog.retireBrowse(this.browse.token);
    this.browse = undefined;
  }
}

function sameContext(expected: SessionSelectionContext, current: SessionSelectionContext): boolean {
  return expected.sessionId === current.sessionId
    && normalizePathIdentity(expected.projectRoot) === normalizePathIdentity(current.projectRoot)
    && (expected.allProjects === true) === (current.allProjects === true);
}

export function sessionListingStatus(page: SessionListingPage): string | undefined {
  const snapshot = page.snapshot;
  const notes: string[] = [];
  if (page.stopped) notes.push('Session listing stopped before completion. Reopen to retry.');
  else if (snapshot.status === 'scanning') notes.push(`Loading sessions: ${snapshot.scanned} checked; results are incomplete.`);
  if (snapshot.unreadable) notes.push(`${snapshot.unreadable} session sources could not be read.`);
  if (snapshot.limited) notes.push(`${snapshot.limited} previews are limited; opening rechecks the saved session.`);
  if (snapshot.sourceLimited) notes.push('Session browsing reached its source budget; reopen to refresh the page range.');
  if (!page.stopped && snapshot.status === 'complete' && snapshot.hasMore === false) {
    notes.push('End of this session page range. Reopen to refresh saved sessions.');
  }
  if (snapshot.status === 'partial') notes.push('Scan exhausted with incomplete sources; the end is unconfirmed.');
  return notes.join(' ') || undefined;
}
