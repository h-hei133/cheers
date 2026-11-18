import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getRuntimeConfig } from '../../config/runtimeConfig.js';
import type { HookDispatcher } from '../../core/hooks/hookDispatcher.js';
import { initialConfiguration } from '../../core/shell/configuration.js';
import { ShellCommandRuntime } from '../../core/shell/command.js';
import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { ShellSessionRuntime } from '../../core/shell/sessionRuntime.js';
import { SessionManager } from '../../session/SessionManager.js';
import { runTurn, type TurnInput } from '../../turn/session.js';
import type { StepFunction } from '../../turn/step.js';
import { resolveCliCredential } from '../provider/cliProviderRuntimeBridge.js';
import * as navigation from '../../session/query/navigation.js';
import { SubmissionQueue } from '../interactive/inputQueue.js';
import type { RpcCommand } from './protocol.js';
import { handleRpcCommand } from './rpcServer.js';
import { createRuntimeRpcHost } from './runtimeHost.js';
import type { SessionChangePort } from '../../core/shell/replacement.js';

let directory: string;
let context: ShellRuntimeContext;
let manager: SessionManager;
let queue: SubmissionQueue;

beforeEach(() => {
  const temporaryRoot = path.join(os.tmpdir(), 'cheers-test'); fs.mkdirSync(temporaryRoot, { recursive: true });
  directory = fs.mkdtempSync(path.join(temporaryRoot, 'rpc-host-'));
  const home = path.join(directory, 'home'); fs.mkdirSync(home);
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home); vi.stubEnv('CHEERS_TEST_ROOT', directory);
  vi.stubEnv('GIT_CEILING_DIRECTORIES', directory);
  manager = new SessionManager();
  const session = manager.createNew(directory);
  const seed = { cwd: directory, originalCwd: directory, projectRoot: directory, session,
    runtimeConfig: getRuntimeConfig(directory) };
  context = { ...seed, configuration: initialConfiguration(seed),
    activeSession: { sessionId: session.id, sessionProjectDir: directory } } as ShellRuntimeContext;
  queue = new SubmissionQueue(() => context.session, () => {});
});

afterEach(() => {
  vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(directory, { recursive: true, force: true });
});

function host(input?: TurnInput, switchSession?: SessionChangePort) {
  const runtime = { commands: new ShellCommandRuntime(), input: () => input, cancelCurrentRun: () => {}, getState: () => input ? 'running' : 'idle',
    summarizeAbandonedTurns: async () => undefined } as unknown as ShellSessionRuntime;
  return { ...createRuntimeRpcHost({ runtimeContext: context, sessionRuntime: runtime, sessionManager: manager,
    queue, isStreaming: () => Boolean(input), enqueuePrompt: text => { queue.push(text); }, switchSession }), emitResponse: () => {} };
}

function heldTurn() {
  let release!: () => void; let started!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  const first = new Promise<void>(resolve => { started = resolve; });
  const requests: string[][] = [];
  const step: StepFunction = async messages => {
    requests.push(messages.filter(message => message.role === 'user').map(message => String(message.content).split('\n\n').at(-1)!));
    if (requests.length === 1) { started(); await hold; }
    return { text: 'answer', toolCalls: [], stopReason: 'stop' };
  };
  const turn = runTurn({ sessionId: context.session.id, workspaceRoot: directory, prompt: 'INITIAL', history: [],
    onMessage: () => {}, step, tools: new Map(), maxSteps: 6, signal: new AbortController().signal,
    steeringMode: 'all', followUpMode: 'all', permissionScope: 'ask',
    hooks: { dispatch: async () => ({ decision: 'allow', stopChecks: [] }) } as unknown as HookDispatcher });
  const complete = (async () => { for await (const _event of turn.events) { /* Consume the actual turn. */ } })();
  return { turn, requests, first, release, complete };
}

