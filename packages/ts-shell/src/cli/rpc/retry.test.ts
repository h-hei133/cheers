import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getRuntimeConfig } from '../../config/runtimeConfig.js';
import type { HookDispatcher } from '../../core/hooks/hookDispatcher.js';
import { createShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import { ShellSessionRuntime } from '../../core/shell/sessionRuntime.js';
import { StreamingRenderer } from '../../presentation/terminal/streaming.js';
import { SessionManager } from '../../session/SessionManager.js';
import { runTurn, type TurnInput } from '../../turn/session.js';
import { pendingTurnInput } from '../../turn/pendingInput.js';
import { createStepFunction, type StepFunction } from '../../turn/step.js';
import type { QueryEvent } from '../../core/query/runtime/events.js';
import { SubmissionQueue } from '../interactive/inputQueue.js';
import { createRuntimeRpcHost } from './runtimeHost.js';
import { handleRpcCommand } from './rpcServer.js';

let directory: string;
beforeEach(() => {
  fs.mkdirSync('/tmp/cheers-test', { recursive: true }); directory = fs.mkdtempSync('/tmp/cheers-test/rpc-retry-');
  const home = path.join(directory, 'home'); fs.mkdirSync(home);
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home); vi.stubEnv('CHEERS_TEST_ROOT', home);
  vi.stubEnv('GIT_CEILING_DIRECTORIES', directory); vi.stubEnv('CHEERS_PROVIDER_MODE', 'synthetic');
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(directory, { recursive: true, force: true }); });

function fixture(step: StepFunction, cancelScheduled = false, queueSuccessor = false, useReadinessInput = false) {
  const manager = new SessionManager(), session = manager.createNew(directory), renderer = new StreamingRenderer();
  vi.spyOn(renderer, 'renderLine').mockImplementation(() => {});
  const context = createShellRuntimeContext({ cwd: directory, originalCwd: directory, projectRoot: directory,
    rootMode: 'direct', targetPathBase: directory, gitRoot: null,
    gitContext: { insideGit: false, root: null, branch: null, isClean: true }, session, runtimeConfig: getRuntimeConfig(directory) });
  const events: QueryEvent[] = [], signals: AbortSignal[] = [], cancels: Promise<unknown>[] = [];
  const genericCancel = vi.fn(), hooks = { dispatch: vi.fn(async (_event: { eventName: string }) => ({ decision: 'allow', stopChecks: [] })) };
  let input: TurnInput | undefined;
  const runtime = new ShellSessionRuntime({ sessionManager: manager, renderer, onCancelRequested: genericCancel,
    runPrompt: (prompt, signal) => {
      signals.push(signal);
      const turn = runTurn({ sessionId: session.id, workspaceRoot: directory, prompt, history: [],
        signal, onMessage: () => {}, step, tools: new Map(), maxSteps: 8, permissionScope: 'ask',
        retry: { enabled: true, maxRetries: 2, baseDelayMs: 1000, maxDelayMs: 1000 },
        observe: event => {
          if (event.type !== 'retry_scheduled' || !cancelScheduled) return;
          if (queueSuccessor) input?.followUp('EXPLICIT_SUCCESSOR');
          cancels.push(handleRpcCommand({ type: 'abort_retry' }, host));
        }, hooks: hooks as unknown as HookDispatcher });
      input = turn;
      const buffered = pendingTurnInput();
      if (useReadinessInput) buffered.adopt({ input: turn });
      return { input: useReadinessInput ? buffered.input : turn, events: turn.events };
    } });
  runtime.observeEvents(event => events.push(event));
  const host = { ...createRuntimeRpcHost({ runtimeContext: context, sessionRuntime: runtime, sessionManager: manager,
    queue: new SubmissionQueue(() => context.session, () => {}), isStreaming: () => runtime.isRunning(), enqueuePrompt: () => {} }),
    emitResponse: () => {} };
  return { context, runtime, host, signals, events, cancels, genericCancel, hooks };
}

