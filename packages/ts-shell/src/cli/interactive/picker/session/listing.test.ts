import { expect, it, vi } from 'vitest';
import type { SessionManager } from '../../../../session/SessionManager.js';
import type { SessionCatalogSnapshot, SessionSummary } from '../../../../session/store/catalog/model.js';
import type { SessionFileSize } from '../../../../session/store/files.js';
import { SESSION_SIZE_BATCH } from '../../../../session/store/files.js';
import { SessionListing, sessionListingStatus } from './listing.js';
import { SessionCatalogPage } from '../../../../session/store/catalog/query.js';
import type { SessionCatalogQuery } from '../../../../session/store/catalog/model.js';
import type { SessionSelectionContext } from '../../../../session/navigation/selection.js';

function project(snapshot: SessionCatalogSnapshot, context: SessionSelectionContext, limit: number, query?: SessionCatalogQuery): SessionCatalogSnapshot {
  if (!query) return snapshot;
  const page = new SessionCatalogPage(context, limit, query);
  snapshot.sessions.forEach(session => page.accept(session));
  return { ...snapshot, ...page.snapshot(true) };
}

function summary(index: number): SessionSummary {
  const stamp = new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString();
  return {
    id: `session-${index.toString().padStart(5, '0')}`,
    projectRoot: '/workspace',
    title: `Session ${index}`,
    titleComplete: true,
    createdAt: stamp,
    updatedAt: stamp,
    reentry: 'available',
    quality: 'complete',
    version: `version-${index}`,
  };
}

it('samples only the fixed visible page and matching current from ten thousand sessions', async () => {
  const sessions = Array.from({ length: 10_000 }, (_, index) => summary(index));
  const snapshot: SessionCatalogSnapshot = {
    sessions,
    scanned: sessions.length,
    unreadable: 0,
    limited: 0,
    status: 'complete',
  };
  const calls: number[] = [];
  const size = (id: string): SessionFileSize => ({ status: 'complete', bytes: id.length, sampledAt: '2026-01-01T00:00:00.000Z' });
  const manager = {
    catalog: {
      beginBrowse: vi.fn(() => ({ id: 'test-browse' })), retireBrowse: vi.fn(),
      async *list(context: SessionSelectionContext, _signal: unknown, limit: number, _source: unknown, _diagnostic: unknown, query?: SessionCatalogQuery) {
        yield project(snapshot, context, limit, query);
      },
    },
    files: {
      async sizes(ids: readonly string[]) {
        calls.push(ids.length);
        return new Map(ids.map(id => [id, size(id)]));
      },
    },
  } as unknown as Pick<SessionManager, 'catalog' | 'files'>;

  const listing = new SessionListing(manager);
  const page = await listing.load({ sessionId: 'session-00000', projectRoot: '/workspace', busy: false }, undefined, 10_000);

  expect(page.snapshot.sessions).toHaveLength(41);
  expect(page.sizes.size).toBe(41);
  expect(page.total).toBe(10_000);
  expect(calls.length).toBe(Math.ceil(41 / SESSION_SIZE_BATCH));
  expect(Math.max(...calls)).toBe(SESSION_SIZE_BATCH);
  expect(calls.every(count => count > 0)).toBe(true);
});

it('searches beyond the first page across the complete authorized snapshot', async () => {
  const sessions = Array.from({ length: 100 }, (_, index) => summary(index));
  const snapshot: SessionCatalogSnapshot = {
    sessions,
    scanned: sessions.length,
    unreadable: 0,
    limited: 0,
    status: 'complete',
  };
  const limits: number[] = [];
  const sampled: string[][] = [];
  const manager = {
    catalog: {
      beginBrowse: vi.fn(() => ({ id: 'test-browse' })), retireBrowse: vi.fn(),
      async *list(context: SessionSelectionContext, _signal?: AbortSignal, limit = 40, _source?: unknown, _diagnostic?: unknown, query?: SessionCatalogQuery) {
        limits.push(limit);
        yield project(snapshot, context, limit, query);
      },
    },
    files: {
      async sizes(ids: readonly string[]) {
        sampled.push([...ids]);
        return new Map(ids.map(id => [id, { status: 'complete' as const, bytes: 1, sampledAt: '2026-01-01T00:00:00.000Z' }]));
      },
    },
  } as unknown as Pick<SessionManager, 'catalog' | 'files'>;

  const page = await new SessionListing(manager).search(
    { sessionId: 'session-00000', projectRoot: '/workspace', busy: false },
    'session-00075',
    undefined,
    40,
  );

  expect(limits).toEqual([40]);
  expect(page.snapshot.sessions.map(session => session.id)).toEqual(['session-00075']);
  expect(page.total).toBe(1);
  expect(sampled).toEqual([['session-00075']]);
});