it('clears both live input lanes and pending submissions without cancelling the active turn', async () => {
  const running = heldTurn(); await running.first;
  try {
    const rpc = host(running.turn);
    await handleRpcCommand({ type: 'steer', message: 'S1' }, rpc);
    await handleRpcCommand({ type: 'steer', message: 'S2' }, rpc);
    await handleRpcCommand({ type: 'follow_up', message: 'F1' }, rpc);
    await handleRpcCommand({ type: 'follow_up', message: 'F2' }, rpc);
    queue.push('PENDING');
    const response = await handleRpcCommand({ type: 'clear_queue' }, rpc);
    expect(response).toMatchObject({ success: true, data: { cleared: 5, steering: ['S1', 'S2'], followUp: ['F1', 'F2', 'PENDING'] } });
    expect(running.turn.pending()).toEqual({ steering: [], followUps: [] });
    expect(queue.length).toBe(0);
    expect((await handleRpcCommand({ type: 'clear_queue' }, rpc)).data).toEqual({ cleared: 0, steering: [], followUp: [] });
  } finally { running.release(); await running.complete; }
  expect(running.requests).toEqual([['INITIAL']]);
});

it.each(['steering', 'followUp'] as const)('changes the running %s delivery mode before the next actual model step', async lane => {
  const running = heldTurn(); await running.first;
  try {
    const rpc = host(running.turn);
    const response = await handleRpcCommand({ type: lane === 'steering' ? 'set_steering_mode' : 'set_follow_up_mode', mode: 'one-at-a-time' }, rpc);
    expect(response.success).toBe(true);
    expect(context.runtimeConfig[lane === 'steering' ? 'steeringMode' : 'followUpMode']).toBe('one-at-a-time');
    const type = lane === 'steering' ? 'steer' : 'follow_up';
    await handleRpcCommand({ type, message: 'FIRST' }, rpc);
    await handleRpcCommand({ type, message: 'SECOND' }, rpc);
  } finally { running.release(); await running.complete; }
  expect(running.requests[1]).toEqual(['INITIAL', 'FIRST']);
  expect(running.requests[2]).toEqual(['INITIAL', 'FIRST', 'SECOND']);
});

it.each(['new_session', 'switch_session', 'fork', 'clone'] as const)('reports a refused %s without changing the current selection', async type => {
  const original = context.session;
  manager.addTurn(original.id, { role: 'user', content: 'fork question' });
  const entryId = manager.getSession(original.id)!.turns[0]!.id!;
  const target = manager.createNew(directory); manager.setCurrentSessionForProject(directory, original.id);
  const callback = vi.fn(async () => ({ status: 'cancelled' as const, reason: 'Synthetic refusal' }));
  const command: RpcCommand = type === 'switch_session' ? { type, sessionPath: target.id }
    : type === 'fork' ? { type, entryId } : { type };
  const response = await handleRpcCommand(command, host(undefined, callback));
  expect(callback).toHaveBeenCalledOnce();
  expect(response).toMatchObject({ success: true, data: { cancelled: true } });
  expect(context.session).toBe(original);
  expect(context.activeSession?.sessionId).toBe(original.id);
  expect(manager.getCurrentSessionForProject(directory)?.id).toBe(original.id);
});

it('persists new-session ancestry while starting with an empty conversation', async () => {
  const parent = context.session.id;
  const response = await handleRpcCommand({ type: 'new_session', parentSession: parent }, host());
  expect(response).toMatchObject({ success: true, data: { cancelled: false, sessionId: context.session.id } });
  expect(context.session.id).not.toBe(parent);
  expect(context.session.parentSession).toBe(parent);
  expect(manager.getSession(context.session.id)?.parentSession).toBe(parent);
  expect(manager.getCurrentSessionForProject(directory)?.id).toBe(context.session.id);
  expect(context.session.turns).toEqual([]);
});

it('accepts a same-project session callback and selects only after acceptance', async () => {
  const original = context.session;
  const target = manager.createNew(directory); manager.setCurrentSessionForProject(directory, original.id);
  const rpc = host(undefined, async request => {
    expect(manager.getCurrentSessionForProject(directory)?.id).toBe(original.id);
    const next = request.prepare(() => {});
    manager.setCurrentSessionForProject(next.projectRoot, next.id);
    request.publish(next);
    return { status: 'changed', session: next };
  });
  const response = await handleRpcCommand({ type: 'switch_session', sessionPath: target.id }, rpc);
  expect(response).toMatchObject({ success: true, data: { cancelled: false, sessionId: target.id } });
  expect(context.session.id).toBe(target.id);
  expect(manager.getCurrentSessionForProject(directory)?.id).toBe(target.id);
});