it('leaves an ordinary in-flight model request and its cancellation services untouched', async () => {
  let release!: () => void, entered!: () => void, requestSignal: AbortSignal | undefined;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const hold = new Promise<void>(resolve => { release = resolve; });
  const test = fixture(async (_messages, signal) => { requestSignal = signal; entered(); await hold;
    return { text: 'ordinary answer', toolCalls: [], stopReason: 'stop' }; });
  const running = test.runtime.executePrompt(test.context.session.id, 'ordinary');
  await started;
  try {
    expect(await handleRpcCommand({ type: 'abort_retry' }, test.host)).toMatchObject({ success: true });
    expect(requestSignal?.aborted).toBe(false); expect(test.signals[0]!.aborted).toBe(false);
    expect(test.genericCancel).not.toHaveBeenCalled();
  } finally { release(); await running.catch(() => {}); }
  expect(test.events.some(event => event.type === 'query.completed')).toBe(true);
});

it('does not cancel an unrelated command while no retry wait exists', async () => {
  const test = fixture(async () => ({ text: '', toolCalls: [], stopReason: 'stop' })); let release!: () => void;
  const running = test.runtime.commands.run(async signal => {
    await new Promise<void>(resolve => { release = resolve; }); return signal.aborted;
  });
  await Promise.resolve();
  try {
    expect(await handleRpcCommand({ type: 'abort_retry' }, test.host)).toMatchObject({ success: true });
    expect(test.runtime.commands.current?.controller.signal.aborted).toBe(false);
    expect(test.genericCancel).not.toHaveBeenCalled();
  } finally { release(); }
  expect(await running).toBe(false);
});

it('cancels from the retry scheduling observer before another request without aborting its parent', async () => {
  const step = vi.fn(async () => ({ text: 'partial failed answer', toolCalls: [], stopReason: 'error' as const,
    retryable: true, errorMessage: 'Provider returned error 503', origin: { provider: 'fixture', model: 'actual-target' } }));
  const test = fixture(step, true);
  await test.runtime.executePrompt(test.context.session.id, 'retry').catch(() => {});
  await Promise.all(test.cancels);
  expect(step).toHaveBeenCalledOnce(); expect(test.signals[0]!.aborted).toBe(false);
  expect(test.genericCancel).not.toHaveBeenCalled();
  expect(test.events).toContainEqual(expect.objectContaining({ type: 'query.failed', error: expect.stringContaining('Retry was cancelled') }));
  expect(test.events.some(event => event.type === 'query.completed')).toBe(false);
  expect(test.hooks.dispatch.mock.calls.some(([event]) => event.eventName === 'Stop')).toBe(false);
  expect(test.runtime.isRunning()).toBe(false);
});

it('keeps an explicit queued successor independent from the cancelled retry', async () => {
  const prompts: string[] = [];
  const step: StepFunction = async messages => {
    const prompt = String(messages.filter(message => message.role === 'user').at(-1)?.content);
    prompts.push(prompt);
    return prompts.length === 1 ? { text: '', toolCalls: [], stopReason: 'error', errorMessage: 'Provider returned error 503' }
      : { text: 'successor answer', toolCalls: [], stopReason: 'stop' };
  };
  const test = fixture(step, true, true);
  await test.runtime.executePrompt(test.context.session.id, 'initial').catch(() => {}); await Promise.all(test.cancels);
  expect(prompts).toHaveLength(2); expect(prompts[1]).toBe('EXPLICIT_SUCCESSOR');
  expect(test.signals[0]!.aborted).toBe(false); expect(test.genericCancel).not.toHaveBeenCalled();
  expect(test.events.some(event => event.type === 'query.completed')).toBe(true);
});

