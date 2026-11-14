import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { SessionManager } from '../SessionManager.js';
import type { SessionMessage } from '../schema/sessionMessage.js';
import type { Session } from '../schema/sessionRecord.js';
import type { RequestDeclaration } from '../../core/agent/declarations/model.js';
import { classifyTranscriptLine, createMessageTranscriptEvent, encodeTranscriptEvent, transcriptEventToSessionMessage } from '../sessionEventCodec.js';
import { appendSessionTurn, appendTranscriptEvent, readTranscriptSnapshot, readTranscriptSnapshotAsync, TranscriptAppendError } from './sessionTranscript.js';

const roots: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs(); vi.restoreAllMocks();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cheers-declaration-')); roots.push(root);
  vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('CHEERS_TEST_ROOT', root);
  const manager = new SessionManager();
  return { manager, session: manager.createNew(root), root };
}

function message(id = 'declaration-low', effort = 'low'): SessionMessage & {
  readonly role: 'system'; readonly timestamp: string; readonly requestDeclaration: RequestDeclaration;
} {
  return { id, role: 'system', content: '', timestamp: '2026-11-15T00:00:00Z', requestDeclaration: {
    version: 1, target: { provider: 'fixture', model: 'm', endpoint: 'anthropic-messages', replayBinding: 'a'.repeat(64) },
    tools: [{ type: 'function', function: { name: 'read', description: 'Read a file', parameters: { type: 'object' } } }], effort,
  } };
}

it('keeps declaration fields, IDs, timestamps and positions through codecs', () => {
  const original = message();
  const event = createMessageTranscriptEvent(original as SessionMessage & { timestamp: string });
  const decoded = classifyTranscriptLine(JSON.stringify(event));
  expect(decoded.kind).toBe('entry');
  if (decoded.kind !== 'entry') return;
  expect(transcriptEventToSessionMessage(decoded.event)).toMatchObject(original);
  expect(Object.isFrozen(event.requestDeclaration)).toBe(true);
});

it('reopens and forks complete declaration history in its original order', () => {
  const { manager, session, root } = fixture();
  manager.addTurn(session.id, { id: 'first-user', role: 'user', content: 'first' });
  manager.addTurn(session.id, message());
  manager.addTurn(session.id, { id: 'first-answer', role: 'assistant', content: 'done' });
  manager.addTurn(session.id, { id: 'second-user', role: 'user', content: 'second' });
  manager.addTurn(session.id, message('declaration-high', 'high'));
  const before = manager.getSession(session.id)!.turns;
  expect(before.map(entry => entry.id)).toEqual(['first-user', 'declaration-low', 'first-answer', 'second-user', 'declaration-high']);
  expect(before.filter(entry => entry.role === 'system').map(entry => entry.requestDeclaration?.effort)).toEqual(['low', 'high']);
  const reopened = new SessionManager();
  expect(reopened.getSession(session.id)!.turns).toEqual(before);
  const fork = reopened.fork(session.id, root, { activate: false });
  const loaded = new SessionManager().getSession(fork.id)!;
  expect(loaded.turns).toEqual(before);
  expect(loaded.turns.map(entry => entry.id)).toEqual(['first-user', 'declaration-low', 'first-answer', 'second-user', 'declaration-high']);
  expect(loaded.turns.filter(entry => entry.role === 'system').map(entry => entry.requestDeclaration?.effort)).toEqual(['low', 'high']);
});

it('keeps a refused append out of memory and preserves the original append error', () => {
  const { session } = fixture(); const before = JSON.stringify(session);
  const refusal = new TranscriptAppendError('unchanged'); const metadata = vi.fn(); const state = vi.fn();
  expect(() => appendSessionTurn({ session, message: message(), timestamp: '2026-11-15T00:00:01Z',
    append: () => { throw refusal; }, writeMetadata: metadata, writeState: state })).toThrow(refusal);
  expect(JSON.stringify(session)).toBe(before); expect(metadata).not.toHaveBeenCalled(); expect(state).not.toHaveBeenCalled();
});

it.each(['append', 'metadata', 'state'] as const)('leaves uncertain disk data available to read without publishing live history after %s failure', failure => {
  const { session, root } = fixture(); const before = JSON.stringify(session);
  const file = path.join(root, 'uncertain.jsonl'); const uncertain = new TranscriptAppendError('unknown');
  const nextSession = (next: Session) => {
    expect(next.turns.at(-1)).toMatchObject({ id: 'declaration-low', requestDeclaration: message().requestDeclaration });
  };
  expect(() => appendSessionTurn({ session, message: message(), timestamp: '2026-11-15T00:00:01Z',
    append: event => { appendTranscriptEvent(file, event); if (failure === 'append') throw uncertain; },
    writeMetadata: next => { nextSession(next); if (failure === 'metadata') throw uncertain; },
    writeState: next => { nextSession(next); if (failure === 'state') throw uncertain; },
  })).toThrow(uncertain);
  expect(JSON.stringify(session)).toBe(before);
  const snapshot = readTranscriptSnapshot(file);
  expect(snapshot.events).toHaveLength(1);
  expect(transcriptEventToSessionMessage(snapshot.events[0]!)).toMatchObject({ id: 'declaration-low',
    requestDeclaration: message().requestDeclaration, timestamp: '2026-11-15T00:00:01Z' });
});

