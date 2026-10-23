import { expect, it } from 'vitest';
import { SessionCatalogPage } from './query.js';
import type { SessionCatalogContinuation, SessionSummary } from './model.js';

const context = { sessionId: 'current', projectRoot: '/workspace', busy: false };
function summary(id: string, overrides: Partial<SessionSummary> = {}): SessionSummary {
  return { id, projectRoot: '/workspace', titleComplete: true, createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z', reentry: 'available', quality: 'complete', version: `v-${id}`, ...overrides };
}

it('filters older matching sources before retention and never issues a provisional continuation', () => {
  const page = new SessionCatalogPage(context, 40, { needle: 'needle' });
  for (let index = 0; index < 10_001; index++) {
    page.accept(summary(`new-${index}`));
    expect(page.snapshot(false).continuation).toBeUndefined();
  }
  page.accept(summary('old', { title: 'needle', updatedAt: '2020-01-01T00:00:00.000Z' }));
  expect(page.snapshot(true)).toMatchObject({ sessions: [expect.objectContaining({ id: 'old' })], total: 1, hasMore: false });
});

it('uses ordinary page rows as boundaries before separately appending current', () => {
  const page = new SessionCatalogPage(context, 2, { needle: '' });
  const current = summary('current', { updatedAt: '2020-01-01T00:00:00.000Z' });
  [current, summary('c'), summary('b'), summary('a', { pinned: true })].forEach(item => page.accept(item));
  expect(page.snapshot(false)).toMatchObject({ sessions: [{ id: 'a' }, { id: 'b' }, { id: 'current' }], hasMore: true });
  expect(page.snapshot(false).continuation).toBeUndefined();
  const next = page.snapshot(true).continuation!;
  expect(next.boundary.id).toBe('b');
  const second = new SessionCatalogPage(context, 2, { needle: '', after: next });
  second.assertBoundary(summary('b'));
  [summary('a', { pinned: true }), current, summary('c'), summary('b')].forEach(item => second.accept(item));
  expect(second.snapshot(true).sessions.map(item => item.id)).toEqual(['c', 'current']);
});

it.each(['query', 'session', 'project', 'all-projects', 'limit'])('refuses a continuation after %s changes', change => {
  const page = new SessionCatalogPage(context, 2, { needle: 'needle' });
  ['a', 'b', 'c'].forEach(id => page.accept(summary(id, { title: 'needle' })));
  const after = page.snapshot(true).continuation!;
  const changed = { ...context };
  if (change === 'session') changed.sessionId = 'other';
  if (change === 'project') changed.projectRoot = '/other';
  expect(() => new SessionCatalogPage({ ...changed, ...(change === 'all-projects' ? { allProjects: true } : {}) },
    change === 'limit' ? 3 : 2, { needle: change === 'query' ? 'other' : 'needle', after })).toThrow(/no longer matches/);
});

it.each(['missing', 'version', 'pin', 'timestamp', 'scope'])('refuses a %s boundary', change => {
  const page = new SessionCatalogPage(context, 1, { needle: '' });
  page.accept(summary('a')); page.accept(summary('b'));
  const after = page.snapshot(true).continuation!;
  const next = new SessionCatalogPage(context, 1, { needle: '', after });
  const target = summary('a', { ...(change === 'version' ? { version: 'new' } : {}), ...(change === 'pin' ? { pinned: true } : {}),
    ...(change === 'timestamp' ? { updatedAt: '2025-01-01T00:00:00.000Z' } : {}), ...(change === 'scope' ? { projectRoot: '/other' } : {}) });
  expect(() => next.assertBoundary(change === 'missing' ? undefined : target)).toThrow(/changed while browsing/);
});

it('keeps page retention fixed through more than ten thousand matches with timestamp and pin ties', () => {
  const sources = Array.from({ length: 10_045 }, (_, index) => summary(`id-${index.toString().padStart(5, '0')}`, { pinned: index % 3 === 0 }));
  let after: SessionCatalogContinuation | undefined;
  const seen = new Set<string>();
  do {
    const page = new SessionCatalogPage(context, 40, { needle: '', ...(after ? { after } : {}) });
    for (const item of sources) page.accept(item);
    const result = page.snapshot(true);
    expect(result.sessions.length).toBeLessThanOrEqual(40);
    expect(result.total).toBe(10_045);
    for (const item of result.sessions) { expect(seen.has(item.id)).toBe(false); seen.add(item.id); }
    after = result.continuation;
  } while (after);
  expect(seen.size).toBe(sources.length);
});
