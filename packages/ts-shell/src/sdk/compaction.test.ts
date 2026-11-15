import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createAgentSession, type AgentSession } from './agentSession.js';
import type { SessionRuntimeDependencies } from '../core/shell/sessionRuntime.js';
import type { CompactionOutcome } from '../core/shell/compaction.js';

let root: string;
const sessions: AgentSession[] = [];
beforeEach(() => {
  const temporary = path.join(os.tmpdir(), 'cheers-test');
  fs.mkdirSync(temporary, { recursive: true });
  root = fs.mkdtempSync(path.join(temporary, 'sdk-compaction-'));
  const home = path.join(root, 'home'); fs.mkdirSync(home);
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home);
  vi.stubEnv('CHEERS_TEST_ROOT', root); vi.stubEnv('GIT_CEILING_DIRECTORIES', root);
  vi.stubEnv('CHEERS_PROVIDER_MODE', 'synthetic');
});
afterEach(async () => {
  await Promise.allSettled(sessions.splice(0).map(session => session.dispose()));
  vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((accept, refuse) => { resolve = accept; reject = refuse; });
  return { promise, resolve, reject };
}

async function fixture() {
  const { session } = await createAgentSession({ cwd: root, noTools: 'all' });
  sessions.push(session);
  // Replace only the provider operation to control its cleanup deadline. The
  // public SDK, shell admission, idle barrier and disposal remain real.
  const deps = (session.sessionRuntime as unknown as { deps: SessionRuntimeDependencies }).deps;
  const started = deferred<AbortSignal>();
  const completed = deferred<CompactionOutcome>();
  const compact = vi.spyOn(deps, 'compactHistory').mockImplementation(async (_id, signal) => {
    started.resolve(signal);
    return completed.promise;
  });
  return { session, deps, started, completed, compact };
}

const cancelled: CompactionOutcome = { status: 'failed', reason: 'Compaction was cancelled.' };
const tick = () => new Promise<void>(resolve => setImmediate(resolve));

it('keeps idle and abort pending until the owned compaction finishes its cleanup', async () => {
  const test = await fixture();
  const running = test.session.compact('Retain the decisions.');
  const signal = await test.started.promise;
  const controller = test.session.sessionRuntime.getCurrentRunController();
  let idle = false; let aborted = false;
  const waiting = test.session.waitForIdle().then(() => { idle = true; });
  const aborting = test.session.abort().then(() => { aborted = true; });
  try {
    await tick();
    expect(signal.aborted).toBe(true);
    expect({ idle, aborted }).toEqual({ idle: false, aborted: false });
    expect(test.session.sessionRuntime.getCurrentRunController()).toBe(controller);
    expect(test.session.sessionRuntime.isRunning()).toBe(true);
    expect(() => test.session.appendCustomMessage({ customType: 'note', content: 'Too early.', display: false })).toThrow('active turn');
  } finally {
    test.completed.resolve(cancelled);
    await Promise.all([running, waiting, aborting]);
  }
  expect(test.session.sessionRuntime.isRunning()).toBe(false);
  expect(test.session.sessionRuntime.getCurrentRunController()).toBeNull();
  test.compact.mockRestore();
  await test.session.prompt('Continue after cancellation.');
  test.session.appendCustomMessage({ customType: 'note', content: 'Ready.', display: false });
});

it('refuses a second compaction without replacing the first cancellation owner', async () => {
  const test = await fixture();
  const first = test.session.compact();
  const signal = await test.started.promise;
  const controller = test.session.sessionRuntime.getCurrentRunController();
  // A bad implementation must fail an assertion, not hang the test behind the
  // intentionally pending first operation.
  test.compact.mockResolvedValueOnce({ status: 'nothing', reason: 'No retained history.' });
  try {
    await expect(test.session.compact()).resolves.toEqual({ status: 'busy' });
    expect(test.compact).toHaveBeenCalledTimes(1);
    expect(test.session.sessionRuntime.getCurrentRunController()).toBe(controller);
    test.session.sessionRuntime.cancelCurrentRun();
    expect(signal.aborted).toBe(true);
  } finally { test.completed.resolve(cancelled); await first; }
});

it('refuses prompts and local commands while compaction owns the session', async () => {
  const test = await fixture();
  const running = test.session.compact();
  await test.started.promise;
  const controller = test.session.sessionRuntime.getCurrentRunController();
  const dispatch = vi.spyOn(test.deps, 'runPrompt');
  const command = vi.fn(async () => 'overlap');
  try {
    await expect(test.session.prompt('Do not append this prompt.')).rejects.toThrow('still running');
    await expect(test.session.sessionRuntime.commands.run(command)).rejects.toThrow('still running');
    expect(dispatch).not.toHaveBeenCalled(); expect(command).not.toHaveBeenCalled();
    expect(test.session.getState().turns).toEqual([]);
    expect(test.session.sessionRuntime.getCurrentRunController()).toBe(controller);
  } finally { test.completed.resolve(cancelled); await running; }
});

it('refuses compaction while a cancelled local command is settling', async () => {
  const test = await fixture();
  test.compact.mockResolvedValue({ status: 'nothing', reason: 'No retained history.' });
  const gate = deferred<string>();
  const running = test.session.sessionRuntime.commands.run(() => gate.promise);
  const controller = test.session.sessionRuntime.getCurrentRunController();
  test.session.sessionRuntime.cancelCurrentRun();
  try {
    await expect(test.session.compact()).resolves.toEqual({ status: 'busy' });
    expect(test.compact).not.toHaveBeenCalled();
    expect(test.session.sessionRuntime.getCurrentRunController()).toBe(controller);
  } finally { gate.resolve('settled'); await running; }
});

it('keeps prompt settlement exclusive before admitting compaction or another prompt', async () => {
  const test = await fixture();
  test.compact.mockResolvedValue({ status: 'nothing', reason: 'No retained history.' });
  const entered = deferred<void>(); const gate = deferred<void>();
  const original = test.deps.promptSettled;
  const settling = vi.spyOn(test.deps, 'promptSettled').mockImplementation(async (...args) => {
    await original?.(...args); entered.resolve(); await gate.promise;
  });
  const running = test.session.prompt('Finish the request.');
  try {
    await entered.promise;
    expect(test.session.sessionRuntime.getCurrentRunController()).toBeNull();
    const dispatch = vi.spyOn(test.deps, 'runPrompt');
    await expect(test.session.compact()).resolves.toEqual({ status: 'busy' });
    await expect(test.session.prompt('Do not enter.')).rejects.toThrow('still running');
    expect(test.compact).not.toHaveBeenCalled(); expect(dispatch).not.toHaveBeenCalled();
    expect(test.session.sessionRuntime.isRunning()).toBe(true);
  } finally { gate.resolve(); await running; settling.mockRestore(); }
});

it('keeps rejected prompt admission from detaching an active prompt from idle waiters', async () => {
  const test = await fixture();
  const entered = deferred<void>(); const gate = deferred<void>();
  const original = test.deps.admitPrompt;
  const admitting = vi.spyOn(test.deps, 'admitPrompt').mockImplementation(async (...args) => {
    entered.resolve(); await gate.promise; await original?.(...args);
  });
  const running = test.session.prompt('The admitted request.');
  let idle = false;
  try {
    await entered.promise;
    const controller = test.session.sessionRuntime.getCurrentRunController();
    // Make an accidentally admitted second prompt settle instead of deadlock.
    admitting.mockImplementationOnce(async () => { throw new Error('Unexpected second admission'); });
    await expect(test.session.prompt('Overlap.')).rejects.toThrow('still running');
    const waiting = test.session.waitForIdle().then(() => { idle = true; });
    await tick(); expect(idle).toBe(false);
    expect(test.session.sessionRuntime.getCurrentRunController()).toBe(controller);
    gate.resolve(); await running; await waiting;
  } finally { gate.resolve(); await running.catch(() => {}); }
});

it('reports compaction rejection to its caller and existing idle waiters without blocking reuse', async () => {
  const test = await fixture();
  const failure = new Error('Summary cleanup failed');
  const running = test.session.compact();
  await test.started.promise;
  const waiting = test.session.waitForIdle();
  const results = Promise.allSettled([running, waiting]);
  test.completed.reject(failure);
  expect(await results).toEqual([{ status: 'rejected', reason: failure }, { status: 'rejected', reason: failure }]);
  expect(test.session.sessionRuntime.isRunning()).toBe(false);
  await test.session.waitForIdle();
  test.compact.mockRestore();
  await test.session.prompt('Continue after failure.');
});

it('delays disposal cleanup and termination until compaction has settled', async () => {
  const test = await fixture();
  const clearCache = vi.fn(); test.session.runtimeContext.freshState = { clearCache };
  const terminate = vi.spyOn(test.session.sessionRuntime, 'terminate');
  const running = test.session.compact();
  const signal = await test.started.promise;
  let disposed = false;
  const disposing = test.session.dispose().then(() => { disposed = true; });
  try {
    await tick();
    expect(signal.aborted).toBe(true); expect(disposed).toBe(false);
    expect(clearCache).not.toHaveBeenCalled(); expect(terminate).not.toHaveBeenCalled();
  } finally { test.completed.resolve(cancelled); await running; await disposing; }
  expect(clearCache).toHaveBeenCalledTimes(1); expect(terminate).toHaveBeenCalledTimes(1);
});

it('rejects compaction after disposal begins before invoking its provider', async () => {
  const test = await fixture();
  test.compact.mockResolvedValue({ status: 'nothing', reason: 'No retained history.' });
  const disposing = test.session.dispose();
  await expect(test.session.compact()).rejects.toThrow('disposed');
  await disposing;
  await expect(test.session.compact()).rejects.toThrow('disposed');
  expect(test.compact).not.toHaveBeenCalled();
});

it('still cancels and joins compaction when a cancellation hook throws', async () => {
  const test = await fixture();
  const failure = new Error('Cancellation hook failed');
  vi.spyOn(test.deps, 'onCancelRequested').mockImplementation(() => { throw failure; });
  const clearCache = vi.fn(); test.session.runtimeContext.freshState = { clearCache };
  const running = test.session.compact();
  const signal = await test.started.promise;
  let settled = false;
  const disposing = test.session.dispose();
  const observed = disposing.then(() => { settled = true; return undefined; }, error => { settled = true; return error; });
  try {
    await tick();
    expect(signal.aborted).toBe(true);
    expect(settled).toBe(false); expect(clearCache).not.toHaveBeenCalled();
  } finally { test.completed.resolve(cancelled); await running; }
  expect(await observed).toBe(failure);
  expect(clearCache).toHaveBeenCalledTimes(1);
});

it('does not cancel or wait on a successor started by an idle cancellation hook', async () => {
  const test = await fixture();
  let successor!: Promise<CompactionOutcome>;
  const hook = vi.spyOn(test.deps, 'onCancelRequested').mockImplementationOnce(() => {
    successor = test.session.compact();
  });
  const aborting = test.session.abort();
  const signal = await test.started.promise;
  try {
    let settled = false; const observed = aborting.then(() => { settled = true; });
    await tick();
    expect(signal.aborted).toBe(false); expect(settled).toBe(true);
    expect(test.session.sessionRuntime.isRunning()).toBe(true);
    await observed;
  } finally { test.completed.resolve(cancelled); await successor; await aborting; hook.mockRestore(); }
});