it.each(['get_messages', 'get_state', 'get_session_stats', 'get_last_assistant_text'] as const)(
  'reads persisted conversation updates through %s after the host was created', async type => {
    const startup = context.session;
    const rpc = host();
    manager.addTurn(startup.id, { role: 'user', content: 'new question' });
    manager.addTurn(startup.id, { role: 'assistant', content: 'new answer' });
    expect(startup.turns).toEqual([]);
    const response = await handleRpcCommand({ type }, rpc);
    expect(response.success).toBe(true);
    const expected = type === 'get_messages' ? { messages: [
      expect.objectContaining({ role: 'user', content: 'new question' }),
      expect.objectContaining({ role: 'assistant', content: 'new answer' }),
    ] } : type === 'get_state' ? { messageCount: 2 }
      : type === 'get_session_stats' ? { userMessages: 1, assistantMessages: 1, totalMessages: 2 }
        : { text: 'new answer' };
    expect(response.data).toMatchObject(expected);
    expect(context.session).toBe(startup);
  },
);

it('reads the accepted new session on the next call through the existing host', async () => {
  const rpc = host();
  manager.addTurn(context.session.id, { role: 'assistant', content: 'old answer' });
  const target = manager.createNew(directory, { activate: false });
  manager.addTurn(target.id, { role: 'assistant', content: 'selected answer' });
  expect((await handleRpcCommand({ type: 'switch_session', sessionPath: target.id }, rpc)).success).toBe(true);
  manager.addTurn(target.id, { role: 'assistant', content: 'latest answer' });
  expect((await handleRpcCommand({ type: 'get_last_assistant_text' }, rpc)).data).toEqual({ text: 'latest answer' });
  expect((await handleRpcCommand({ type: 'get_state' }, rpc)).data).toMatchObject({ sessionId: target.id, messageCount: 2 });
});

it.each(['get_messages', 'get_state', 'get_session_stats', 'get_last_assistant_text'] as const)(
  'refuses %s when the selected stored session is unavailable', async type => {
    const rpc = host();
    manager.addTurn(context.session.id, { role: 'assistant', content: 'removed answer' });
    context.session = manager.getSession(context.session.id)!;
    fs.rmSync(manager.getSessionDirPath(context.session.id), { recursive: true });
    const response = await handleRpcCommand({ type }, rpc);
    expect(response).toMatchObject({ success: false, error: 'The selected session is unavailable.' });
    expect(response.data).toBeUndefined();
  },
);

it.each(['identity', 'selection'] as const)('rejects a changed %s during a current-session read', async kind => {
  const rpc = host();
  const originalId = context.session.id;
  manager.addTurn(context.session.id, { role: 'assistant', content: 'original answer' });
  const original = manager.getSession.bind(manager);
  const successor = manager.createNew(directory, { activate: false });
  vi.spyOn(manager, 'getSession').mockImplementation(id => {
    const current = original(id)!;
    if (kind === 'identity') return { ...current, createdAt: '2000-01-01T00:00:00.000Z' };
    context.session = successor;
    return current;
  });
  const response = await handleRpcCommand({ type: 'get_messages' }, rpc);
  expect(response).toMatchObject({ success: false, error: 'The selected session changed during the read.' });
  expect(response.data).toBeUndefined();
  expect(context.session.id).toBe(kind === 'selection' ? successor.id : originalId);
});

it('reports the resolved physical provider together with its model for a CLI override', async () => {
  const options = { model: 'anthropic/physical:low' };
  context.resolveConfigTarget = (config, sessionId) => resolveCliCredential(config, options, {}, sessionId);
  expect(context.runtimeConfig.provider).toBe('openai');
  const actual = context.resolveConfigTarget(context.runtimeConfig, context.session.id);
  expect(actual).toMatchObject({ provider: 'anthropic', model: 'physical' });
  const response = await handleRpcCommand({ type: 'get_state' }, host());
  expect(response).toMatchObject({ success: true, data: { model: { provider: 'anthropic', id: 'physical' }, thinkingLevel: 'low' } });
});

