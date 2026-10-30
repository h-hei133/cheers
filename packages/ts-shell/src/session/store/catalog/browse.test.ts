import fs from 'node:fs';
import * as io from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { createMessageTranscriptEvent, createTranscriptHeader } from '../../sessionEventCodec.js';
import { projectSessionMetadata } from '../../schema/sessionMetadataCodec.js';
import { buildSessionStateSnapshot } from '../../schema/sessionStateSnapshot.js';
import type { Session } from '../../schema/sessionRecord.js';
import { createSessionStoreLayout, projectSessionFileLayout } from '../sessionFileLayout.js';
import { SessionCatalog } from './index.js';
import type { SessionCatalogBrowse, SessionCatalogContinuation, SessionCatalogSnapshot } from './model.js';
import { CatalogBrowses, type CatalogRead } from './browse.js';
import * as projection from './projection.js';

vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
  return { ...actual, open: vi.fn(actual.open), opendir: vi.fn(actual.opendir), lstat: vi.fn(actual.lstat) };
});
const roots: string[] = [];
afterEach(() => {
  vi.mocked(io.open).mockReset().mockImplementation(fs.promises.open);
  vi.mocked(io.opendir).mockReset().mockImplementation(fs.promises.opendir);
  vi.mocked(io.lstat).mockReset().mockImplementation(fs.promises.lstat);
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function fixture(bytes?: number) {
  const scratch = path.join(os.tmpdir(), 'cheers-test'); fs.mkdirSync(scratch, { recursive: true });
  const root = fs.mkdtempSync(path.join(scratch, 'catalog-browse-')); roots.push(root);
  const layout = createSessionStoreLayout(root); fs.mkdirSync(layout.sessionsDir, { recursive: true });
  const context = { sessionId: 'current', projectRoot: '/workspace', busy: false };
  const catalog = bytes === undefined ? new SessionCatalog(layout) : new SessionCatalog(layout, bytes);
  const browse = catalog.beginBrowse(context);
  return { layout, context, catalog, browse };
}

function seed(layout: ReturnType<typeof createSessionStoreLayout>, id: string, overrides: Partial<Session> = {}) {
  const timestamp = '2026-10-07T00:00:00.000Z';
  const session: Session = { id, projectRoot: '/workspace', createdAt: timestamp, updatedAt: timestamp,
    status: 'active', turns: [{ id: `${id}-message`, role: 'user', content: `Conversation ${id}`, timestamp }], ...overrides };
  const files = projectSessionFileLayout({ sessionsDir: layout.sessionsDir, sessionId: id });
  fs.mkdirSync(files.sessionDir, { recursive: true });
  fs.writeFileSync(files.metadataPath, JSON.stringify(projectSessionMetadata(session)));
  fs.writeFileSync(files.statePath, JSON.stringify(buildSessionStateSnapshot(session, undefined)));
  fs.writeFileSync(files.transcriptPath, [createTranscriptHeader({ sessionId: id, timestamp, cwd: session.projectRoot }),
    ...session.turns.map(turn => createMessageTranscriptEvent(turn))].map(event => JSON.stringify(event)).join('\n') + '\n');
  return files;
}

async function finish(catalog: SessionCatalog, context: ReturnType<typeof fixture>['context'], browse: SessionCatalogBrowse,
  needle = '', after?: SessionCatalogContinuation, signal?: AbortSignal, limit = 40) {
  const pages: SessionCatalogSnapshot[] = [];
  for await (const page of catalog.list(context, signal, limit, undefined, undefined, { browse, needle, after })) pages.push(page);
  return { pages, last: pages.at(-1)! };
}

it.each(['metadata', 'state', 'transcript', 'abort'] as const)(
  'rejects %s changes across catalog decode suspension without caching the result', async source => {
    const { catalog, layout, browse } = fixture();
    const files = seed(layout, 'one');
    const controller = new AbortController();
    let entered!: () => void, release!: () => void;
    const decoded = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const original = projection.decodeSessionSummary;
    const spy = vi.spyOn(projection, 'decodeSessionSummary').mockImplementationOnce(async (...args) => {
      const summary = await original(...args);
      entered(); await gate; return summary;
    });
    const owner = catalog as unknown as { read: CatalogRead; cache: Map<string, unknown> };
    const pending = owner.read('one', controller.signal);
    try {
      await decoded;
      if (source === 'abort') controller.abort(new Error('catalog cancelled'));
      else fs.appendFileSync(files[`${source}Path`], '\n');
      release();
      await expect(pending).rejects.toThrow(source === 'abort' ? /cancelled/ : /changed/);
      expect(owner.cache.has('one')).toBe(false);
    } finally {
      release(); spy.mockRestore(); catalog.retireBrowse(browse);
    }
  },
);

it('forgets a confirmed removed row without rediscovery, source reads or a fresh quota', async () => {
  const { catalog, context, browse, layout } = fixture();
  seed(layout, 'current', { updatedAt: '2020-01-01T00:00:00.000Z' }); const removed = seed(layout, 'one'); seed(layout, 'two'); seed(layout, 'three');
  const first = await finish(catalog, context, browse, '', undefined, undefined, 1);
  const summary = first.last.sessions.find(item => item.id === 'one')!;
  const retained = catalog as unknown as { browses: CatalogBrowses; cache: Map<string, unknown> };
  const state = retained.browses.get(browse, context), budget = state.budget;
  const remaining = budget.remaining();
  expect(() => catalog.forgetBrowse({ ...browse }, context, summary)).toThrow(/expired/);
  expect(() => catalog.forgetBrowse(browse, { ...context, projectRoot: '/elsewhere' }, summary)).toThrow(/expired/);
  expect(() => catalog.forgetBrowse(browse, context, { ...summary, version: 'forged' })).toThrow(/changed/);
  fs.rmSync(removed.sessionDir, { recursive: true });
  catalog.forgetBrowse(browse, context, summary);
  expect(retained.browses.get(browse, context)).toBe(state); expect(state.budget).toBe(budget);
  expect(budget.remaining()).toBe(remaining);
  expect(state.summaries.has('one')).toBe(false); expect(state.forgotten.has('one')).toBe(true);
  expect(retained.cache.has('one')).toBe(false);
  await expect(finish(catalog, context, browse, '', first.last.continuation, undefined, 1)).rejects.toThrow(/expired/);
  seed(layout, 'one', { title: 'Recreated saved session' });
  vi.mocked(io.open).mockClear(); vi.mocked(io.opendir).mockClear();
  const later = await finish(catalog, context, browse);
  expect(later.last.sessions.map(item => item.id)).not.toContain('one');
  expect(later.last.total).toBe(3); expect(later.last.status).toBe('complete');
  expect(io.open).not.toHaveBeenCalled(); expect(io.opendir).not.toHaveBeenCalled();
  catalog.retireBrowse(browse);
  const refreshed = catalog.beginBrowse(context);
  expect((await finish(catalog, context, refreshed, 'Recreated')).last.sessions.map(item => item.id)).toEqual(['one']);
  catalog.retireBrowse(refreshed);
});

it('invalidates a detached query that retained a removed row, and preserves partial provenance', async () => {
  const { catalog, context, browse, layout } = fixture();
  seed(layout, 'current'); const removed = seed(layout, 'one'); seed(layout, 'two');
  const first = await finish(catalog, context, browse);
  const query = catalog.list(context, undefined, 40, undefined, undefined, { browse, needle: '' });
  await query.next();
  const state = (catalog as unknown as { browses: CatalogBrowses }).browses.get(browse, context);
  state.unreadable = 1; state.limited = 1; state.sourceLimited = true;
  fs.rmSync(removed.sessionDir, { recursive: true });
  catalog.forgetBrowse(browse, context, first.last.sessions.find(item => item.id === 'one')!);
  await expect(query.next()).rejects.toThrow(/changed|expired/);
  const later = await finish(catalog, context, browse, 'two');
  expect(later.last).toMatchObject({ status: 'partial', unreadable: 1, limited: 1, sourceLimited: true });
  catalog.retireBrowse(browse);
});

it('captures all summaries once and filters new needles without opening source files or rediscovering', async () => {
  const { catalog, context, browse, layout } = fixture();
  seed(layout, 'current');
  for (let index = 0; index < 70; index++) seed(layout, `saved-${index.toString().padStart(3, '0')}`);
  seed(layout, 'older', { title: 'Unique older match', updatedAt: '2020-01-01T00:00:00.000Z' });
  await finish(catalog, context, browse, 'saved-001');
  vi.mocked(io.opendir).mockClear(); vi.mocked(io.open).mockClear(); vi.mocked(io.lstat).mockClear();
  const next = await finish(catalog, context, browse, 'unique older');
  expect(next.last).toMatchObject({ status: 'complete', total: 1 });
  expect(next.last.sessions.map(summary => summary.id)).toEqual(['older']);
  expect(io.opendir).not.toHaveBeenCalled(); expect(io.open).not.toHaveBeenCalled();
  expect(io.lstat.mock.calls.length).toBeLessThan(60);
  catalog.retireBrowse(browse);
});

it('validates current before any provisional publication from a completed browse', async () => {
  const { catalog, context, browse, layout } = fixture();
  const current = seed(layout, 'current'); seed(layout, 'other');
  await finish(catalog, context, browse);
  fs.appendFileSync(current.transcriptPath, '\n');
  const iterator = catalog.list(context, undefined, 40, undefined, undefined, { browse, needle: '' });
  await expect(iterator.next()).rejects.toThrow(/page changed/);
  catalog.retireBrowse(browse);
});

it('rejects a first current publication when the source retires during its live recheck', async () => {
  const { catalog, context, browse, layout } = fixture(); seed(layout, 'current');
  let entered!: () => void; const pending = new Promise<void>(resolve => { entered = resolve; });
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  const owner = catalog as unknown as { read: CatalogRead };
  const original = owner.read.bind(catalog);
  vi.spyOn(owner, 'read').mockImplementation(async (...args) => {
    const summary = await original(...args);
    if (args[0] === context.sessionId && args[5]) { entered(); await gate; }
    return summary;
  });
  const iterator = catalog.list(context, undefined, 40, undefined, undefined, { browse, needle: '' });
  const first = iterator.next();
  try {
    await pending; catalog.retireBrowse(browse); release();
    await expect(first).rejects.toThrow(/expired|retired/);
  } finally { release(); catalog.retireBrowse(browse); }
});

it('revalidates continuation anchors and lookahead rows without rediscovery', async () => {
  const { catalog, context, browse, layout } = fixture();
  seed(layout, 'current');
  for (let index = 0; index < 5; index++) seed(layout, `saved-${index}`);
  const first = await finish(catalog, context, browse, '', undefined, undefined, 1);
  catalog.retireBrowse({ id: browse.id });
  vi.mocked(io.opendir).mockClear();
  const second = await finish(catalog, context, browse, '', first.last.continuation, undefined, 1);
  expect(second.last.continuation?.browseId).toBe(browse.id);
  expect(io.opendir).not.toHaveBeenCalled();
  const anchor = projectSessionFileLayout({ sessionsDir: layout.sessionsDir, sessionId: second.last.continuation!.boundary.id });
  fs.appendFileSync(anchor.transcriptPath, '\n');
  await expect(finish(catalog, context, browse, '', second.last.continuation, undefined, 1)).rejects.toThrow(/page changed/);
  catalog.retireBrowse(browse);
});

it.each(['needle', 'project', 'session', 'allProjects', 'token', 'retired'] as const)('refuses %s changes without reusing browse authority', async change => {
  const { catalog, context, browse, layout } = fixture();
  seed(layout, 'current'); seed(layout, 'one'); seed(layout, 'two');
  const first = await finish(catalog, context, browse, '', undefined, undefined, 1);
  if (change === 'retired') catalog.retireBrowse(browse);
  const changed = change === 'project' ? { ...context, projectRoot: '/other' }
    : change === 'session' ? { ...context, sessionId: 'other' }
    : change === 'allProjects' ? { ...context, allProjects: true } : context;
  const token = change === 'token' ? { id: browse.id } : browse;
  if (change === 'project' || change === 'session' || change === 'allProjects') {
    await expect(finish(catalog, changed, token, 'new needle')).rejects.toThrow(/expired|changed/);
  }
  await expect(finish(catalog, changed, token, change === 'needle' ? 'other' : '', first.last.continuation, undefined, 1))
    .rejects.toThrow(/expired|changed|no longer matches/);
  catalog.retireBrowse(browse);
});

it('keeps newly discovered records out of the captured view until explicit refresh', async () => {
  const { catalog, context, browse, layout } = fixture(); seed(layout, 'current');
  await finish(catalog, context, browse);
  seed(layout, 'new-session', { title: 'new needle' });
  expect((await finish(catalog, context, browse, 'new needle')).last.total).toBe(0);
  catalog.retireBrowse(browse);
  const refreshed = catalog.beginBrowse(context);
  expect((await finish(catalog, context, refreshed, 'new needle')).last.sessions.map(summary => summary.id)).toEqual(['new-session']);
  catalog.retireBrowse(refreshed);
});

it('inherits unreadable and limited acquisition state across new needles and continuation pages', async () => {
  const { catalog, context, browse, layout } = fixture(); seed(layout, 'current');
  for (let index = 0; index < 4; index++) seed(layout, `saved-${index}`);
  const broken = seed(layout, 'broken'); fs.writeFileSync(broken.metadataPath, 'broken');
  const first = await finish(catalog, context, browse, 'saved', undefined, undefined, 1);
  const next = await finish(catalog, context, browse, 'saved', first.last.continuation, undefined, 1);
  const missing = await finish(catalog, context, browse, 'not present');
  expect(first.last.status).toBe('partial'); expect(next.last.unreadable).toBe(first.last.unreadable);
  expect(missing.last).toMatchObject({ status: 'partial', total: 0, unreadable: first.last.unreadable });
  catalog.retireBrowse(browse);
});

it('retains one source quota across queries and never calls a truncated no-match complete', async () => {
  const { layout, context, catalog, browse } = fixture(1); seed(layout, 'current'); seed(layout, 'saved');
  const first = await finish(catalog, context, browse, 'missing');
  vi.mocked(io.opendir).mockClear(); vi.mocked(io.open).mockClear();
  const second = await finish(catalog, context, browse, 'saved');
  expect(first.last).toMatchObject({ status: 'partial', sourceLimited: true, total: 0, hasMore: false });
  expect(second.last).toMatchObject({ status: 'partial', sourceLimited: true, hasMore: false });
  expect(io.opendir).not.toHaveBeenCalled(); expect(io.open).not.toHaveBeenCalled();
  catalog.retireBrowse(browse);
});

it('query cancellation detaches promptly while the shared source completes for a later query', async () => {
  const { layout, context, catalog, browse } = fixture(); seed(layout, 'current');
  const saved = seed(layout, 'saved', { title: 'Later match' });
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let entered!: () => void;
  const opened = new Promise<void>(resolve => { entered = resolve; });
  vi.mocked(io.open).mockImplementation(async (target, ...args) => {
    if (target === saved.metadataPath) { entered(); await gate; }
    return fs.promises.open(target, ...args);
  });
  const controller = new AbortController();
  const iterator = catalog.list(context, controller.signal, 40, undefined, undefined, { browse, needle: '' });
  await iterator.next();
  const pending = (async () => { for await (const ignored of iterator) { void ignored; } })();
  await opened;
  const reason = new Error('query detached'); controller.abort(reason);
  await expect(pending).rejects.toBe(reason);
  vi.mocked(io.opendir).mockClear();
  release();
  const later = await finish(catalog, context, browse, 'later match');
  expect(later.last.sessions.map(summary => summary.id)).toEqual(['saved']);
  expect(later.last.status).toBe('complete'); expect(io.opendir).not.toHaveBeenCalled();
  catalog.retireBrowse(browse);
});

it('source retirement drains dispatched reads and rejects every detached browse consumer', async () => {
  const { layout, context, catalog, browse } = fixture(); seed(layout, 'current');
  const saved = seed(layout, 'saved');
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let entered!: () => void;
  const opened = new Promise<void>(resolve => { entered = resolve; });
  const closes: ReturnType<typeof vi.spyOn>[] = [];
  const reads: ReturnType<typeof vi.spyOn>[] = [];
  vi.mocked(io.open).mockImplementation(async (target, ...args) => {
    if (target === saved.metadataPath) { entered(); await gate; }
    const handle = await fs.promises.open(target, ...args);
    if (target === saved.metadataPath) {
      closes.push(vi.spyOn(handle, 'close'));
      reads.push(vi.spyOn(handle, 'read'));
    }
    return handle;
  });
  const iterator = catalog.list(context, undefined, 40, undefined, undefined, { browse, needle: '' });
  await iterator.next(); const pending = (async () => { for await (const ignored of iterator) { void ignored; } })(); await opened;
  catalog.retireBrowse(browse); release();
  await expect(pending).rejects.toThrow(/retired|expired/);
  expect(closes).toHaveLength(1); expect(closes[0]).toHaveBeenCalledOnce();
  expect(reads).toHaveLength(1); expect(reads[0]).not.toHaveBeenCalled();
  await expect(finish(catalog, context, browse)).rejects.toThrow(/expired/);
});

it('keeps a single continuation claim when concurrent readers share one browse index', async () => {
  const { layout, context, catalog, browse } = fixture(); seed(layout, 'current'); seed(layout, 'one'); seed(layout, 'two');
  const first = await finish(catalog, context, browse, '', undefined, undefined, 1);
  const left = catalog.list(context, undefined, 1, undefined, undefined, { browse, needle: '', after: first.last.continuation });
  const right = catalog.list(context, undefined, 1, undefined, undefined, { browse, needle: '', after: first.last.continuation });
  const results = await Promise.allSettled([left.next(), right.next()]);
  expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
  const rejected = results.find(result => result.status === 'rejected');
  expect(rejected?.status === 'rejected' ? rejected.reason.message : '').toMatch(/already being read/);
  await Promise.allSettled([left.return(undefined), right.return(undefined)]);
  catalog.retireBrowse(browse);
});

it('rejects a truthful but unissued boundary and retires the old cursor after issuing its successor', async () => {
  const { layout, context, catalog, browse } = fixture(); seed(layout, 'current');
  for (let index = 0; index < 5; index++) seed(layout, `saved-${index}`);
  const first = await finish(catalog, context, browse, '', undefined, undefined, 1);
  const after = first.last.continuation!;
  const other = (await finish(catalog, context, browse, 'saved-4')).last.sessions[0]!;
  await expect(finish(catalog, context, browse, '', { ...after, boundary: { id: other.id, version: other.version,
    pinned: other.pinned, updatedAt: other.updatedAt } }, undefined, 1)).rejects.toThrow(/expired/);
  const second = await finish(catalog, context, browse, '', after, undefined, 1);
  expect(second.last.continuation).toBeDefined();
  await expect(finish(catalog, context, browse, '', after, undefined, 1)).rejects.toThrow(/expired/);
  expect((await finish(catalog, context, browse, '', second.last.continuation, undefined, 1)).last.status).toBe('complete');
  catalog.retireBrowse(browse);
});
