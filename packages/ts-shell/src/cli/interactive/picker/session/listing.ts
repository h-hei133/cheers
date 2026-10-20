import type { SessionManager } from '../../../../session/SessionManager.js';
import { sessionChoices, type SessionSelectionContext } from '../../../../session/navigation/selection.js';
import type { SessionCatalogSnapshot, SessionSummary } from '../../../../session/store/catalog/model.js';
import { SESSION_SIZE_BATCH, type SessionFileSize } from '../../../../session/store/files.js';

export interface SessionListingPage {
  readonly snapshot: SessionCatalogSnapshot;
  readonly sizes: ReadonlyMap<string, SessionFileSize>;
  readonly stopped?: boolean;
  /** Total matches before the requested result page is sliced. */
  readonly total?: number;
}

interface ListingRequest {
  readonly controller: AbortController;
  readonly iterator: AsyncGenerator<SessionCatalogSnapshot>;
  readonly release: () => void;
  readonly context: SessionSelectionContext;
  readonly limit: number;
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
    const requestLimit = Math.min(10_000, limit + 1);
    let iterator: AsyncGenerator<SessionCatalogSnapshot>;
    try { iterator = this.manager.catalog.list(context, controller.signal, requestLimit); }
    catch (error) { controller.abort(); release(); throw error; }
    const request: ListingRequest = { controller, iterator, release, context, limit, versions: new Map() };
    this.request = request;
    try {
      const first = await request.iterator.next();
      if (first.done) throw new Error('Session listing did not produce a result.');
      return this.displayPage(await this.project(request, first.value), request);
    } catch (error) {
      this.stop(request);
      throw error;
    }
  }

  /** Scan the complete authorized catalogue, then page only the matching rows. */
  async search(context: SessionSelectionContext, query: string, signal?: AbortSignal, limit = 40): Promise<SessionListingPage> {
    signal?.throwIfAborted();
    const needle = query.trim().toLowerCase();
    if (!needle) return this.load(context, signal, limit);
    let latest: SessionCatalogSnapshot | undefined;
    for await (const snapshot of this.manager.catalog.list(context, signal, 10_000)) {
      signal?.throwIfAborted();
      latest = snapshot;
    }
    signal?.throwIfAborted();
    if (!latest) throw new Error('Session search did not produce a result.');
    const matches = sessionChoices(
      latest.sessions.filter(session => sessionMatches(session, needle)),
      context,
      10_000,
    ).sessions;
    const visible = matches.slice(0, limit);
    const current = matches.find(session => session.id === context.sessionId);
    if (current && !visible.some(session => session.id === current.id)) visible.push(current);
    return {
      snapshot: { ...latest, sessions: visible },
      sizes: await this.sampleSizes(visible, signal),
      total: matches.length,
    };
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
        publish(this.displayPage(page, request));
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
    const page = { snapshot, sizes };
    request.page = page;
    return page;
  }

  private displayPage(page: SessionListingPage, request: ListingRequest): SessionListingPage {
    const sessions = page.snapshot.sessions;
    const visible = sessions.slice(0, request.limit);
    const current = sessions.find(session => session.id === request.context.sessionId);
    if (current && !visible.some(session => session.id === current.id)) visible.push(current);
    return {
      ...page,
      snapshot: { ...page.snapshot, sessions: visible },
      total: page.total ?? sessions.length,
    };
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
}

function sessionMatches(session: SessionSummary, needle: string): boolean {
  return [
    session.id,
    session.title ?? '',
    session.projectRoot,
    session.status ?? '',
    session.reentry,
    session.quality,
    session.preview?.prompt ?? '',
    session.preview?.answer ?? '',
  ]
    .some(value => value.toLowerCase().includes(needle));
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