it('keeps the current match visible beyond the search page', async () => {
  const sessions = Array.from({ length: 45 }, (_, index) => summary(index));
  const snapshot: SessionCatalogSnapshot = {
    sessions,
    scanned: sessions.length,
    unreadable: 0,
    limited: 0,
    status: 'complete',
  };
  const manager = {
    catalog: {
      beginBrowse: vi.fn(() => ({ id: 'test-browse' })), retireBrowse: vi.fn(),
      async *list(context: SessionSelectionContext, _signal: unknown, limit: number, _source: unknown, _diagnostic: unknown, query?: SessionCatalogQuery) {
        yield project(snapshot, context, limit, query);
      },
    },
    files: {
      async sizes(ids: readonly string[]) {
        return new Map(ids.map(id => [id, { status: 'complete' as const, bytes: 1, sampledAt: '2026-01-01T00:00:00.000Z' }]));
      },
    },
  } as unknown as Pick<SessionManager, 'catalog' | 'files'>;

  const page = await new SessionListing(manager).search(
    { sessionId: 'session-00000', projectRoot: '/workspace', busy: false },
    'Session',
    undefined,
    40,
  );
  expect(page.snapshot.sessions).toHaveLength(41);
  expect(page.snapshot.sessions.at(-1)?.id).toBe('session-00000');
  expect(page.total).toBe(45);
});

it('preserves partial search status instead of claiming the catalogue is complete', async () => {
  const snapshot: SessionCatalogSnapshot = {
    sessions: [summary(0)],
    scanned: 100,
    unreadable: 2,
    limited: 1,
    status: 'partial',
  };
  const manager = {
    catalog: {
      beginBrowse: vi.fn(() => ({ id: 'test-browse' })), retireBrowse: vi.fn(),
      async *list(context: SessionSelectionContext, _signal: unknown, limit: number, _source: unknown, _diagnostic: unknown, query?: SessionCatalogQuery) {
        yield project(snapshot, context, limit, query);
      },
    },
    files: {
      async sizes() {
        return new Map();
      },
    },
  } as unknown as Pick<SessionManager, 'catalog' | 'files'>;

  const page = await new SessionListing(manager).search(
    { sessionId: 'session-00000', projectRoot: '/workspace', busy: false },
    'not-present',
  );
  expect(page.snapshot.status).toBe('partial');
  expect(page.total).toBe(0);
});

it('stops dispatching size batches after cancellation', async () => {
  const sessions = Array.from({ length: SESSION_SIZE_BATCH * 3 }, (_, index) => summary(index));
  const snapshot: SessionCatalogSnapshot = {
    sessions,
    scanned: sessions.length,
    unreadable: 0,
    limited: 0,
    status: 'complete',
  };
  const controller = new AbortController();
  const sizes = vi.fn(async (ids: readonly string[]) => {
    controller.abort();
    return new Map(ids.map(id => [id, { status: 'complete' as const, bytes: 1, sampledAt: '2026-01-01T00:00:00.000Z' }]));
  });
  const manager = {
    catalog: {
      beginBrowse: vi.fn(() => ({ id: 'test-browse' })), retireBrowse: vi.fn(),
      async *list(context: SessionSelectionContext, _signal: unknown, limit: number, _source: unknown, _diagnostic: unknown, query?: SessionCatalogQuery) {
        yield project(snapshot, context, limit, query);
      },
    },
    files: { sizes },
  } as unknown as Pick<SessionManager, 'catalog' | 'files'>;

  await expect(new SessionListing(manager).load(
    { sessionId: 'session-00000', projectRoot: '/workspace', busy: false },
    controller.signal,
    10_000,
  )).rejects.toMatchObject({ name: 'AbortError' });
  expect(sizes).toHaveBeenCalledOnce();
});

it('shows confirmed page end separately from an exhausted partial scan', () => {
  const snapshot: SessionCatalogSnapshot = { sessions: [summary(0)], scanned: 1, unreadable: 0, limited: 0,
    total: 1, hasMore: false, status: 'complete' };
  expect(sessionListingStatus({ snapshot, sizes: new Map() })).toContain('End of this session page range');
  const partial = { ...snapshot, status: 'partial' as const, unreadable: 1 };
  expect(sessionListingStatus({ snapshot: partial, sizes: new Map() })).toContain('end is unconfirmed');
  expect(sessionListingStatus({ snapshot: partial, sizes: new Map() })).not.toContain('End of this session page range');
});

