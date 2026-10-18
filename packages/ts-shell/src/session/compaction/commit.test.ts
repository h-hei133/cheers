import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SessionManager } from '../SessionManager.js';
import { compactSessionHistory } from '../../core/shell/compaction.js';
import { createCompactionStep } from '../compaction.js';
import { sessionCompactionAuthority } from './authority.js';
import { readSessionThreadSnapshot, switchDurableSessionActiveLeaf } from '../store/threadState.js';
import { SessionStoreAccess } from '../store/sessionStoreAccess.js';
import { encodeTranscriptEvent, classifyTranscriptLine } from '../sessionEventCodec.js';
import { CompactionPublicationError } from './contract.js';
import { runTurn } from '../../turn/session.js';
import type { AgentMessage } from '../../core/agent/state.js';

let home: string;
let manager: SessionManager;
let sessionId: string;
const policy = { contextWindow: 900, reserveTokens: 0, keepRecentTokens: 100 };
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'compact-commit-'));
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home);
  manager = new SessionManager(); sessionId = manager.createNew(home).id;
  for (let index = 0; index < 12; index++) manager.addTurn(sessionId, { role: index % 2 ? 'assistant' : 'user', content: `${index}:` + 'x'.repeat(500) });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(home, { force: true, recursive: true }); });
const compactions = () => manager.getTranscriptEvents(sessionId).filter(event => event.type === 'compaction');

it('keeps replay identity stable across unchanged configuration publications and instruction touches', async () => {
  const instructions = path.join(home, 'AGENTS.md');
  fs.writeFileSync(instructions, 'Same instruction bytes.');
  const capture = () => manager.captureCompactionSource(sessionId);
  const makeAuthority = () => sessionCompactionAuthority({ sessionId, workspaceRoot: home, admission: () => undefined,
    isCurrent: () => true, capture, commit: input => manager.appendCompactionIfCurrent(input) });
  const first = makeAuthority();
  const summarize = vi.fn(async () => undefined);
  await compactSessionHistory({ store: manager, sessionId, policy, authority: first, summarize });
  fs.utimesSync(instructions, new Date(), new Date(Date.now() + 60_000));
  expect(first.admission?.()).toContain('instructions changed');
  const restarted = makeAuthority();
  expect(restarted.identity).toBe(first.identity);
  expect(await compactSessionHistory({ store: manager, sessionId, policy, authority: restarted, summarize })).toMatchObject({ status: 'failed' });
  expect(summarize).toHaveBeenCalledOnce();
});

it('rechecks native metadata writes made by final admission before appending', () => {
  const source = manager.captureCompactionSource(sessionId);
  let checks = 0;
  const result = manager.appendCompactionIfCurrent({ source, summary: 'stale', keptMessages: 1, tokensBefore: 2000,
    admission: () => { if (++checks === 2) manager.renameSession(sessionId, 'Concurrent rename'); return undefined; } });
  expect(result.status).toBe('refused');
  expect(compactions()).toHaveLength(0);
});

it('rechecks cancellation caused by final admission before the append effect', () => {
  const source = manager.captureCompactionSource(sessionId);
  const controller = new AbortController(); let checks = 0;
  const result = manager.appendCompactionIfCurrent({ source, summary: 'cancelled', keptMessages: 1, tokensBefore: 2000,
    signal: controller.signal, admission: () => { if (++checks === 2) controller.abort(); return undefined; } });
  expect(result.status).toBe('refused');
  expect(compactions()).toHaveLength(0);
});

it('writes prepared summaries with a distinct wire type and preserves inertness on decode', () => {
  const line = encodeTranscriptEvent({ type: 'compaction', id: 'prepared', publication: 'prepared',
    summary: 'inert', keptMessages: 1, sourceActivePath: ['root', 'leaf'], timestamp: new Date().toISOString() });
  expect(JSON.parse(line).type).toBe('compaction-prepared');
  expect(classifyTranscriptLine(line)).toMatchObject({ kind: 'entry', event: { type: 'compaction', publication: 'prepared' } });
});

