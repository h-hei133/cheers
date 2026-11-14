import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { SessionManager } from './SessionManager.js';
import type { SessionMessage } from './schema/sessionMessage.js';
import { restoreConversation } from '../cli/interactive/history.js';
import { gatherExport } from './export/collect.js';
import { decodeTranscriptLineSafe } from './sessionEventCodec.js';
import { appendSessionTurn } from './transcript/sessionTranscript.js';
import { exportHistory, parseHistory } from './history/model.js';
import { toChatMessages } from '../turn/prompt.js';
import { readSessionNavigation } from './query/navigation.js';

const roots: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cheers-custom-'));
  roots.push(root);
  vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('CHEERS_TEST_ROOT', root);
  const manager = new SessionManager();
  return { manager, session: manager.createNew(root), root };
}

const custom = (display: boolean): SessionMessage => ({ role: 'custom', customType: 'artifact',
  content: display ? 'Visible artifact' : 'Hidden artifact', display, data: { path: 'result.json', verified: false },
} as unknown as SessionMessage);

it('preserves custom messages and detached data through reopen and fork', () => {
  const { manager, session, root } = fixture();
  const message = custom(false);
  manager.addTurn(session.id, message);
  const reopened = new SessionManager();
  expect(reopened.getSession(session.id)!.turns[0]).toMatchObject(message);
  const fork = reopened.fork(session.id, root, { activate: false });
  expect(new SessionManager().getSession(fork.id)!.turns[0]).toMatchObject(message);
});

it('renders only visible custom content in the actual restored transcript and export', () => {
  const { manager, session, root } = fixture();
  manager.addTurn(session.id, custom(true));
  manager.addTurn(session.id, custom(false));
  const turns = new SessionManager().getSession(session.id)!.turns;
  const restored = restoreConversation(turns);
  expect(restored.blocks.map(block => block.text)).toContain('Visible artifact');
  expect(JSON.stringify(restored)).not.toContain('Hidden artifact');
  const exported = gatherExport({ sessionId: session.id, workspace: root });
  expect(exported.ok).toBe(true);
  if (!exported.ok) return;
  expect(exported.payload.entries.some(entry => entry.role === 'custom' && entry.content === 'Visible artifact')).toBe(true);
  expect(JSON.stringify(exported.payload)).not.toContain('Hidden artifact');
  expect(JSON.stringify(exported.payload)).not.toContain('result.json');
  expect(exported.payload.warnings).toEqual([]);
  const history = parseHistory(exportHistory(session.id, root));
  expect(history.entries).toHaveLength(1);
  expect(history.entries[0]).toMatchObject({ role: 'system', content: 'Visible artifact' });
  expect(history.leafId).toBe(history.entries[0]!.id);
  expect(toChatMessages(turns)).toEqual([{ role: 'user', content: 'Visible artifact' }, { role: 'user', content: 'Hidden artifact' }]);
});

it.each(['display', 'data', 'customType'] as const)('rejects malformed persisted custom %s', field => {
  const value = { ...custom(true), timestamp: '2026-11-14T00:00:00Z', type: 'message',
    [field]: field === 'display' ? 'yes' : field === 'data' ? { infinite: 1e400 } : '' };
  // JSON serialization normalizes Infinity, so use an overflowing JSON number directly.
  const line = JSON.stringify(value).replace('"infinite":null', '"infinite":1e400');
  expect(decodeTranscriptLineSafe(line)).toBeUndefined();
});

it('does not run custom data accessors or serialization hooks at ingestion', () => {
  const { manager, session } = fixture();
  const getter = vi.fn(() => 'secret');
  const data = Object.defineProperty({}, 'path', { enumerable: true, get: getter });
  expect(() => manager.addTurn(session.id, { ...custom(true), data } as SessionMessage)).toThrow();
  expect(getter).not.toHaveBeenCalled();
  const toJSON = vi.fn(() => ({ path: 'secret' }));
  expect(() => manager.addTurn(session.id, { ...custom(true), data: { toJSON } } as SessionMessage)).toThrow();
  expect(toJSON).not.toHaveBeenCalled();
  expect(new SessionManager().getSession(session.id)!.turns).toEqual([]);
});

