import type { SessionManager } from '../../../../session/SessionManager.js';
import type { SessionSelectionContext } from '../../../../session/navigation/selection.js';
import type { SessionCatalogSnapshot } from '../../../../session/store/catalog/model.js';
import type { SessionFileSize } from '../../../../session/store/files.js';

export interface SessionListingPage {
  readonly snapshot: SessionCatalogSnapshot;
  readonly sizes: ReadonlyMap<string, SessionFileSize>;
  readonly stopped?: boolean;
}

interface ListingRequest {
  readonly controller: AbortController;
  readonly iterator: AsyncGenerator<SessionCatalogSnapshot>;
  readonly release: () => void;
  versions: Map<string, string>;
  page?: SessionListingPage;
}

/** The picker subscription owns a single incremental store query and its cancellation. */
export class SessionListing {
  private request?: ListingRequest;

  constructor(private readonly manager: Pick<SessionManager, 'catalog' | 'files'>) {}

  async load(context: SessionSelectionContext, signal?: AbortSignal, limit = 40): Promise<SessionListingPage> {
    signal?.throwIfAborted();
    if (this.request) this.stop(this.request);
    const controller = new AbortController();
    const abort = (): void => controller.abort(signal?.reason);
    signal?.addEventListener('abort', abort, { once: true });
    const release = (): void => signal?.removeEventListener('abort', abort);
    controller.signal.addEventListener('abort', release, { once: true });
    let iterator: AsyncGenerator<SessionCatalogSnapshot>;
    try { iterator = this.manager.catalog.list(context, controller.signal, limit); }
    catch (error) { controller.abort(); release(); throw error; }
    const request: ListingRequest = { controller, iterator, release, versions: new Map() };
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

  subscribe(publish: (page: SessionListingPage) => void): () => void {
    const request = this.request;
    if (!request) return () => {};
    void this.follow(request, publish);
    return () => this.stop(request);
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
    const sampled = changed.length ? await this.manager.files.sizes(changed.map(session => session.id), signal) : new Map<string, SessionFileSize>();
    signal.throwIfAborted();
    const sizes = new Map<string, SessionFileSize>();
    for (const session of snapshot.sessions) {
      const size = sampled.get(session.id) ?? request.page?.sizes.get(session.id);
      if (size) sizes.set(session.id, size);
    }
    request.versions = new Map(snapshot.sessions.map(session => [session.id, session.version]));
    const page = { snapshot, sizes };
    request.page = page;
    return page;
  }

  private stop(request: ListingRequest): void {
    request.controller.abort();
    request.release();
    // Returning the generator drains dispatched work and closes its directory cursor.
    void request.iterator.return(undefined).catch(() => {});
  }
}

export function sessionListingStatus(page: SessionListingPage): string | undefined {
  const snapshot = page.snapshot;
  const notes: string[] = [];
  if (page.stopped) notes.push('Session listing stopped before completion. Reopen to retry.');
  else if (snapshot.status === 'scanning') notes.push(`Loading sessions: ${snapshot.scanned} checked; results are incomplete.`);
  if (snapshot.unreadable) notes.push(`${snapshot.unreadable} session sources could not be read.`);
  if (snapshot.limited) notes.push(`${snapshot.limited} previews are limited; opening rechecks the saved session.`);
  return notes.join(' ') || undefined;
}
