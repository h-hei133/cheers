import fs from 'node:fs';
import * as io from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { createMessageTranscriptEvent, createTranscriptHeader } from '../../sessionEventCodec.js';
import { projectSessionMetadata } from '../../schema/sessionMetadataCodec.js';
import type { Session } from '../../schema/sessionRecord.js';
import { buildSessionStateSnapshot } from '../../schema/sessionStateSnapshot.js';
import { sessionRootEntryId } from '../../schema/sessionThread.js';
import { createSessionStoreLayout, projectSessionFileLayout, type SessionStoreLayout } from '../sessionFileLayout.js';
import { loadSessionRecord } from '../sessionStore.js';
import { SessionCatalogReadLimitError, sessionCatalogReadBudget } from './files.js';
import { SessionCatalog } from './index.js';
import { CATALOG_LIMITS, type SessionCatalogSnapshot } from './model.js';
import { summarizeSession } from './projection.js';

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

function fixture(attemptBytes?: number) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'session-catalog-')); roots.push(root);
  const layout = createSessionStoreLayout(root);
  fs.mkdirSync(layout.sessionsDir, { recursive: true });
  const context = { sessionId: 'current', projectRoot: '/workspace', busy: false };
  return { root, layout, context,
    catalog: attemptBytes === undefined ? new SessionCatalog(layout) : new SessionCatalog(layout, attemptBytes) };
}

function seed(store: SessionStoreLayout, id: string, overrides: Partial<Session> = {}) {
  const timestamp = '2026-10-07T00:00:00.000Z';
  const session: Session = { id, projectRoot: '/workspace', createdAt: timestamp, updatedAt: timestamp, status: 'active',
    turns: [{ id: `${id}-message`, role: 'user', content: `Conversation ${id}`, timestamp }], ...overrides };
  const layout = projectSessionFileLayout({ sessionsDir: store.sessionsDir, sessionId: id });
  fs.mkdirSync(layout.sessionDir, { recursive: true });
  fs.writeFileSync(layout.metadataPath, JSON.stringify(projectSessionMetadata(session)));
  fs.writeFileSync(layout.statePath, JSON.stringify(buildSessionStateSnapshot(session, undefined)));
  fs.writeFileSync(layout.transcriptPath, [createTranscriptHeader({ sessionId: id, timestamp, cwd: session.projectRoot }),
    ...session.turns.map(turn => createMessageTranscriptEvent({ ...turn, timestamp: turn.timestamp ?? timestamp }))].map(event => JSON.stringify(event)).join('\n') + '\n');
  return { session, layout };
}

async function finish(catalog: SessionCatalog, context: { sessionId: string; projectRoot: string; busy: boolean }) {
  const pages: SessionCatalogSnapshot[] = [];
  for await (const page of catalog.list(context)) pages.push(page);
  return { pages, last: pages.at(-1)! };
}

it('admits exact catalogue source bytes, rejects overflow, and preserves cancellation', () => {
  const budget = sessionCatalogReadBudget(4);
  budget.admit(3); budget.admit(1);
  expect(() => budget.admit(1)).toThrow(SessionCatalogReadLimitError);
  for (const bytes of [-1, NaN, Infinity, 0.5]) {
    expect(() => sessionCatalogReadBudget(10).admit(bytes)).toThrow(SessionCatalogReadLimitError);
  }
  expect(() => sessionCatalogReadBudget(-1)).toThrow(RangeError);
  const controller = new AbortController();
  const reason = new Error('cancelled source budget');
  const cancelled = sessionCatalogReadBudget(1, controller.signal);
  controller.abort(reason);
  expect(() => cancelled.admit(0)).toThrow(reason);
});