it('offers only saved user questions for a fork and returns their exact editable text', async () => {
  manager.addTurn(context.session.id, { role: 'user', content: 'First question\n  keep spacing' });
  manager.addTurn(context.session.id, { role: 'assistant', content: 'First answer' });
  manager.addTurn(context.session.id, { role: 'user', content: 'Second question' });
  const source = manager.getSession(context.session.id)!;
  const rpc = host();
  const offered = await handleRpcCommand({ type: 'get_fork_messages' }, rpc);
  expect(offered).toMatchObject({ success: true, data: { messages: [
    { entryId: source.turns[0]!.id, text: 'First question\n  keep spacing' },
    { entryId: source.turns[2]!.id, text: 'Second question' },
  ] } });
  const result = await handleRpcCommand({ type: 'fork', entryId: source.turns[0]!.id! }, rpc);
  expect(result).toMatchObject({ success: true, data: { cancelled: false, text: 'First question\n  keep spacing' } });
  expect(context.session.id).not.toBe(source.id);
  expect(context.session.turns).toEqual([]);
  expect(manager.getSession(source.id)!.turns).toEqual(source.turns);
});

it('returns a saved question as a fork draft after the branch was accepted', async () => {
  manager.addTurn(context.session.id, { role: 'user', content: 'Selected draft' });
  const entryId = manager.getSession(context.session.id)!.turns[0]!.id!;
  const response = await handleRpcCommand({ type: 'fork', entryId }, host());
  expect(response).toMatchObject({ success: true, data: { cancelled: false, text: 'Selected draft' } });
});

it.each(['get_fork_messages', 'fork'] as const)('refuses %s when its session changes during acquisition', async type => {
  manager.addTurn(context.session.id, { role: 'user', content: 'Old question' });
  const entryId = manager.getSession(context.session.id)!.turns[0]!.id!;
  const successor = manager.createNew(directory, { activate: false });
  const original = navigation.readSessionNavigationAsync;
  vi.spyOn(navigation, 'readSessionNavigationAsync').mockImplementationOnce(async (...args) => {
    const result = await original(...args);
    context.session = successor;
    return result;
  });
  const fork = vi.spyOn(manager, 'fork');
  const response = await handleRpcCommand(type === 'fork' ? { type, entryId } : { type }, host());
  expect(response).toMatchObject({ success: false });
  expect(response.data).toBeUndefined();
  expect(fork).not.toHaveBeenCalled();
  expect(context.session).toBe(successor);
});

it('binds a fork draft to the acquired history version before creating a session', async () => {
  manager.addTurn(context.session.id, { role: 'user', content: 'Captured question' });
  const entryId = manager.getSession(context.session.id)!.turns[0]!.id!;
  const original = navigation.readSessionNavigationAsync;
  vi.spyOn(navigation, 'readSessionNavigationAsync').mockImplementationOnce(async (...args) => {
    const result = await original(...args);
    manager.addTurn(context.session.id, { role: 'assistant', content: 'New history after capture' });
    return result;
  });
  const count = fs.readdirSync(path.dirname(manager.getSessionDirPath(context.session.id))).length;
  const response = await handleRpcCommand({ type: 'fork', entryId }, host());
  expect(response).toMatchObject({ success: false });
  expect(fs.readdirSync(path.dirname(manager.getSessionDirPath(context.session.id)))).toHaveLength(count);
});

it('keeps a refused fork switch separate from an accepted editable draft', async () => {
  manager.addTurn(context.session.id, { role: 'user', content: 'Unaccepted draft' });
  const entryId = manager.getSession(context.session.id)!.turns[0]!.id!;
  const response = await handleRpcCommand({ type: 'fork', entryId }, host(undefined, async () => ({ status: 'cancelled', reason: 'Synthetic refusal' })));
  expect(response).toMatchObject({ success: true, data: { cancelled: true } });
  expect(response.data?.text).toBeUndefined();
});