it('propagates uncertain automatic publication without updating context or PostCompact', async () => {
  const authority = sessionCompactionAuthority({ sessionId, workspaceRoot: home, admission: () => undefined,
    isCurrent: () => true, capture: () => manager.captureCompactionSource(sessionId),
    commit: () => ({ status: 'unverified', reason: 'private detail' }) });
  const after = vi.fn(); const onCompact = vi.fn();
  const step = createCompactionStep(policy, { sessionId, authority, summarize: async () => 'summary',
    lifecycle: { after }, onCompact });
  await expect(step({ messages: manager.getSession(sessionId)!.turns, stepCount: 1 } as never)).rejects.toThrow(CompactionPublicationError);
  expect(after).not.toHaveBeenCalled(); expect(onCompact).not.toHaveBeenCalled();
});

it.each(['cancel', 'turn', 'branch-return', 'model', 'rebind', 'replacement', 'profile-replacement'])('refuses a late manual append after %s', async kind => {
  const before = manager.getSession(sessionId)!.turns;
  const controller = new AbortController();
  const events: string[] = [];
  const outcome = await compactSessionHistory({ store: manager, sessionId, policy, signal: controller.signal,
    hooks: { dispatch: async (event: { eventName: string }) => { events.push(event.eventName); return { decision: 'allow' }; } } as never,
    summarize: async () => {
      if (kind === 'cancel') controller.abort();
      if (kind === 'turn') manager.addTurn(sessionId, { role: 'user', content: 'new work' });
      if (kind === 'branch-return') {
        const store = new SessionStoreAccess(); const session = store.load(sessionId); const layout = store.stateLayout(sessionId);
        const thread = readSessionThreadSnapshot({ session, layout });
        switchDurableSessionActiveLeaf({ session, layout, leafEntryId: thread.entries[1]!.id });
        switchDurableSessionActiveLeaf({ session, layout, leafEntryId: thread.activeLeafId! });
      }
      if (kind === 'model') {
        const store = new SessionStoreAccess(); const target = store.statePath(sessionId);
        store.writeJsonFileAtomic(target, { ...store.readStateSnapshotRequired(target), modelRevision: 'next' });
      }
      if (kind === 'rebind') manager.rebindSessionProjectRoot(sessionId, path.join(home, 'next'));
      if (kind === 'replacement') {
        const directory = manager.getSessionDirPath(sessionId); const copy = `${directory}-copy`;
        fs.cpSync(directory, copy, { recursive: true }); fs.rmSync(directory, { recursive: true }); fs.renameSync(copy, directory);
      }
      if (kind === 'profile-replacement') {
        const directory = path.join(home, '.cheers'); const copy = `${directory}-copy`;
        fs.cpSync(directory, copy, { recursive: true }); fs.rmSync(directory, { recursive: true }); fs.renameSync(copy, directory);
      }
      return 'summary';
    } });
  expect(outcome.status).toBe('failed');
  expect(compactions()).toHaveLength(0);
  expect(events).toEqual(['PreCompact']);
  if (kind === 'cancel') expect(manager.getSession(sessionId)!.turns).toEqual(before);
});

it('verifies durable append before PostCompact and publishes once in manual/automatic competition', async () => {
  let resolve!: () => void;
  const pending = new Promise<void>(done => { resolve = done; });
  const summarize = vi.fn(async () => { await pending; return 'summary'; });
  const authority = sessionCompactionAuthority({ sessionId, workspaceRoot: home, admission: () => undefined,
    isCurrent: () => true, capture: () => manager.captureCompactionSource(sessionId), commit: input => manager.appendCompactionIfCurrent(input) });
  const manual = compactSessionHistory({ store: manager, sessionId, policy, summarize, authority,
    hooks: { dispatch: async (event: { eventName: string }) => {
      if (event.eventName === 'PostCompact') expect(compactions()).toHaveLength(1);
      return { decision: 'allow' }; } } as never });
  const automatic = createCompactionStep(policy, { sessionId, summarize, authority })({ messages: manager.getSession(sessionId)!.turns, stepCount: 1 } as never);
  resolve();
  const results = await Promise.all([manual, automatic]);
  expect(results[0]).toMatchObject({ status: 'compacted' });
  expect(results[1]).toBeUndefined();
  expect(summarize).toHaveBeenCalledOnce();
  expect(compactions()).toHaveLength(1);
});