it('publishes the runtime current identity before discovery and preserves replay/report/legacy semantics', async () => {
  const { root, layout, context } = fixture();
  const history = path.join(root, 'history');
  const catalog = new SessionCatalog({ ...layout, sessionsSearchDirs: [layout.sessionsDir, history] });
  const current = seed(layout, 'current', { turns: [] });
  fs.appendFileSync(current.layout.transcriptPath, JSON.stringify({ type: 'command-output', id: 'report', sourceEntryId: sessionRootEntryId('current'),
    timestamp: '2026-10-07T01:00:00.000Z', text: 'Observed status' }) + '\n');
  const legacy = seed({ ...layout, sessionsDir: history }, 'legacy');
  const empty = seed(layout, 'empty', { turns: [] });
  seed(layout, 'foreign', { projectRoot: '/elsewhere' });
  const query = catalog.list(context);
  const first = await query.next();
  expect(first.value.sessions.map(item => item.id)).toEqual(['current']);
  expect(first.value.status).toBe('scanning'); expect(io.opendir).not.toHaveBeenCalled();
  let last = first.value as SessionCatalogSnapshot;
  for await (const page of query) last = page;
  expect(last.status).toBe('complete');
  expect(last.sessions.map(item => item.id)).toEqual(['current', 'legacy']);
  for (const [id, target] of [['current', current], ['legacy', legacy]] as const) {
    const summary = last.sessions.find(item => item.id === id)!;
    expect(summary).toEqual(summarizeSession(loadSessionRecord({ sessionId: id, layout: target.layout, cwd: '/workspace' }), summary.version));
  }
  expect(JSON.parse(fs.readFileSync(empty.layout.transcriptPath, 'utf8'))).toMatchObject({ type: 'session', id: 'empty' });
});

it('yields the current session before scanning ten thousand history entries', async () => {
  const { layout, context, catalog } = fixture();
  seed(layout, 'current');
  for (let index = 0; index < 10_000; index++) fs.writeFileSync(path.join(layout.sessionsDir, `entry-${index}`), '');
  const query = catalog.list(context);
  const first = await query.next();
  expect(first.value.status).toBe('scanning');
  expect(first.value.sessions.map(item => item.id)).toEqual(['current']);
  // The first frame is produced before directory discovery begins; its cost
  // does not grow with the number of saved sessions.
  expect(io.opendir).not.toHaveBeenCalled();
  await query.return(undefined);
});

it('bounds directory discovery and summary dispatch per update and closes an abandoned cursor', async () => {
  const { layout, context, catalog } = fixture(); seed(layout, 'current');
  for (let index = 0; index < 240; index++) fs.writeFileSync(path.join(layout.sessionsDir, `file-${index}`), '');
  let reads = 0; let closed = 0;
  vi.mocked(io.opendir).mockImplementation((async (...args: Parameters<typeof io.opendir>) => {
    const directory = await fs.promises.opendir(...args);
    const read = directory.read.bind(directory); const close = directory.close.bind(directory);
    directory.read = (async () => { reads++; return read(); }) as typeof directory.read;
    directory.close = (async () => { closed++; return close(); }) as typeof directory.close;
    return directory;
  }) as typeof io.opendir);
  const query = catalog.list(context); await query.next();
  await query.next();
  expect(reads).toBeLessThanOrEqual(64);
  expect(reads).toBeLessThan(240);
  await query.return(undefined); expect(closed).toBe(1);
});

it('reuses one browse attempt index instead of rediscovering every later page', async () => {
  const { layout, context, catalog } = fixture();
  seed(layout, 'current');
  for (let index = 0; index < 120; index++) seed(layout, `saved-${String(index).padStart(3, '0')}`);
  const first = catalog.list(context, undefined, 20, undefined, undefined, { needle: '' });
  let page: SessionCatalogSnapshot | undefined;
  for await (const snapshot of first) page = snapshot;
  const after = page!.continuation!;
  expect(after.attemptId).toBeTypeOf('string');

  vi.mocked(io.opendir).mockClear();
  vi.mocked(io.lstat).mockClear();
  const second = catalog.list(context, undefined, 20, undefined, undefined, { needle: '', after });
  let next: SessionCatalogSnapshot | undefined;
  for await (const snapshot of second) next = snapshot;

  expect(io.opendir).not.toHaveBeenCalled();
  expect(io.lstat.mock.calls.length).toBeLessThan(200);
  expect(next!.sessions).toHaveLength(21);
  expect(next!.sessions[0]?.id).not.toBe(page!.sessions[0]?.id);
});

