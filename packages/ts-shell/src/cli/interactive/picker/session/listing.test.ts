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