it('refuses top-level role accessors and proxies before reading message properties', () => {
  const { manager, session } = fixture();
  const role = vi.fn(() => 'custom');
  const message = Object.defineProperty({ ...custom(true) }, 'role', { get: role });
  expect(() => manager.addTurn(session.id, message)).toThrow();
  expect(role).not.toHaveBeenCalled();
  const get = vi.fn(() => 'custom');
  expect(() => manager.addTurn(session.id, new Proxy(custom(true), { get }))).toThrow();
  expect(get).not.toHaveBeenCalled();
  expect(new SessionManager().getSession(session.id)!.turns).toEqual([]);
});

it('enforces the serialized data budget for finite numeric values', () => {
  const { manager, session } = fixture();
  const data = Object.fromEntries(Array.from({ length: 9998 }, (_, index) => [String(index), Number.MAX_VALUE]));
  expect(Buffer.byteLength(JSON.stringify(data))).toBeGreaterThan(256 * 1024);
  expect(() => manager.addTurn(session.id, { ...custom(true), data } as SessionMessage)).toThrow();
  expect(new SessionManager().getSession(session.id)!.turns).toEqual([]);
});

it('keeps hidden custom content out of tree labels and search projections', () => {
  const { manager, session, root } = fixture();
  manager.addTurn(session.id, custom(false));
  manager.addTurn(session.id, { role: 'user', content: 'Continue.' });
  const navigation = readSessionNavigation(session.id, root);
  expect(JSON.stringify(navigation.points)).not.toContain('Hidden artifact');
  expect(navigation.points.some(point => point.label.includes('Continue.'))).toBe(true);
  expect(navigation.actionSafe).toBe(true);
  expect(navigation.session.turns[0]).toMatchObject(custom(false));
});

it.each(['compaction', 'branch'])('keeps custom metadata named %s in durable history', contextSummary => {
  const { manager, session, root } = fixture();
  const message = { ...custom(false), metadata: { contextSummary } };
  manager.addTurn(session.id, message);
  manager.addTurn(session.id, { role: 'user', content: 'Continue.' });
  const reopened = new SessionManager();
  expect(reopened.getSession(session.id)!.turns[0]).toMatchObject(message);
  const fork = reopened.fork(session.id, root, { activate: false });
  expect(new SessionManager().getSession(fork.id)!.turns[0]).toMatchObject(message);
});

it('keeps an unpersisted custom append out of the live history on failure', () => {
  const { session } = fixture();
  const before = JSON.stringify(session);
  expect(() => appendSessionTurn({ session, message: custom(true), timestamp: '2026-11-14T00:00:01Z',
    append: () => { throw new Error('append refused'); }, writeMetadata: () => {}, writeState: () => {},
  })).toThrow('append refused');
  expect(JSON.stringify(session)).toBe(before);
});

it('detaches live custom data and leaves uncertain persistence failures unpublished', () => {
  const { session } = fixture();
  const payload = { ...custom(true), data: { nested: { path: 'original' } } } as SessionMessage;
  appendSessionTurn({ session, message: payload, timestamp: '2026-11-14T00:00:01Z',
    append: () => {}, writeMetadata: () => {}, writeState: () => {},
  });
  (payload as { data: { nested: { path: string } } }).data.nested.path = 'changed';
  expect(session.turns[0]).toMatchObject({ data: { nested: { path: 'original' } } });
  const before = JSON.stringify(session);
  const append = vi.fn();
  expect(() => appendSessionTurn({ session, message: custom(false), timestamp: '2026-11-14T00:00:02Z',
    append, writeMetadata: () => {}, writeState: () => { throw new Error('state outcome unknown'); },
  })).toThrow('state outcome unknown');
  expect(append).toHaveBeenCalledOnce();
  expect(JSON.stringify(session)).toBe(before);
});