it('charges continuation reads to one attempt source budget and stops with an explicit partial result', async () => {
  const { layout, context } = fixture();
  const current = seed(layout, 'current');
  const savedA = seed(layout, 'saved-a');
  const savedB = seed(layout, 'saved-b');
  const initialBytes = [current.layout, savedA.layout, savedB.layout].reduce((total, files) =>
    total + [files.metadataPath, files.statePath, files.transcriptPath]
      .reduce((sum, file) => sum + fs.statSync(file).size, 0), 0);
  const catalog = new SessionCatalog(layout, initialBytes + 1);
  const first = catalog.list(context, undefined, 1, undefined, undefined, { needle: '' });
  let page: SessionCatalogSnapshot | undefined;
  for await (const snapshot of first) page = snapshot;
  expect(page?.continuation).toBeDefined();

  // Force the continuation to reacquire source bytes rather than reuse resident summaries.
  (catalog as unknown as { cache: Map<string, unknown> }).cache.clear();
  const second = catalog.list(context, undefined, 1, undefined, undefined, { needle: '', after: page!.continuation });
  const pages: SessionCatalogSnapshot[] = [];
  for await (const snapshot of second) pages.push(snapshot);
  expect(pages.at(-1)).toMatchObject({ status: 'partial', sourceLimited: true, hasMore: false });
  expect(pages.at(-1)?.continuation).toBeUndefined();
});

it('refuses concurrent replay of the same continuation cursor', async () => {
  const { layout, context, catalog } = fixture();
  seed(layout, 'current');
  for (let index = 0; index < 4; index++) seed(layout, `saved-${index}`);
  const first = catalog.list(context, undefined, 1, undefined, undefined, { needle: '' });
  let page: SessionCatalogSnapshot | undefined;
  for await (const snapshot of first) page = snapshot;
  expect(page?.continuation).toBeDefined();
  const left = catalog.list(context, undefined, 1, undefined, undefined, { needle: '', after: page!.continuation });
  const right = catalog.list(context, undefined, 1, undefined, undefined, { needle: '', after: page!.continuation });
  const results = await Promise.allSettled([left.next(), right.next()]);
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  const rejected = results.find(result => result.status === 'rejected');
  expect(rejected?.status === 'rejected' ? rejected.reason : undefined).toMatchObject({ message: expect.stringMatching(/already being read/) });
  await Promise.allSettled([left.return(undefined), right.return(undefined)]);
});

it('reports unreadable diagnostics discovered before a cancelled scan', async () => {
  const { layout, context, catalog } = fixture();
  seed(layout, 'current');
  const broken = projectSessionFileLayout({ sessionsDir: layout.sessionsDir, sessionId: 'broken' });
  fs.mkdirSync(broken.sessionDir, { recursive: true });
  fs.writeFileSync(broken.metadataPath, '{broken', 'utf8');
  const onUnreadable = vi.fn();
  const controller = new AbortController();
  const query = catalog.list(context, controller.signal, 40, undefined, onUnreadable);
  await query.next();
  let page = await query.next();
  while (!page.done && page.value.unreadable === 0) page = await query.next();
  expect(page.done).toBe(false);
  expect(page.value.unreadable).toBeGreaterThan(0);

  controller.abort();
  await query.return(undefined);
  expect(onUnreadable).toHaveBeenCalledOnce();
  expect(onUnreadable.mock.calls[0]?.[0].unreadableSessionIds).toContain('broken');
});