it.each(['new_session', 'fork', 'clone'] as const)('waits for %s before handlers without creating a refused candidate', async type => {
  manager.addTurn(context.session.id, { role: 'user', content: 'Question' });
  const entryId = manager.getSession(context.session.id)!.turns[0]!.id!;
  const source = context.session, directoryCount = fs.readdirSync(path.dirname(manager.getSessionDirPath(source.id))).length;
  let release!: () => void, reached!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; }), ready = new Promise<void>(resolve => { reached = resolve; });
  const change: SessionChangePort = async () => { reached(); await held; return { status: 'cancelled', reason: 'Cancelled before preparation' }; };
  let returned = false;
  const pending = handleRpcCommand(type === 'fork' ? { type, entryId } : { type }, host(undefined, change)).then(result => { returned = true; return result; });
  try {
    await ready; await new Promise(resolve => setImmediate(resolve));
    expect(returned).toBe(false);
    expect(fs.readdirSync(path.dirname(manager.getSessionDirPath(source.id)))).toHaveLength(directoryCount);
    expect(manager.getCurrentSessionForProject(directory)?.id).toBe(source.id);
  } finally { release(); }
  expect(await pending).toMatchObject({ success: true, data: { cancelled: true } });
});

it('preserves a competing activation after the async replacement port returns', async () => {
  const target = manager.createNew(directory, { activate: false }), source = context.session;
  let competitor!: string;
  const rpc = host(undefined, async request => {
    const next = request.prepare(() => {}); request.publish(next);
    competitor = manager.createNew(directory).id;
    return { status: 'unknown', reason: 'Activation changed during startup' };
  });
  const result = await handleRpcCommand({ type: 'switch_session', sessionPath: target.id }, rpc);
  expect(result.success).toBe(false); expect(manager.getCurrentSessionForProject(directory)?.id).toBe(competitor);
  expect(competitor).not.toBe(source.id);
});

it('refuses a fork when the host becomes busy while acquiring its draft', async () => {
  manager.addTurn(context.session.id, { role: 'user', content: 'Pending draft' });
  const entryId = manager.getSession(context.session.id)!.turns[0]!.id!;
  let busy = false;
  const original = navigation.readSessionNavigationAsync;
  vi.spyOn(navigation, 'readSessionNavigationAsync').mockImplementationOnce(async (...args) => {
    const snapshot = await original(...args); busy = true; return snapshot;
  });
  const fork = vi.spyOn(manager, 'fork');
  const rpc = createRuntimeRpcHost({ runtimeContext: context, sessionRuntime: {} as ShellSessionRuntime,
    sessionManager: manager, queue, isStreaming: () => busy, enqueuePrompt: () => {} });
  const response = await handleRpcCommand({ type: 'fork', entryId }, { ...rpc, emitResponse: () => {} });
  expect(response).toMatchObject({ success: true, data: { cancelled: true } });
  expect(fork).not.toHaveBeenCalled();
});

it('omits unavailable saved questions from fork candidates', async () => {
  manager.addTurn(context.session.id, { role: 'user', content: 'Incomplete question' });
  const original = navigation.readSessionNavigationAsync;
  vi.spyOn(navigation, 'readSessionNavigationAsync').mockImplementationOnce(async (...args) => {
    const snapshot = await original(...args);
    return { ...snapshot, actionSafe: false, quality: 'partial', points: snapshot.points.map(point => ({ ...point, unavailable: 'partial transcript' })) };
  });
  const response = await handleRpcCommand({ type: 'get_fork_messages' }, host());
  expect(response).toMatchObject({ success: true, data: { messages: [] } });
});

