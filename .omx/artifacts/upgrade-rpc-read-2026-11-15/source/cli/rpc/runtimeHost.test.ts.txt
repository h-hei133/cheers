import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getRuntimeConfig } from '../../config/runtimeConfig.js';
import type { HookDispatcher } from '../../core/hooks/hookDispatcher.js';
import { initialConfiguration } from '../../core/shell/configuration.js';
import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { ShellSessionRuntime } from '../../core/shell/sessionRuntime.js';
import { SessionManager } from '../../session/SessionManager.js';
import type { Session } from '../../session/schema/sessionRecord.js';
import { runTurn, type TurnInput } from '../../turn/session.js';
import type { StepFunction } from '../../turn/step.js';
import { resolveCliCredential } from '../provider/cliProviderRuntimeBridge.js';
import { SubmissionQueue } from '../interactive/inputQueue.js';
import type { RpcCommand } from './protocol.js';
import { handleRpcCommand } from './rpcServer.js';
import { createRuntimeRpcHost } from './runtimeHost.js';

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

function host(input?: TurnInput, switchSession?: (session: Session) => boolean) {
  const runtime = { input: () => input, cancelCurrentRun: () => {} } as unknown as ShellSessionRuntime;
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
  const callback = vi.fn(() => false);
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
  const rpc = host(undefined, next => {
    expect(manager.getCurrentSessionForProject(directory)?.id).toBe(original.id);
    context.session = next; context.activeSession = { sessionId: next.id, sessionProjectDir: next.projectRoot };
    return true;
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
