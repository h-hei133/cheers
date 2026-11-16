import fs from 'node:fs';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getRuntimeConfig } from '../../config/runtimeConfig.js';
import { compactSessionHistory, type CompactionOutcome } from '../../core/shell/compaction.js';
import * as outputGuard from '../../core/shell/outputGuard.js';
import { createShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import { ShellSessionRuntime } from '../../core/shell/sessionRuntime.js';
import { StreamingRenderer } from '../../presentation/terminal/streaming.js';
import { SessionManager } from '../../session/SessionManager.js';
import { SubmissionQueue } from '../interactive/inputQueue.js';
import { runPromptInputStream } from '../runtime/inputStream.js';
import type { RpcResponse } from './protocol.js';
import { createRuntimeRpcHost } from './runtimeHost.js';
import { handleRpcCommand } from './rpcServer.js';

let directory: string;
beforeEach(() => {
  fs.mkdirSync('/tmp/cheers-test', { recursive: true });
  directory = fs.mkdtempSync('/tmp/cheers-test/rpc-compaction-');
  const home = path.join(directory, 'home'); fs.mkdirSync(home);
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home); vi.stubEnv('CHEERS_TEST_ROOT', home);
  vi.stubEnv('GIT_CEILING_DIRECTORIES', directory); vi.stubEnv('CHEERS_PROVIDER_MODE', 'synthetic');
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(directory, { recursive: true, force: true }); });

function fixture(compact?: (sessionId: string, signal: AbortSignal, instructions?: string) => Promise<CompactionOutcome>,
  summarize?: (messages: readonly import('../../session/schema/sessionMessage.js').SessionMessage[], signal?: AbortSignal) => Promise<string | undefined>) {
  const manager = new SessionManager(), session = manager.createNew(directory), renderer = new StreamingRenderer();
  vi.spyOn(renderer, 'renderLine').mockImplementation(() => {});
  const context = createShellRuntimeContext({ cwd: directory, originalCwd: directory, projectRoot: directory,
    rootMode: 'direct', targetPathBase: directory, gitRoot: null,
    gitContext: { insideGit: false, root: null, branch: null, isClean: true }, session, runtimeConfig: getRuntimeConfig(directory) });
  const runtime = new ShellSessionRuntime({ sessionManager: manager, renderer, runPrompt: () => ({
    async *[Symbol.asyncIterator]() { /* No provider is needed to test command settlement. */ },
  }), compactHistory: compact ?? ((sessionId, signal) => compactSessionHistory({ store: manager,
    sessionId, signal, policy: { contextWindow: 10000, reserveTokens: 0, keepRecentTokens: 1000 },
    summarize: async () => { throw new Error('An empty session cannot dispatch a summary.'); } })),
    ...(summarize ? { summarizeAbandonedTurns: summarize } : {}) });
  const host = { ...createRuntimeRpcHost({ runtimeContext: context, sessionRuntime: runtime, sessionManager: manager,
    queue: new SubmissionQueue(() => context.session, () => {}), isStreaming: () => false, enqueuePrompt: () => {} }),
    emitResponse: () => {} };
  return { manager, renderer, context, runtime, host };
}

it('preserves the actual no-compaction result of an empty stored session', async () => {
  const test = fixture();
  const response = await handleRpcCommand({ type: 'compact' }, test.host);
  expect(response).toMatchObject({ success: false, data: { status: 'nothing', reason: expect.any(String) } });
  expect(response.error).toBe(response.data?.reason);
  expect(test.manager.getSession(test.context.session.id)!.turns).toEqual([]);
});

it('registers compaction before an immediate RPC abort and retains its cancellation outcome', async () => {
  const operation = vi.fn(async (_id: string, signal: AbortSignal): Promise<CompactionOutcome> => signal.aborted
    ? { status: 'failed', reason: 'Compaction was cancelled.' }
    : { status: 'compacted', summarized: 3, kept: 2, tokensBefore: 1000, tokensAfter: 200 });
  const test = fixture(operation);
  const compact = handleRpcCommand({ type: 'compact' }, test.host);
  const registered = test.runtime.isRunning();
  await handleRpcCommand({ type: 'abort' }, test.host);
  const response = await compact;
  expect(registered).toBe(true);
  expect(operation).toHaveBeenCalledOnce();
  expect(response).toMatchObject({ success: false, data: { status: 'failed', reason: 'Compaction was cancelled.' } });
  expect(test.runtime.isRunning()).toBe(false);
});