it('keeps the recent forty plus current, reuses unchanged summaries, and invalidates on replacement or append', async () => {
  const { layout, context, catalog } = fixture(); seed(layout, 'current', { updatedAt: '2025-01-01T00:00:00.000Z' });
  for (let index = 0; index < 55; index++) seed(layout, `recent-${index.toString().padStart(2, '0')}`);
  const target = projectSessionFileLayout({ sessionsDir: layout.sessionsDir, sessionId: 'recent-00' });
  const first = await finish(catalog, context);
  expect(first.last.sessions).toHaveLength(41);
  expect(first.last.sessions[0]?.id).toBe('recent-00'); expect(first.last.sessions.at(-1)?.id).toBe('current');
  expect(first.pages.length).toBeGreaterThan(3);
  vi.mocked(io.open).mockClear();
  expect((await finish(catalog, context)).last.sessions).toEqual(first.last.sessions);
  expect(io.open).not.toHaveBeenCalled();
  const metadata = JSON.parse(fs.readFileSync(target.metadataPath, 'utf8')); metadata.title = 'Renamed outside the process';
  fs.writeFileSync(target.metadataPath + '.new', JSON.stringify(metadata)); fs.renameSync(target.metadataPath + '.new', target.metadataPath);
  fs.appendFileSync(target.transcriptPath, JSON.stringify({ type: 'command-output', id: 'later', sourceEntryId: sessionRootEntryId('recent-00'),
    timestamp: '2026-10-08T00:00:00.000Z', text: 'later observation' }) + '\n');
  const next = await finish(catalog, context);
  expect(next.last.sessions[0]).toMatchObject({ id: 'recent-00', title: metadata.title, updatedAt: '2026-10-08T00:00:00.000Z' });
  expect(io.open).toHaveBeenCalledTimes(3);
  fs.rmSync(target.sessionDir, { recursive: true });
  expect((await finish(catalog, context)).last.sessions.some(item => item.id === 'recent-00')).toBe(false);
});

it('keeps large sessions discoverable without reading unbounded content or treating an unknown preview as empty', async () => {
  const { layout, context, catalog } = fixture(); seed(layout, 'current');
  const large = seed(layout, 'large');
  fs.appendFileSync(large.layout.transcriptPath, JSON.stringify(createMessageTranscriptEvent({ role: 'assistant',
    content: 'x'.repeat(CATALOG_LIMITS.transcriptBytes), timestamp: large.session.updatedAt })) + '\n');
  const state = seed(layout, 'large-state');
  fs.writeFileSync(state.layout.statePath, JSON.stringify({ ...buildSessionStateSnapshot(state.session, undefined),
    workingMemory: 'x'.repeat(CATALOG_LIMITS.stateBytes) }));
  const result = (await finish(catalog, context)).last;
  expect(result).toMatchObject({ status: 'partial', limited: 2 });
  expect(result.sessions.find(item => item.id === 'large')).toMatchObject({ quality: 'limited', reentry: 'unknown' });
  expect(result.sessions.find(item => item.id === 'large-state')).toMatchObject({ quality: 'limited', reentry: 'unknown' });
  const paths = vi.mocked(io.open).mock.calls.map(call => String(call[0]));
  expect(paths).not.toContain(large.layout.transcriptPath); expect(paths).not.toContain(state.layout.statePath);
});

it('preserves BOM-compatible metadata and state records accepted by the existing loader', async () => {
  const { layout, context, catalog } = fixture();
  const current = seed(layout, 'current'); const other = seed(layout, 'other');
  for (const file of [current.layout.metadataPath, other.layout.statePath]) fs.writeFileSync(file, '\uFEFF' + fs.readFileSync(file, 'utf8'));
  const result = (await finish(catalog, context)).last;
  expect(result.status).toBe('complete');
  for (const [id, target] of [['current', current], ['other', other]] as const) {
    const summary = result.sessions.find(item => item.id === id)!;
    expect(summary).toEqual(summarizeSession(loadSessionRecord({ sessionId: id, layout: target.layout, cwd: '/workspace' }), summary.version));
  }
});