it('reports an attempt source-budget stop without implying a complete scan', () => {
  const snapshot: SessionCatalogSnapshot = { sessions: [], scanned: 12, unreadable: 0, limited: 0,
    sourceLimited: true, status: 'partial' };
  const status = sessionListingStatus({ snapshot, sizes: new Map() });
  expect(status).toContain('source budget');
  expect(status).not.toContain('End of this session page range');
});

it('shares one browse across load, repeated needles, clearing and next-page ownership', async () => {
  const context = { sessionId: 'session-00000', projectRoot: '/workspace', busy: false };
  const snapshot: SessionCatalogSnapshot = { sessions: Array.from({ length: 45 }, (_, index) => summary(index)),
    scanned: 45, unreadable: 0, limited: 0, status: 'complete' };
  const token = { id: 'owned-browse' };
  const beginBrowse = vi.fn(() => token); const retireBrowse = vi.fn();
  const queries: SessionCatalogQuery[] = [];
  const sizes = vi.fn(async (ids: readonly string[]) => new Map(ids.map(id => [id,
    { status: 'complete' as const, bytes: 1, sampledAt: '2026-01-01T00:00:00Z' }])));
  const manager = { catalog: { beginBrowse, retireBrowse,
    async *list(scope: SessionSelectionContext, _signal: AbortSignal, limit: number, _source: unknown,
      _diagnostic: unknown, query: SessionCatalogQuery) {
      queries.push(query); yield project(snapshot, scope, limit, query);
    } }, files: { sizes } } as unknown as Pick<SessionManager, 'catalog' | 'files'>;
  const listing = new SessionListing(manager);
  const base = await listing.load(context);
  const unsubscribe = listing.subscribe(vi.fn());
  await listing.search(context, 'Session');
  await listing.search(context, 'session-00044');
  await listing.search(context, '');
  expect(beginBrowse).toHaveBeenCalledOnce();
  expect(queries.every(query => query.browse === token)).toBe(true);
  const transferred = listing.takeBrowse();
  listing.close(); unsubscribe();
  expect(retireBrowse).not.toHaveBeenCalled();
  const next = new SessionListing(manager, transferred);
  const second = await next.load(context, undefined, 40, base.snapshot.continuation);
  expect(second.snapshot.sessions.map(session => session.id)).toContain('session-00000');
  expect(beginBrowse).toHaveBeenCalledOnce();
  expect(sizes.mock.calls.flatMap(([ids]) => ids)).toHaveLength(45);
  next.close();
  expect(retireBrowse).toHaveBeenCalledOnce();
  expect(retireBrowse).toHaveBeenCalledWith(token);
});

it('cancels only the pending search wait and retires the shared source on final close', async () => {
  const context = { sessionId: 'session-00000', projectRoot: '/workspace', busy: false };
  let ready!: () => void; const entered = new Promise<void>(resolve => { ready = resolve; });
  const beginBrowse = vi.fn(() => ({ id: 'live-browse' })); const retireBrowse = vi.fn();
  const manager = { catalog: { beginBrowse, retireBrowse,
    async *list(_scope: unknown, signal: AbortSignal) {
      ready();
      await new Promise<void>((_, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
      yield { sessions: [], scanned: 0, unreadable: 0, limited: 0, status: 'scanning' };
    } }, files: { sizes: vi.fn() } } as unknown as Pick<SessionManager, 'catalog' | 'files'>;
  const listing = new SessionListing(manager); const controller = new AbortController();
  const pending = listing.search(context, 'missing', controller.signal);
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  await entered; controller.abort(); await rejected;
  expect(retireBrowse).not.toHaveBeenCalled();
  listing.close(); expect(retireBrowse).toHaveBeenCalledOnce();
});

it('retires the previous source before a changed project or current identity can query', async () => {
  let nextId = 0;
  const beginBrowse = vi.fn(() => ({ id: `browse-${nextId++}` })); const retireBrowse = vi.fn();
  const manager = { catalog: { beginBrowse, retireBrowse,
    async *list() { yield { sessions: [], scanned: 0, unreadable: 0, limited: 0, status: 'complete' }; }
  }, files: { sizes: async () => new Map() } } as unknown as Pick<SessionManager, 'catalog' | 'files'>;
  const listing = new SessionListing(manager);
  await listing.load({ sessionId: 'current', projectRoot: '/workspace', busy: false });
  await listing.load({ sessionId: 'changed', projectRoot: '/other', busy: false });
  expect(beginBrowse).toHaveBeenCalledTimes(2); expect(retireBrowse).toHaveBeenCalledOnce();
  listing.close(); expect(retireBrowse).toHaveBeenCalledTimes(2);
});
