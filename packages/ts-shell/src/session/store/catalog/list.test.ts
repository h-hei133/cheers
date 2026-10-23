import { afterEach, expect, it, vi } from 'vitest';
import { createSessionStoreLayout } from '../sessionFileLayout.js';
import { discoverSessions } from './discovery.js';
import { SessionCatalog } from './index.js';
import { CATALOG_LIMITS, type SessionCatalogQuery, type SessionCatalogSnapshot, type SessionSummary } from './model.js';

vi.mock('./discovery.js', () => ({ discoverSessions: vi.fn() }));
afterEach(() => vi.restoreAllMocks());
const context = { sessionId: 'current', projectRoot: '/workspace', busy: false };
const directory = '/synthetic/sessions';

function fixture(count: number, change?: (summary: SessionSummary) => SessionSummary) {
  vi.mocked(discoverSessions).mockImplementation(async function* () {
    for (let offset = 0; offset < count; offset += CATALOG_LIMITS.summaries) {
      yield { directory, ids: Array.from({ length: Math.min(CATALOG_LIMITS.summaries, count - offset) },
        (_, index) => `saved-${(offset + index).toString().padStart(5, '0')}`), unreadable: 0 };
    }
  });
  const catalog = new SessionCatalog(createSessionStoreLayout('/synthetic'));
  const read = vi.spyOn(catalog as unknown as { read: (id: string) => Promise<SessionSummary | undefined> }, 'read');
  read.mockImplementation(async id => {
    if (id === 'current') return undefined;
    const summary: SessionSummary = { id, projectRoot: '/workspace', titleComplete: true, createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z', reentry: 'available', quality: 'complete', version: `v-${id}` };
    return change?.(summary) ?? summary;
  });
  return { catalog, read };
}

async function finish(catalog: SessionCatalog, query: SessionCatalogQuery): Promise<SessionCatalogSnapshot> {
  let latest!: SessionCatalogSnapshot;
  for await (const snapshot of catalog.list(context, undefined, 40, undefined, undefined, query)) {
    expect(snapshot.sessions.length).toBeLessThanOrEqual(41);
    if (snapshot.status === 'scanning') expect(snapshot.continuation).toBeUndefined();
    latest = snapshot;
  }
  return latest;
}

it('finds an older match behind ten thousand newer nonmatches through the actual catalogue scan', async () => {
  const { catalog } = fixture(10_001, summary => summary.id === 'saved-10000'
    ? { ...summary, title: 'needle', updatedAt: '2020-01-01T00:00:00.000Z' } : summary);
  const result = await finish(catalog, { needle: 'needle' });
  expect(result).toMatchObject({ status: 'complete', total: 1, scanned: 10_001, hasMore: false });
  expect(result.sessions.map(summary => summary.id)).toEqual(['saved-10000']);
});

it('validates the boundary before and after a later live scan and rejects a changed anchor', async () => {
  const { catalog, read } = fixture(90);
  const first = await finish(catalog, { needle: '' });
  const after = first.continuation!;
  read.mockClear();
  const second = await finish(catalog, { needle: '', after });
  expect(second.sessions[0]?.id).toBe('saved-00040');
  expect(second.sessions.at(-1)?.id).toBe('saved-00079');
  expect(read.mock.calls[0]?.[0]).toBe(after.boundary.id);
  expect(read.mock.calls.at(-1)?.[0]).toBe(after.boundary.id);
  read.mockImplementation(async id => id === after.boundary.id ? undefined : second.sessions.find(summary => summary.id === id));
  await expect(finish(catalog, { needle: '', after })).rejects.toThrow(/page changed/);
});

it('keeps first-page partial status across a clean continuation page', async () => {
  const { catalog, read } = fixture(90);
  const original = read.getMockImplementation()!;
  read.mockImplementation(async id => {
    if (id === 'saved-00000') throw new Error('PRIVATE_SOURCE');
    const summary = await original(id);
    return id === 'saved-00001' && summary ? { ...summary, quality: 'limited' } : summary;
  });
  const first = await finish(catalog, { needle: '' });
  expect(first).toMatchObject({ status: 'partial', unreadable: 1, limited: 1 });
  expect(first.continuation).toBeDefined();

  const second = await finish(catalog, { needle: '', after: first.continuation! });
  expect(second).toMatchObject({ status: 'partial', unreadable: 1, limited: 1 });
});

it('bounds the retained browse index and reports the result as partial', async () => {
  const { catalog } = fixture(CATALOG_LIMITS.attemptEntries + 1);
  const result = await finish(catalog, { needle: '' });
  expect(result).toMatchObject({
    status: 'partial',
    total: CATALOG_LIMITS.attemptEntries + 1,
    hasMore: true,
  });
  expect(result.continuation).toBeDefined();
  const next = await finish(catalog, { needle: '', after: result.continuation! });
  expect(next).toMatchObject({
    status: 'partial',
    total: CATALOG_LIMITS.attemptEntries + 1,
    hasMore: true,
  });
  expect(next.continuation).toBeDefined();
});

it('rejects anchor changes discovered after the scan before issuing a continuation', async () => {
  const { catalog, read } = fixture(90);
  const first = await finish(catalog, { needle: '' });
  const after = first.continuation!;
  const original = read.getMockImplementation()!;
  let anchorReads = 0;
  read.mockImplementation(async id => {
    const summary = await original(id);
    if (id === after.boundary.id && ++anchorReads === 2 && summary) return { ...summary, version: 'changed' };
    return summary;
  });
  await expect(finish(catalog, { needle: '', after })).rejects.toThrow(/page changed/);
  expect(anchorReads).toBe(2);
});

it('bounds diagnostic samples while preserving the complete failure count', async () => {
  const { catalog, read } = fixture(300);
  read.mockRejectedValue(new Error('PRIVATE_SOURCE'));
  const diagnostic = vi.fn();
  let result!: SessionCatalogSnapshot;
  for await (const snapshot of catalog.list(context, undefined, 40, undefined, diagnostic, { needle: 'missing' })) result = snapshot;
  expect(result).toMatchObject({ status: 'partial', total: 0, unreadable: 301 });
  expect(diagnostic).toHaveBeenCalledOnce();
  expect(diagnostic.mock.calls[0]?.[0].unreadableSessionIds).toHaveLength(CATALOG_LIMITS.diagnosticSamples);
  expect(JSON.stringify(result)).not.toContain('PRIVATE_SOURCE');
});
