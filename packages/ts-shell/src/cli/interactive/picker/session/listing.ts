import type { SessionManager } from '../../../../session/SessionManager.js';
import type { SessionSelectionContext } from '../../../../session/navigation/selection.js';
import { CATALOG_LIMITS, type SessionCatalogContinuation, type SessionCatalogSnapshot, type SessionSummary } from '../../../../session/store/catalog/model.js';
import { SESSION_SIZE_BATCH, type SessionFileSize } from '../../../../session/store/files.js';

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
  versions: Map<string, string>;
  page?: SessionListingPage;
}

/** The picker subscription owns a single incremental store query and its cancellation. */
export class SessionListing {
  private request?: ListingRequest;
  private searchController?: AbortController;

  constructor(private readonly manager: Pick<SessionManager, 'catalog' | 'files'>) {}

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
      { needle: '', ...(after ? { after } : {}) }); }
    catch (error) { controller.abort(); release(); throw error; }
    const request: ListingRequest = { controller, iterator, release, context, versions: new Map() };
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

  /** Scan the complete authorized catalogue, then page only the matching rows. */
  async search(context: SessionSelectionContext, query: string, signal?: AbortSignal, limit = 40,
    after?: SessionCatalogContinuation): Promise<SessionListingPage> {
    signal?.throwIfAborted();
    const needle = query.trim().toLowerCase();
    if (!needle) return this.load(context, signal, limit);
    this.searchController?.abort();
    const controller = new AbortController();
    this.searchController = controller;
    const abort = (): void => controller.abort(signal?.reason);
    signal?.addEventListener('abort', abort, { once: true });
    let latest: SessionCatalogSnapshot | undefined;
    try {
      for await (const snapshot of this.manager.catalog.list(context, controller.signal, Math.min(CATALOG_LIMITS.pageSize, limit), undefined, undefined,
        { needle, ...(after ? { after } : {}) })) {
        controller.signal.throwIfAborted();
        latest = snapshot;
      }
      controller.signal.throwIfAborted();
      if (!latest) throw new Error('Session search did not produce a result.');
      const sizes = await this.sampleSizes(latest.sessions, controller.signal);
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
    return () => { if (this.request === request) this.close(); else this.stop(request); };
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
    const changed = snapshot.sessions.filter(session => request.versions.get(session.id) !== session.version);
    const sampled = await this.sampleSizes(changed, signal);
    signal.throwIfAborted();
    const sizes = new Map<string, SessionFileSize>();
    for (const session of snapshot.sessions) {
      const size = sampled.get(session.id) ?? request.page?.sizes.get(session.id);
      if (size) sizes.set(session.id, size);
    }
    request.versions = new Map(snapshot.sessions.map(session => [session.id, session.version]));
    const page = { snapshot, sizes, total: snapshot.total };
    request.page = page;
    return page;
  }

  private async sampleSizes(sessions: readonly SessionSummary[], signal?: AbortSignal): Promise<Map<string, SessionFileSize>> {
    const sampled = new Map<string, SessionFileSize>();
    for (let offset = 0; offset < sessions.length; offset += SESSION_SIZE_BATCH) {
      signal?.throwIfAborted();
      const batch = sessions.slice(offset, offset + SESSION_SIZE_BATCH);
      const sizes = await this.manager.files.sizes(batch.map(session => session.id), signal);
      for (const [id, size] of sizes) sampled.set(id, size);
    }
    return sampled;
  }

  private stop(request: ListingRequest): void {
    request.controller.abort();
    request.release();
    // Returning the generator drains dispatched work and closes its directory cursor.
    void request.iterator.return(undefined).catch(() => {});
  }

  close(): void {
    if (this.request) this.stop(this.request);
    this.request = undefined;
    this.searchController?.abort();
    this.searchController = undefined;
  }
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