it.each(['get_fork_messages', 'fork'] as const)('refuses %s when selection changes after the nested read resolves', async type => {
  manager.addTurn(context.session.id, { role: 'user', content: 'Retired draft' });
  const entryId = manager.getSession(context.session.id)!.turns[0]!.id!;
  const successor = manager.createNew(directory, { activate: false });
  const original = navigation.readSessionNavigationAsync;
  vi.spyOn(navigation, 'readSessionNavigationAsync').mockImplementationOnce(async (...args) => {
    const snapshot = await original(...args);
    queueMicrotask(() => queueMicrotask(() => { context.session = successor; }));
    return snapshot;
  });
  const fork = vi.spyOn(manager, 'fork');
  const response = await handleRpcCommand(type === 'fork' ? { type, entryId } : { type }, host());
  expect(response).toMatchObject({ success: false });
  expect(response.data).toBeUndefined();
  expect(fork).not.toHaveBeenCalled();
  expect(context.session).toBe(successor);
});

it.each(['get_fork_messages', 'get_entries', 'get_tree'] as const)(
  'refuses %s when selection changes after the host read resolves', async type => {
    manager.addTurn(context.session.id, { role: 'user', content: 'Retired read result' });
    const successor = manager.createNew(directory, { activate: false });
    const rpc = host();
    const method = type === 'get_fork_messages' ? 'getForkMessages' : type === 'get_entries' ? 'getEntries' : 'getTree';
    const read = rpc[method]!;
    const emitted = vi.fn();
    Object.defineProperty(rpc, method, { value: async () => {
      const result = await read();
      queueMicrotask(() => { context.session = successor; });
      return result;
    } });
    const response = await handleRpcCommand({ type }, { ...rpc, emitResponse: emitted });
    expect(response).toMatchObject({ success: false, error: 'The selected session changed during the read.' });
    expect(response.data).toBeUndefined();
    expect(emitted).toHaveBeenCalledOnce();
    expect(emitted).toHaveBeenCalledWith(response);
    expect(context.session).toBe(successor);
  },
);

it.each(['get_fork_messages', 'get_entries', 'get_tree'] as const)(
  'refuses %s when configuration retires after the host read resolves', async type => {
    manager.addTurn(context.session.id, { role: 'user', content: 'Retired configuration read' });
    const rpc = host();
    const method = type === 'get_fork_messages' ? 'getForkMessages' : type === 'get_entries' ? 'getEntries' : 'getTree';
    const read = rpc[method]!;
    const emitted = vi.fn();
    Object.defineProperty(rpc, method, { value: async () => {
      const result = await read();
      queueMicrotask(() => { context.configuration.transition(context.configuration.current.binding); });
      return result;
    } });
    const response = await handleRpcCommand({ type }, { ...rpc, emitResponse: emitted });
    expect(response).toMatchObject({ success: false });
    expect(response.error).toMatch(/abort|selected session changed/i);
    expect(response.data).toBeUndefined();
    expect(emitted).toHaveBeenCalledOnce();
    expect(emitted).toHaveBeenCalledWith(response);
  },
);

it('preserves legacy custom read hosts without exposing admission callbacks in response data', async () => {
  const rpc = { ...host(),
    getForkMessages: async () => [{ entryId: 'question', text: 'Editable question' }],
    getEntries: async () => ({ entries: [{ id: 'question' }], leafId: 'question' }),
    getTree: async () => ({ tree: [{ id: 'question' }], leafId: 'question' }),
  };
  expect(await handleRpcCommand({ type: 'get_fork_messages' }, rpc)).toMatchObject({ success: true,
    data: { messages: [{ entryId: 'question', text: 'Editable question' }] } });
  expect(await handleRpcCommand({ type: 'get_entries' }, rpc)).toMatchObject({ success: true,
    data: { entries: [{ id: 'question' }], leafId: 'question' } });
  expect(await handleRpcCommand({ type: 'get_tree' }, rpc)).toMatchObject({ success: true,
    data: { tree: [{ id: 'question' }], leafId: 'question' } });
  manager.addTurn(context.session.id, { role: 'user', content: 'Current saved question' });
  for (const type of ['get_fork_messages', 'get_entries', 'get_tree'] as const) {
    const response = await handleRpcCommand({ type }, host());
    expect(response.success).toBe(true);
    expect(response.data).not.toHaveProperty('assertCurrent');
    expect(JSON.stringify(response)).not.toContain('assertCurrent');
  }
});
