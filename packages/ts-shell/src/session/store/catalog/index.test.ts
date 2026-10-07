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

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'session-catalog-')); roots.push(root);
  const layout = createSessionStoreLayout(root);
  fs.mkdirSync(layout.sessionsDir, { recursive: true });
  const context = { sessionId: 'current', projectRoot: '/workspace', busy: false };
  return { root, layout, context, catalog: new SessionCatalog(layout) };
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

it('drains dispatched reads on cancellation, closes the cursor, and dispatches no later files', async () => {
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
  const pending = query.next(); const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
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
  expect(io.open).not.toHaveBeenCalled(); expect(io.lstat).not.toHaveBeenCalled(); expect(io.opendir).not.toHaveBeenCalled();
});