it('refuses malformed persisted declarations instead of dropping their field', async () => {
  const { root } = fixture();
  const good = createMessageTranscriptEvent(message() as SessionMessage & { timestamp: string });
  const invalid = { ...good, requestDeclaration: { ...message().requestDeclaration, version: 2 } };
  expect(classifyTranscriptLine(JSON.stringify(invalid)).kind).toBe('unreadable');
  const file = path.join(root, 'invalid.jsonl'); fs.writeFileSync(file, JSON.stringify(invalid));
  const limits = { maxBytes: 1024 * 1024, maxLines: 10 };
  expect(() => readTranscriptSnapshot(file, limits)).toThrow('damaged');
  await expect(readTranscriptSnapshotAsync(file, limits)).rejects.toThrow('damaged');
  expect(() => transcriptEventToSessionMessage(invalid as unknown as typeof good)).toThrow();
});

it.each(['user', 'assistant', 'tool', 'custom'])('makes a persisted %s declaration unreadable', role => {
  const source = { ...message(), role, type: 'message',
    ...(role === 'custom' ? { customType: 'note', display: false } : {}) };
  expect(classifyTranscriptLine(JSON.stringify(source)).kind).toBe('unreadable');
  expect(() => createMessageTranscriptEvent(source as unknown as SessionMessage & { timestamp: string })).toThrow();
});

it.each([
  { content: 'declaration text' },
  { requestDeclaration: { ...message().requestDeclaration, tools: [...message().requestDeclaration.tools, ...message().requestDeclaration.tools] } },
  { requestDeclaration: { ...message().requestDeclaration, target: { ...message().requestDeclaration.target, replayBinding: 'bad' } } },
  { requestDeclaration: { ...message().requestDeclaration, tools: [{ type: 'function', function: { name: 'read', parameters: [] } }] } },
])('makes malformed persisted declaration content, names, target or schema unreadable: %j', patch => {
  expect(classifyTranscriptLine(JSON.stringify({ ...message(), type: 'message', ...patch })).kind).toBe('unreadable');
});

it('does not touch the transcript when a declaration exceeds the captured byte budget', () => {
  const { manager, session } = fixture();
  expect(() => manager.addTurn(session.id, { ...message(), requestDeclaration: { ...message().requestDeclaration,
    tools: [{ type: 'function', function: { name: 'read', parameters: { description: 'x'.repeat(4 * 1024 * 1024) } } }] },
  })).toThrow();
  expect(manager.getSession(session.id)!.turns).toEqual([]); expect(new SessionManager().getSession(session.id)!.turns).toEqual([]);
});

it('refuses an accessor before append and detaches successful message data from its caller', () => {
  const { manager, session } = fixture();
  const getter = vi.fn();
  const bad = Object.defineProperty({ ...message() }, 'requestDeclaration', { enumerable: true, get: getter });
  expect(() => manager.addTurn(session.id, bad)).toThrow(); expect(getter).not.toHaveBeenCalled();
  expect(manager.getSession(session.id)!.turns).toEqual([]);
  const source = { ...message(), requestDeclaration: { ...message().requestDeclaration!, target: { ...message().requestDeclaration!.target } } } as SessionMessage;
  manager.addTurn(session.id, source);
  const current = manager.getSession(session.id)!;
  const mutable = source as unknown as { requestDeclaration: { target: { model: string } } };
  mutable.requestDeclaration.target.model = 'changed';
  expect(current.turns[0]).toMatchObject({ id: 'declaration-low', requestDeclaration: { target: { model: 'm' } } });
  expect(new SessionManager().getSession(session.id)!.turns[0]).toMatchObject({ requestDeclaration: { target: { model: 'm' } } });
});

it.each(['encode', 'append', 'existing'] as const)('rejects malformed declarations at the direct %s boundary before touching disk or invoking hooks', boundary => {
  const { root } = fixture();
  const file = path.join(root, 'direct.jsonl');
  if (boundary === 'existing') fs.writeFileSync(file, 'unchanged\n');
  const before = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : undefined;
  const hook = vi.fn(() => 'unsafe');
  const good = { ...message(), type: 'message' as const };
  const schema = Object.defineProperty({}, 'type', { enumerable: true, get: hook });
  const invalid = [
    { ...good, requestDeclaration: undefined },
    { ...good, requestDeclaration: { ...good.requestDeclaration, version: 2 } },
    { ...good, role: 'user' },
    { ...good, requestDeclaration: { ...good.requestDeclaration, toJSON: hook } },
    { ...good, requestDeclaration: { ...good.requestDeclaration, tools: [{ type: 'function', function: { name: 'read', parameters: schema } }] } },
    { ...good, requestDeclaration: { ...good.requestDeclaration, tools: [{ type: 'function', function: { name: 'read', parameters: { text: '界'.repeat(1_500_000) } } }] } },
    Object.defineProperty({ ...good }, 'type', { enumerable: true, get: hook }),
    new Proxy(good, { get: hook, ownKeys: hook as unknown as () => string[] }),
  ];
  for (const event of invalid) {
    const typed = event as unknown as Parameters<typeof encodeTranscriptEvent>[0];
    expect(() => boundary === 'encode' ? encodeTranscriptEvent(typed)
      : appendTranscriptEvent(file, typed, { sessionId: 'direct', timestamp: 't', cwd: root },
        boundary === 'existing' ? { requireExisting: true, durable: true } : undefined)).toThrow();
    expect(fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : undefined).toBe(before);
  }
  expect(hook).not.toHaveBeenCalled();
});
