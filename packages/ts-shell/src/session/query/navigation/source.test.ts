import fs from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { SessionManager } from '../../SessionManager.js';
import { readSessionNavigation, projectSessionNavigation } from '../navigation.js';
import { createSessionStoreLayout, locateExistingSessionLayout } from '../../store/sessionFileLayout.js';
import { NAVIGATION_LIMITS } from './limits.js';
import { readJsonFileWithRetry } from '../../store/sessionFileStore.js';
import { parseTranscript } from '../../transcript/sessionTranscript.js';
import { readSessionRecordSnapshot } from '../../store/sessionStore.js';
import { catchUpSessionThread, sessionThreadPath, type SessionThreadSnapshot } from '../../schema/sessionThread.js';

let root: string | undefined;
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); if (root) fs.rmSync(root, { recursive: true, force: true }); root = undefined; });

function saved() {
  root = fs.mkdtempSync(path.join(process.cwd(), '.tmp-navigation-'));
  const home = path.join(root, 'home'); fs.mkdirSync(home);
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home); vi.stubEnv('CHEERS_TEST_ROOT', home);
  const manager = new SessionManager(); const session = manager.createNew(root);
  return { session, layout: locateExistingSessionLayout(createSessionStoreLayout(), session.id), cwd: root };
}

it('reads one admitted saved snapshot without changing durable files', () => {
  const { session, layout, cwd } = saved();
  const targets = [layout.metadataPath, layout.statePath, layout.transcriptPath];
  const before = targets.map(target => fs.readFileSync(target));
  const snapshot = readSessionNavigation(session.id, cwd);
  expect(snapshot.points).toHaveLength(1);
  expect(snapshot.points[0]).toMatchObject({ label: 'Session start', current: true });
  expect(targets.map(target => fs.readFileSync(target))).toEqual(before);
});

it.each(['metadataPath', 'statePath', 'transcriptPath'] as const)('rejects an oversized %s before any source read', key => {
  const { session, layout, cwd } = saved();
  const limits = { metadataPath: NAVIGATION_LIMITS.metadataBytes, statePath: NAVIGATION_LIMITS.stateBytes, transcriptPath: NAVIGATION_LIMITS.transcriptBytes };
  fs.truncateSync(layout[key], limits[key] + 1);
  const read = vi.spyOn(fs, 'readFileSync');
  expect(() => readSessionNavigation(session.id, cwd)).toThrow('navigation limits');
  expect(read).not.toHaveBeenCalled();
});

it('enforces descriptor byte limits even without preflight and rejects links', () => {
  const { layout } = saved(); const payload = '界'.repeat(20);
  fs.writeFileSync(layout.metadataPath, JSON.stringify({ payload }));
  expect(() => readJsonFileWithRetry(layout.metadataPath, { required: true, parseErrorDetail: 'bad', maxBytes: 30 })).toThrow('size limit');
  fs.renameSync(layout.metadataPath, layout.metadataPath + '.original');
  fs.symlinkSync(layout.metadataPath + '.original', layout.metadataPath);
  expect(() => readJsonFileWithRetry(layout.metadataPath, { required: true, parseErrorDetail: 'bad', maxBytes: 1000 })).toThrow();
});

it('refuses malformed transcript acquisition while ordinary replay retains its compatibility warnings', () => {
  const { session, layout, cwd } = saved();
  fs.appendFileSync(layout.transcriptPath, '{broken-json}\n');
  expect(parseTranscript(fs.readFileSync(layout.transcriptPath, 'utf8')).unreadableLines).toBe(1);
  expect(() => readSessionNavigation(session.id, cwd)).toThrow('damaged');
});

it('refuses a persisted active leaf missing from an empty tree instead of reporting no history', () => {
  const { session, layout, cwd } = saved();
  const state = JSON.parse(fs.readFileSync(layout.statePath, 'utf8')); state.thread.entries = [];
  fs.writeFileSync(layout.statePath, JSON.stringify(state));
  expect(() => readSessionNavigation(session.id, cwd)).toThrow('missing active entry');
});