it('returns a structured busy result while another local operation owns settlement', async () => {
  const operation = vi.fn(async (): Promise<CompactionOutcome> => ({ status: 'nothing', reason: 'No history.' }));
  const test = fixture(operation); let release!: () => void;
  const running = test.runtime.commands.run(() => new Promise<void>(resolve => { release = resolve; }));
  await Promise.resolve();
  try {
    expect(await handleRpcCommand({ type: 'compact' }, test.host)).toMatchObject({ success: false, data: { status: 'busy' } });
    expect(operation).not.toHaveBeenCalled();
  } finally { release(); await running; }
});

it('publishes manual compaction activity from synchronous admission through cancelled settlement', async () => {
  let release!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  const test = fixture(async (_id, signal) => {
    await hold;
    expect(signal.aborted).toBe(true);
    return { status: 'failed', reason: 'Compaction was cancelled.' };
  });
  expect(test.host.getState?.().isCompacting).toBe(false);
  const compact = handleRpcCommand({ type: 'compact' }, test.host);
  try {
    expect(test.host.getState?.()).toMatchObject({ isCompacting: true, isStreaming: false, isBashRunning: false });
    await handleRpcCommand({ type: 'abort' }, test.host);
    expect((await handleRpcCommand({ type: 'get_state' }, test.host)).data?.isCompacting).toBe(true);
    expect(await handleRpcCommand({ type: 'compact' }, test.host)).toMatchObject({ data: { status: 'busy' } });
    expect(test.host.getState?.().isCompacting).toBe(true);
  } finally { test.runtime.cancelCurrentRun(); release(); await compact; }
  expect(test.host.getState?.().isCompacting).toBe(false);
});

it.each(['compacted', 'nothing', 'failed', 'rejected'] as const)('retires compaction activity after %s settles', async status => {
  const test = fixture(async () => {
    if (status === 'rejected') throw new Error('Compaction failed before publication.');
    return status === 'compacted'
      ? { status, summarized: 3, kept: 2, tokensBefore: 1000, tokensAfter: 200 }
      : { status, reason: 'No compaction was committed.' };
  });
  await handleRpcCommand({ type: 'compact' }, test.host);
  expect(test.host.getState?.().isCompacting).toBe(false);
  let release!: () => void;
  const running = test.runtime.commands.run(() => new Promise<void>(resolve => { release = resolve; }));
  await Promise.resolve();
  try {
    expect(test.runtime.isRunning()).toBe(true);
    expect(test.host.getState?.().isCompacting).toBe(false);
  } finally { release(); await running; }
});

it('retains branch summary activity and forwards cancellation until its own settlement', async () => {
  let release!: () => void, owned: AbortSignal | undefined;
  const hold = new Promise<void>(resolve => { release = resolve; });
  const test = fixture(undefined, async (_messages, signal) => { owned = signal; await hold; return undefined; });
  const controller = new AbortController();
  const summary = test.runtime.summarizeAbandonedTurns([], controller.signal);
  await Promise.resolve();
  try {
    expect(test.host.getState?.().isCompacting).toBe(true);
    controller.abort(); expect(owned?.aborted).toBe(true);
    await handleRpcCommand({ type: 'abort' }, test.host);
    expect(test.host.getState?.().isCompacting).toBe(true);
    expect(await handleRpcCommand({ type: 'compact' }, test.host)).toMatchObject({ data: { status: 'busy' } });
  } finally { release(); await summary; }
  expect(test.host.getState?.().isCompacting).toBe(false);
});