it.each(['automatic', 'manual-first', 'automatic-first'])('compacts native runtime system and opening messages (%s)', async mode => {
  const history = manager.getSession(sessionId)!.turns;
  let release!: () => void;
  let started!: () => void;
  const ready = new Promise<void>(done => { started = done; });
  const pending = new Promise<void>(done => { release = done; });
  const summarize = vi.fn(async (request: { messages: readonly AgentMessage[] }) => {
    expect(request.messages.some(message => message.role === 'system' || String(message.content).includes('Environment Context'))).toBe(false);
    started(); await pending; return 'summary';
  });
  const authority = sessionCompactionAuthority({ sessionId, workspaceRoot: home, admission: () => undefined,
    isCurrent: () => true, capture: () => manager.captureCompactionSource(sessionId), commit: input => manager.appendCompactionIfCurrent(input) });
  const events: string[] = [];
  const hooks = { dispatch: async (event: { eventName: string }) => {
    events.push(event.eventName);
    if (event.eventName === 'PostCompact') expect(compactions()).toHaveLength(1);
    return { decision: 'allow' as const };
  } };
  const compact = () => compactSessionHistory({ store: manager, sessionId, policy, summarize, authority, hooks: hooks as never });
  let manual: ReturnType<typeof compact> | undefined;
  const sent: AgentMessage[][] = [];
  const step = vi.fn(async (messages: readonly AgentMessage[]) => {
    sent.push([...messages]);
    return sent.length === 1
      ? { text: '', toolCalls: [{ id: 'read-current', name: 'read', args: {} }], stopReason: 'stop' as const }
      : { text: 'done', toolCalls: [], stopReason: 'stop' as const };
  });
  const run = runTurn({ sessionId, workspaceRoot: home, prompt: 'keep opening', permissionScope: 'allow-all',
    history: [{ role: 'system', content: 'runtime system' }, ...history],
    onPromptAccepted: () => {
      manager.persistUserPromptBarrier(sessionId, 'keep opening');
    },
    onMessage: message => manager.addTurn(sessionId, message), step,
    observe: event => { if (event.type === 'turn_end' && event.willContinue && mode === 'manual-first') manual = compact(); },
    tools: new Map([['read', { name: 'read', description: 'read', argsSchema: { type: 'object', properties: {} },
      execute: async () => ({ success: true, output: 'read output' }) }]]), hooks: hooks as never,
    maxSteps: 2, signal: new AbortController().signal,
    compaction: { policy, summarize, authority, onCompact: () => undefined },
  });
  const drained = (async () => { for await (const _event of run.events) { /* Drain the real turn lifecycle. */ } })();
  await ready;
  if (mode === 'automatic-first') manual = compact();
  release();
  await drained;
  if (manual) expect(await manual).toMatchObject({ status: mode === 'manual-first' ? 'compacted' : 'failed' });
  expect(summarize).toHaveBeenCalledOnce();
  expect(compactions()).toHaveLength(1);
  expect(events.filter(event => event === 'PostCompact')).toHaveLength(1);
  expect(step).toHaveBeenCalledTimes(2);
  expect(sent[0]![0]).toMatchObject({ role: 'system', content: 'runtime system' });
  expect(sent[0]!.at(-1)!.content).toContain('Environment Context');
  expect(sent[0]!.at(-1)!.content).toContain('keep opening');
  if (mode !== 'manual-first') {
    expect(sent[1]![1]!.content).toBe('[Context Checkpoint]\nsummary');
    const opening = sent[1]!.find(message => String(message.content).includes('Environment Context'));
    expect(opening?.content).toContain('keep opening');
  }
});