it('does not flush the resident summary index on a sequential scan larger than its retention', async () => {
  const { layout, context, catalog } = fixture(); seed(layout, 'current');
  const count = CATALOG_LIMITS.cacheEntries + 10;
  for (let index = 0; index < count; index++) seed(layout, `record-${index.toString().padStart(4, '0')}`);
  const first = (await finish(catalog, context)).last;
  vi.mocked(io.open).mockClear();
  const second = (await finish(catalog, context)).last;
  expect(second.sessions).toEqual(first.sessions);
  // Cold entries still need bounded reads; the unchanged resident majority must not.
  expect(vi.mocked(io.open).mock.calls.length).toBeLessThan(count);
});

it('reports unreadable sources, rejects mismatched identities and respects authoritative layout shadowing', async () => {
  const { root, layout, context } = fixture(); seed(layout, 'current');
  const history = path.join(root, 'history'); const historical = { ...layout, sessionsDir: history };
  seed(historical, 'shadowed'); const shadowed = seed(layout, 'shadowed'); fs.unlinkSync(shadowed.layout.statePath);
  const wrong = seed(layout, 'wrong');
  fs.writeFileSync(wrong.layout.metadataPath, JSON.stringify({ ...projectSessionMetadata(wrong.session), id: 'current' }));
  const denied = seed(layout, 'denied');
  vi.mocked(io.open).mockImplementation((async (target, ...args) => {
    if (target === denied.layout.metadataPath) throw Object.assign(new Error('PRIVATE_CONTENT'), { code: 'EACCES' });
    return fs.promises.open(target, ...args);
  }) as typeof io.open);
  const catalog = new SessionCatalog({ ...layout, sessionsSearchDirs: [layout.sessionsDir, history] });
  const result = (await finish(catalog, context)).last;
  expect(result.sessions.map(item => item.id)).toEqual(['current']);
  expect(result.status).toBe('partial'); expect(result.unreadable).toBeGreaterThanOrEqual(3);
  expect(JSON.stringify(result)).not.toContain('PRIVATE_CONTENT');
});

it.each(['listing', 'reference'])('drains dispatched %s reads on cancellation, closes the cursor, and dispatches no later files', async mode => {
  const { layout, context, catalog } = fixture(); seed(layout, 'current');
  for (let index = 0; index < 24; index++) seed(layout, `saved-${index}`);
  const controller = new AbortController(); const query = catalog.list(context, controller.signal); await query.next();
  let entered = 0; let closed = 0; let directoryClosed = 0; let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  vi.mocked(io.open).mockClear().mockImplementation((async (...args: Parameters<typeof io.open>) => {
    entered++; const handle = await fs.promises.open(...args); const close = handle.close.bind(handle);
    handle.close = async () => { closed++; await close(); };
    await gate; return handle;
  }) as typeof io.open);
  vi.mocked(io.opendir).mockImplementation((async (...args: Parameters<typeof io.opendir>) => {
    const directory = await fs.promises.opendir(...args); const close = directory.close.bind(directory);
    directory.close = (async () => { directoryClosed++; return close(); }) as typeof directory.close;
    return directory;
  }) as typeof io.opendir);
  const pending = mode === 'listing' ? query.next() : catalog.resolve('not a session', { signal: controller.signal });
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  await vi.waitFor(() => expect(entered).toBe(4)); controller.abort(); release(); await rejected;
  expect({ entered, closed, directoryClosed }).toEqual({ entered: 4, closed: 4, directoryClosed: 1 });
});

it('does not cache a summary whose core files changed during acquisition', async () => {
  const { layout, context, catalog } = fixture(); const current = seed(layout, 'current');
  let changed = false;
  vi.mocked(io.open).mockImplementation((async (target, ...args) => {
    const handle = await fs.promises.open(target, ...args);
    if (target === current.layout.transcriptPath && !changed) {
      changed = true;
      fs.writeFileSync(current.layout.metadataPath, JSON.stringify({ ...projectSessionMetadata(current.session), title: 'newer' }));
    }
    return handle;
  }) as typeof io.open);
  const first = (await finish(catalog, context)).last;
  expect(first).toMatchObject({ sessions: [], unreadable: 1, status: 'partial' });
  expect((await finish(catalog, context)).last.sessions[0]?.title).toBe('newer');
});