it('lets JSONL controls cancel compaction while EOF and queued prompts wait for its full settlement', async () => {
  let release!: () => void, started!: () => void, signal!: AbortSignal;
  const entered = new Promise<void>(resolve => { started = resolve; });
  const hold = new Promise<void>(resolve => { release = resolve; });
  const test = fixture(async (_id, owned, instructions) => {
    signal = owned; expect(instructions).toBe('retain decisions'); started(); await hold;
    return { status: 'failed', reason: 'Compaction was cancelled.' };
  });
  const stdin = new PassThrough(), responses: RpcResponse[] = [], prompts: boolean[] = [];
  vi.spyOn(outputGuard, 'writeRawStdout').mockImplementation(text => {
    const frame = JSON.parse(text); if (frame.type === 'response') responses.push(frame);
  });
  let ended = false;
  const run = runPromptInputStream({ stdin, runtimeContext: test.context, sessionRuntime: test.runtime,
    sessionManager: test.manager, renderer: test.renderer, logger: { info: () => {} } as never, rpcMode: true,
    runPrompt: async () => { prompts.push(test.runtime.isRunning()); } }).then(() => { ended = true; });
  try {
    stdin.write('{"id":"compact","type":"compact","customInstructions":"retain decisions"}\n');
    await entered;
    stdin.write('{"id":"state","type":"get_state"}\n{"id":"new","type":"new_session"}\n'
      + '{"id":"overlap","type":"compact"}\n{"id":"cancel","type":"abort"}\n');
    await vi.waitFor(() => expect(responses.find(response => response.id === 'cancel')?.success).toBe(true));
    expect(signal.aborted).toBe(true); expect(test.runtime.isRunning()).toBe(true);
    expect(responses.find(response => response.id === 'state')).toMatchObject({ success: true,
      data: { isCompacting: true, isStreaming: false } });
    expect(responses.find(response => response.id === 'new')).toMatchObject({ data: { cancelled: true } });
    expect(responses.find(response => response.id === 'overlap')).toMatchObject({ success: false, data: { status: 'busy' } });
    expect(responses.find(response => response.id === 'compact')).toBeUndefined();
    stdin.end('{"id":"next","type":"prompt","message":"AFTER_COMPACTION"}\n');
    await vi.waitFor(() => expect(responses.find(response => response.id === 'next')?.success).toBe(true));
    expect(ended).toBe(false); expect(prompts).toEqual([]);
  } finally { test.runtime.cancelCurrentRun(); release(); stdin.end(); await run; }
  expect(responses.find(response => response.id === 'compact')).toMatchObject({ success: false,
    data: { status: 'failed', reason: 'Compaction was cancelled.' } });
  expect(prompts).toEqual([false]); expect(test.runtime.isRunning()).toBe(false);
});

it('joins a successful compaction response at ordinary EOF without cancelling it', async () => {
  let release!: () => void, started!: () => void;
  const entered = new Promise<void>(resolve => { started = resolve; });
  const hold = new Promise<void>(resolve => { release = resolve; });
  const outcome = { status: 'compacted', summarized: 8, kept: 4, tokensBefore: 5000, tokensAfter: 1000 } as const;
  const test = fixture(async (_id, signal) => { started(); await hold; expect(signal.aborted).toBe(false); return outcome; });
  const stdin = new PassThrough(), responses: RpcResponse[] = [];
  vi.spyOn(outputGuard, 'writeRawStdout').mockImplementation(text => {
    const frame = JSON.parse(text); if (frame.type === 'response') responses.push(frame);
  });
  let ended = false;
  const run = runPromptInputStream({ stdin, runtimeContext: test.context, sessionRuntime: test.runtime,
    sessionManager: test.manager, renderer: test.renderer, logger: { info: () => {} } as never,
    rpcMode: true, runPrompt: async () => {} }).then(() => { ended = true; });
  try {
    stdin.write('{"id":"compact","type":"compact"}\n'); await entered; stdin.end();
    await new Promise(resolve => setImmediate(resolve)); expect(ended).toBe(false); expect(responses).toEqual([]);
  } finally { release(); await run; }
  expect(responses).toHaveLength(1);
  expect(responses[0]).toMatchObject({ id: 'compact', success: true, data: outcome });
  expect(test.runtime.isRunning()).toBe(false);
});