it.each(['instructions', 'publication-return'])('refuses publication after %s changed', async kind => {
  fs.writeFileSync(path.join(home, 'AGENTS.md'), 'original');
  const original = {}; let publication = original;
  const authority = sessionCompactionAuthority({ sessionId, workspaceRoot: home, admission: () => undefined,
    isCurrent: () => publication === original, capture: () => manager.captureCompactionSource(sessionId), commit: input => manager.appendCompactionIfCurrent(input) });
  const outcome = await compactSessionHistory({ store: manager, sessionId, policy, authority, summarize: async () => {
    if (kind === 'instructions') fs.writeFileSync(path.join(home, 'AGENTS.md'), 'changed');
    else { publication = {}; publication = { sameValues: true }; }
    return 'summary';
  } });
  expect(outcome).toMatchObject({ status: 'failed', reason: expect.stringContaining(kind === 'instructions' ? 'instructions changed' : 'Configuration changed') });
  expect(compactions()).toHaveLength(0);
});

it('keeps an unverified native append distinct from successful publication', async () => {
  const source = manager.captureCompactionSource(sessionId);
  const history = manager.getSession(sessionId)!.turns;
  const fsync = vi.spyOn(fs, 'fsyncSync').mockImplementation(() => { throw new Error('durability failed'); });
  const result = manager.appendCompactionIfCurrent({ source, summary: 'retained material', keptMessages: 1, tokensBefore: 2000 });
  fsync.mockRestore();
  expect(result.status).toBe('unverified');
  // The effect may exist, but no successful compaction outcome is authorized.
  expect(compactions()).toHaveLength(1);
  expect(manager.getSession(sessionId)!.turns).toEqual(history);
  expect(new SessionManager().getSession(sessionId)!.turns).toEqual(history);
});

it('keeps current publication unverified and permits later exact marker recovery', async () => {
  const source = manager.captureCompactionSource(sessionId);
  const original = fs.fsyncSync;
  const onCompact = vi.fn(); const after = vi.fn();
  let calls = 0;
  const fsync = vi.spyOn(fs, 'fsyncSync').mockImplementation(fd => { if (++calls === 2) throw new Error('marker durability uncertain'); original(fd); });
  const authority = sessionCompactionAuthority({ sessionId, workspaceRoot: home, admission: () => undefined,
    isCurrent: () => true, capture: () => source, commit: input => manager.appendCompactionIfCurrent(input) });
  await expect(createCompactionStep(policy, { sessionId, authority, summarize: async () => 'verified summary',
    onCompact, lifecycle: { after } })({ messages: source.history, stepCount: 1 } as never)).rejects.toThrow(CompactionPublicationError);
  fsync.mockRestore();
  expect(onCompact).not.toHaveBeenCalled();
  expect(after).not.toHaveBeenCalled();
  expect(manager.getSession(sessionId)!.turns[0]!.content).toBe('[Context Checkpoint]\nverified summary');
  expect(new SessionManager().getSession(sessionId)!.turns[0]!.content).toBe('[Context Checkpoint]\nverified summary');
});