it('rejects pre-cancelled discovery before any filesystem operation', async () => {
  const { catalog, context } = fixture();
  await expect(catalog.list(context, AbortSignal.abort()).next()).rejects.toMatchObject({ name: 'AbortError' });
  await expect(catalog.resolve('current', { signal: AbortSignal.abort() })).rejects.toMatchObject({ name: 'AbortError' });
  expect(io.open).not.toHaveBeenCalled(); expect(io.lstat).not.toHaveBeenCalled(); expect(io.opendir).not.toHaveBeenCalled();
});

it('resolves exact IDs without discovery and includes older prefix and title collisions', async () => {
  const { layout, context, catalog } = fixture();
  for (let index = 0; index < 50; index++) seed(layout, `recent-${index}`);
  seed(layout, 'work-recent', { title: 'Shared work', updatedAt: '2026-10-08T00:00:00.000Z' });
  seed(layout, 'work-old', { title: 'Shared work', updatedAt: '2025-01-01T00:00:00.000Z' });
  expect((await finish(catalog, context)).last.sessions.some(session => session.id === 'work-old')).toBe(false);
  vi.mocked(io.opendir).mockClear();
  expect(await catalog.resolve('work-old')).toEqual({ ok: true, sessionId: 'work-old' });
  expect(io.opendir).not.toHaveBeenCalled();
  expect(await catalog.resolve('work-')).toMatchObject({ ok: false, reason: 'ambiguous',
    candidates: expect.arrayContaining([expect.objectContaining({ id: 'work-old' }), expect.objectContaining({ id: 'work-recent' })]) });
  expect(await catalog.resolve('Shared work')).toMatchObject({ ok: false, reason: 'ambiguous' });
  expect(await catalog.resolve('work-o')).toEqual({ ok: true, sessionId: 'work-old' });
});

it('matches full stored titles without treating a long title as an unreadable ID path', async () => {
  const { layout, catalog } = fixture();
  const longTitle = 'x'.repeat(520) + 'needle';
  seed(layout, 'long-title', { title: longTitle });
  seed(layout, 'short-title', { title: 'needle' });
  expect(await catalog.resolve('needle')).toMatchObject({ ok: false, reason: 'ambiguous' });
  expect(await catalog.resolve(longTitle)).toEqual({ ok: true, sessionId: 'long-title' });
});

it('refuses unproven recency and inferred-title matches from a limited summary while keeping IDs usable', async () => {
  const { layout, catalog } = fixture();
  const large = seed(layout, 'large-history', { updatedAt: '2026-10-06T00:00:00.000Z' });
  seed(layout, 'small-history', { title: 'Conversation small', updatedAt: '2026-10-07T00:00:00.000Z' });
  fs.appendFileSync(large.layout.transcriptPath, Array.from({ length: 40 }, (_, index) => JSON.stringify(
    createMessageTranscriptEvent({ id: `large-${index}`, role: 'assistant', content: 'x'.repeat(60_000), timestamp: large.session.updatedAt }),
  )).join('\n') + '\n');
  fs.appendFileSync(large.layout.transcriptPath, JSON.stringify({ type: 'command-output', id: 'newer-report',
    sourceEntryId: sessionRootEntryId('large-history'), timestamp: '2026-10-08T00:00:00.000Z',
    text: 'Most recent report' }) + '\n');
  expect(loadSessionRecord({ sessionId: 'large-history', layout: large.layout, cwd: '/workspace' }).updatedAt).toBe('2026-10-08T00:00:00.000Z');
  expect(await catalog.resolve('last')).toMatchObject({ ok: false, reason: 'incomplete' });
  expect(await catalog.resolve('Conversation')).toMatchObject({ ok: false, reason: 'incomplete' });
  expect(await catalog.resolve('large-')).toEqual({ ok: true, sessionId: 'large-history' });
});