it('cancels retry through the same readiness input used by the CLI', async () => {
  const step = vi.fn(async () => ({ text: '', toolCalls: [], stopReason: 'error' as const,
    errorMessage: 'Provider returned error 503' }));
  const test = fixture(step, true, false, true);
  await test.runtime.executePrompt(test.context.session.id, 'readiness retry').catch(() => {});
  await Promise.all(test.cancels);
  expect(step).toHaveBeenCalledOnce();
  expect(test.signals[0]!.aborted).toBe(false); expect(test.genericCancel).not.toHaveBeenCalled();
  expect(test.events).toContainEqual(expect.objectContaining({ type: 'query.failed', error: expect.stringContaining('Retry was cancelled') }));
});

it.each(['response', 'network'] as const)('cancels the existing provider %s backoff while leaving the session signal live', async kind => {
  vi.useFakeTimers(); let calls = 0;
  const step = createStepFunction({ provider: { baseUrl: 'https://fixture.test', model: 'fixture' },
    workspaceRoot: directory, sessionId: 'provider-retry', systemPrompt: 'be brief', tools: [],
    retry: { enabled: true, maxRetries: 1, baseDelayMs: 10000, maxDelayMs: 10000 },
    fetchImpl: async () => {
      calls++;
      if (kind === 'network') throw new Error('socket connection lost');
      return new Response('rate limited', { status: 429, headers: { 'retry-after': '10' } });
    } });
  const test = fixture(step);
  const running = test.runtime.executePrompt(test.context.session.id, 'provider retry').catch(() => {});
  try {
    await vi.advanceTimersByTimeAsync(1); expect(calls).toBe(1);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    expect(await handleRpcCommand({ type: 'abort_retry' }, test.host)).toMatchObject({ success: true });
    await vi.runAllTimersAsync(); await running;
    expect(calls).toBe(1); expect(test.signals[0]!.aborted).toBe(false);
    expect(test.genericCancel).not.toHaveBeenCalled();
    expect(test.events).toContainEqual(expect.objectContaining({ type: 'query.failed', error: expect.stringContaining('Retry was cancelled') }));
    expect(test.events.some(event => event.type === 'query.completed')).toBe(false);
  } finally { test.runtime.cancelCurrentRun(); await vi.runAllTimersAsync(); await running; }
});

it('leaves an accepted provider stream live and never replays its failed body', async () => {
  let calls = 0, accepted!: () => void, body!: ReadableStreamDefaultController<Uint8Array>;
  const started = new Promise<void>(resolve => { accepted = resolve; });
  const providerStep = createStepFunction({ provider: { baseUrl: 'https://fixture.test', model: 'fixture' },
    workspaceRoot: directory, sessionId: 'accepted-stream', systemPrompt: 'be brief', tools: [],
    retry: { enabled: true, maxRetries: 2, baseDelayMs: 0, maxDelayMs: 0 },
    fetchImpl: async () => {
      calls++;
      return new Response(new ReadableStream<Uint8Array>({ start(controller) { body = controller; } }),
        { headers: { 'content-type': 'text/event-stream' } });
    } });
  const step: StepFunction = (messages, signal, listener, options) =>
    providerStep(messages, signal, listener, { ...options, onRequestSent: () => accepted() });
  const test = fixture(step);
  const running = test.runtime.executePrompt(test.context.session.id, 'accepted stream').catch(() => {});
  await started;
  try {
    expect(await handleRpcCommand({ type: 'abort_retry' }, test.host)).toMatchObject({ success: true });
    expect(test.signals[0]!.aborted).toBe(false); expect(test.genericCancel).not.toHaveBeenCalled();
  } finally { body.error(new Error('socket connection lost')); await running; }
  expect(calls).toBe(1);
  expect(test.events).toContainEqual(expect.objectContaining({ type: 'query.failed' }));
  expect(test.events.some(event => event.type === 'query.completed')).toBe(false);
  expect(test.events.some(event => event.type === 'query.failed' && event.error.includes('Retry was cancelled'))).toBe(false);
});