it('refuses a missing persisted active leaf before catch-up can conceal it with a new message', () => {
  const { session, layout, cwd } = saved();
  const state = JSON.parse(fs.readFileSync(layout.statePath, 'utf8')); state.thread.activeLeafId = 'missing';
  fs.writeFileSync(layout.statePath, JSON.stringify(state));
  fs.appendFileSync(layout.transcriptPath, JSON.stringify({ type: 'message', id: 'fresh', role: 'user', content: 'fresh', timestamp: session.createdAt }) + '\n');
  expect(() => readSessionNavigation(session.id, cwd)).toThrow('missing active entry');
});

it('refuses duplicate message identities instead of replacing an offered node with the last content', () => {
  const { session, layout, cwd } = saved();
  const base = { type: 'message', id: 'same-id', role: 'user', timestamp: session.createdAt };
  fs.appendFileSync(layout.transcriptPath, [JSON.stringify({ ...base, content: 'original' }), JSON.stringify({ ...base, content: 'different' })].join('\n') + '\n');
  expect(() => readSessionNavigation(session.id, cwd)).toThrow('duplicate entry');
});

it('does not charge durable context summaries against linear tree node admission', () => {
  const { session, layout, cwd } = saved();
  const state = JSON.parse(fs.readFileSync(layout.statePath, 'utf8')); delete state.thread;
  fs.writeFileSync(layout.statePath, JSON.stringify(state));
  fs.appendFileSync(layout.transcriptPath, [
    JSON.stringify({ type: 'message', id: 'question', role: 'user', content: 'question', timestamp: session.createdAt }),
    JSON.stringify({ type: 'message', id: 'summary', role: 'user', content: 'context', metadata: { contextSummary: 'branch' }, timestamp: session.createdAt }),
  ].join('\n') + '\n');
  const snapshot = readSessionRecordSnapshot({ sessionId: session.id, layout, cwd, limits: { ...NAVIGATION_LIMITS, entries: 2 } });
  expect(snapshot.session.turns).toHaveLength(2);
  expect(() => readSessionRecordSnapshot({ sessionId: session.id, layout, cwd, limits: { ...NAVIGATION_LIMITS, entries: 1 } })).toThrow('entry limit');
});

it('refuses a node overflow before reading the transcript and a line overflow before decoding', () => {
  const { session, layout, cwd } = saved();
  const state = JSON.parse(fs.readFileSync(layout.statePath, 'utf8'));
  state.thread.entries = Array.from({ length: NAVIGATION_LIMITS.entries + 1 }, (_, i) => ({ id: String(i), kind: 'session-root', order: i }));
  fs.writeFileSync(layout.statePath, JSON.stringify(state));
  expect(() => readSessionNavigation(session.id, cwd)).toThrow('entry limit');
  expect(() => parseTranscript('\n'.repeat(NAVIGATION_LIMITS.transcriptLines + 1), NAVIGATION_LIMITS.transcriptLines)).toThrow('line limit');
  expect(parseTranscript('\n\n', 2).events).toEqual([]);
});

it('rejects duplicate saved identities and retains a deep ordered path with no front insertion', () => {
  const thread: SessionThreadSnapshot = { schemaVersion: 1, branches: [], compactions: [], activeLeafId: '19999',
    entries: Array.from({ length: 20_000 }, (_, i) => ({ id: String(i), kind: 'session-root', order: i, ...(i ? { parentId: String(i - 1) } : {}) })) };
  const unshift = vi.spyOn(Array.prototype, 'unshift');
  const result = sessionThreadPath(thread);
  expect(unshift).not.toHaveBeenCalled(); unshift.mockRestore();
  expect(result.resolved).toBe(true); expect(result.path.map(x => x.id)).toEqual(thread.entries.map(x => x.id));
  expect(projectSessionNavigation(thread, [])).toHaveLength(20_000);
  expect(() => catchUpSessionThread(thread, { id: 'saved', turns: [{ id: 'new', role: 'user', content: 'missing' }] } as never, NAVIGATION_LIMITS.entries)).toThrow('entry limit');
  expect(() => projectSessionNavigation({ ...thread, entries: [thread.entries[0]!, thread.entries[0]!] }, [])).toThrow('duplicate');
});