it('resolves last by recency and keeps explicit project scope distinct from a preference', async () => {
  const { layout, catalog } = fixture();
  seed(layout, 'older', { title: 'Shared title', status: 'interrupted', updatedAt: '2026-10-06T00:00:00.000Z' });
  seed(layout, 'newest', { updatedAt: '2026-10-07T00:00:00.000Z' });
  seed(layout, 'foreign', { projectRoot: '/elsewhere', title: 'Shared title', updatedAt: '2026-10-08T00:00:00.000Z' });
  expect(await catalog.resolve('last', { projectRoot: '/workspace' })).toEqual({ ok: true, sessionId: 'newest' });
  expect(await catalog.resolve('latest')).toEqual({ ok: true, sessionId: 'foreign' });
  expect(await catalog.resolve('Shared title', { projectRoot: '/workspace' })).toMatchObject({ reason: 'ambiguous' });
  expect(await catalog.resolve('Shared title', { projectRoot: '/workspace', strictProject: true })).toEqual({ ok: true, sessionId: 'older' });
  expect(await catalog.resolve('foreign', { projectRoot: '/workspace', strictProject: true })).toMatchObject({ ok: false, reason: 'outside-project' });
  expect(await catalog.resolve('foreign', { strictProject: true })).toMatchObject({ ok: false, reason: 'incomplete' });
});

it('keeps incomplete discovery distinct from unique or missing references while exact IDs remain usable', async () => {
  const { layout, catalog } = fixture();
  seed(layout, 'good', { title: 'Only readable title' });
  const broken = seed(layout, 'broken'); fs.writeFileSync(broken.layout.metadataPath, '{');
  expect(await catalog.resolve('Only readable')).toMatchObject({ ok: false, reason: 'incomplete' });
  expect(await catalog.resolve('Not present')).toMatchObject({ ok: false, reason: 'incomplete' });
  expect(await catalog.resolve('good')).toEqual({ ok: true, sessionId: 'good' });
  expect(await catalog.resolve('broken')).toEqual({ ok: true, sessionId: 'broken' });
  const legacy = seed(layout, 'legacy-unscoped');
  for (const file of [legacy.layout.metadataPath, legacy.layout.statePath]) {
    const value = JSON.parse(fs.readFileSync(file, 'utf8')); delete value.projectRoot;
    fs.writeFileSync(file, JSON.stringify(value));
  }
  seed(layout, 'oversize-title', { title: 'x'.repeat(CATALOG_LIMITS.metadataBytes) });
  vi.mocked(io.open).mockClear(); vi.mocked(io.opendir).mockClear();
  expect(await catalog.resolve('legacy-unscoped')).toEqual({ ok: true, sessionId: 'legacy-unscoped' });
  expect(await catalog.resolve('oversize-title')).toEqual({ ok: true, sessionId: 'oversize-title' });
  expect(io.open).not.toHaveBeenCalled(); expect(io.opendir).not.toHaveBeenCalled();
  expect(await catalog.resolve('legacy-unscoped', { projectRoot: '/workspace', strictProject: true }))
    .toMatchObject({ ok: false, reason: 'incomplete' });
});

it('uses the authoritative layout once when matching a reference across historical directories', async () => {
  const { layout, root } = fixture();
  const history = path.join(root, 'history');
  seed(layout, 'saved', { title: 'Current title' });
  seed({ ...layout, sessionsDir: history }, 'saved', { title: 'Historical title' });
  seed({ ...layout, sessionsDir: history }, 'legacy', { title: 'Legacy title' });
  const catalog = new SessionCatalog({ ...layout, sessionsSearchDirs: [layout.sessionsDir, history] });
  expect(await catalog.resolve('Current title')).toEqual({ ok: true, sessionId: 'saved' });
  expect(await catalog.resolve('Historical title')).toMatchObject({ ok: false, reason: 'not-found' });
  expect(await catalog.resolve('Legacy title')).toEqual({ ok: true, sessionId: 'legacy' });
});