it('applies a receipt only to its captured branch and new descendants', async () => {
  const history = manager.getSession(sessionId)!.turns;
  const source = manager.captureCompactionSource(sessionId);
  expect(manager.appendCompactionIfCurrent({ source, summary: 'future summary', keptMessages: 1, tokensBefore: 2000 })).toEqual({ status: 'committed' });
  const receipt = compactions()[0]!;
  expect(receipt).toMatchObject({ sourceActivePath: source.sourceActivePath });
  const leaf = source.sourceActivePath!.at(-1)!;
  const earlier = history[1]!.id!;
  const switchLeaf = (leafEntryId: string) => {
    const store = new SessionStoreAccess(); const session = store.load(sessionId);
    switchDurableSessionActiveLeaf({ session, layout: store.stateLayout(sessionId), leafEntryId });
  };
  switchLeaf(earlier);
  expect(new SessionManager().getSession(sessionId)!.turns).toEqual(history.slice(0, 2));
  manager.addTurn(sessionId, { role: 'user', content: 'sibling work' });
  const sibling = manager.getSession(sessionId)!.turns.at(-1)!.id!;
  expect(new SessionManager().getSession(sessionId)!.turns.map(turn => turn.content)).toEqual([...history.slice(0, 2).map(turn => turn.content), 'sibling work']);
  switchLeaf(leaf);
  expect(new SessionManager().getSession(sessionId)!.turns.map(turn => turn.content)).toEqual(['[Context Checkpoint]\nfuture summary', history.at(-1)!.content]);
  manager.addTurn(sessionId, { role: 'user', content: 'new descendant' });
  expect(new SessionManager().getSession(sessionId)!.turns.map(turn => turn.content)).toEqual(['[Context Checkpoint]\nfuture summary', history.at(-1)!.content, 'new descendant']);
  const descendantFork = manager.fork(sessionId, undefined, { activate: false });
  expect(new SessionManager().getSession(descendantFork.id)!.turns.map(turn => turn.content)).toEqual(['[Context Checkpoint]\nfuture summary', history.at(-1)!.content, 'new descendant']);
  switchLeaf(sibling);
  expect(new SessionManager().getSession(sessionId)!.turns.map(turn => turn.content)).toEqual([...history.slice(0, 2).map(turn => turn.content), 'sibling work']);
  const forked = manager.fork(sessionId, undefined, { entryId: history[2]!.id, activate: false });
  expect(new SessionManager().getSession(forked.id)!.turns.map(turn => turn.content)).toEqual(history.slice(0, 2).map(turn => turn.content));
});

it('refuses a store without native verification or explicit synthetic injection', async () => {
  const append = vi.fn();
  const result = await compactSessionHistory({ sessionId, policy, summarize: async () => 'summary',
    store: { getSession: () => manager.getSession(sessionId), appendCompactionEntry: append } });
  expect(result).toMatchObject({ status: 'failed', reason: expect.stringContaining('verified') });
  expect(append).not.toHaveBeenCalled();
});

it.each(['raw provider output: Bearer synthetic-secret response body', 'Summary request refused: raw-secret-canary'])('keeps arbitrary provider failure bodies out of the manual result: %s', async failure => {
  const outcome = await compactSessionHistory({ store: manager, sessionId, policy,
    summarize: async () => { throw new Error(failure); } });
  expect(outcome).toEqual({ status: 'failed', reason: 'The summary request failed; history was retained.' });
  expect(compactions()).toHaveLength(0);
});

it('does not replay an unknown summary after native resume republishes unchanged metadata', async () => {
  const summary = vi.fn(async () => undefined);
  expect(await compactSessionHistory({ store: manager, sessionId, policy, summarize: summary })).toMatchObject({ status: 'failed' });
  const before = manager.captureCompactionSource(sessionId);
  manager.resume(sessionId);
  const after = manager.captureCompactionSource(sessionId);
  expect(after.history).toEqual(before.history);
  expect(after.identity).not.toBe(before.identity);
  expect(after.replayIdentity).toBe(before.replayIdentity);
  const retry = vi.fn(async () => 'must not send');
  expect(await compactSessionHistory({ store: manager, sessionId, policy, summarize: retry })).toMatchObject({ status: 'failed', reason: expect.stringContaining('not repeated') });
  expect(summary).toHaveBeenCalledOnce();
  expect(retry).not.toHaveBeenCalled();
});
