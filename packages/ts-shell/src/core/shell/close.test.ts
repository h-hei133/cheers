import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { QueryEvent } from '../query/runtime/events.js';
import { SessionManager } from '../../session/SessionManager.js';
import { hasUnfinishedSessionWork } from '../../session/recovery/work.js';
import { getRuntimeConfig } from '../../config/runtimeConfig.js';
import { bootstrapShellRuntime } from './bootstrap.js';
import { ShellSessionRuntime } from './sessionRuntime.js';
import { handleShellClose } from './signalHandlers.js';

let root: string;
beforeEach(() => {
  const base = path.resolve('.tmp/shell-close');
  fs.mkdirSync(base, { recursive: true });
  root = fs.mkdtempSync(path.join(base, 'case-'));
  vi.stubEnv('HOME', root);
  vi.stubEnv('USERPROFILE', root);
  vi.stubEnv('CHEERS_TEST_ROOT', root);
  vi.stubEnv('CHEERS_PROVIDER_MODE', 'synthetic');
  vi.stubEnv('GIT_CEILING_DIRECTORIES', root);
});
afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(root, { recursive: true, force: true });
});

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

function setup(runPrompt: ConstructorParameters<typeof ShellSessionRuntime>[0]['runPrompt'] = async function* () {}) {
  const manager = new SessionManager();
  const session = manager.createNew(root);
  const renderer = { renderLine: vi.fn(), renderChunk: vi.fn() };
  const runtime = new ShellSessionRuntime({ sessionManager: manager, renderer: renderer as never, runPrompt });
  const close = (exit = vi.fn()) => {
    handleShellClose({ sessionRuntime: runtime, renderer: renderer as never,
      runtimeContext: { session } as never, sessionManager: manager, exit });
    return exit;
  };
  const state = () => JSON.parse(fs.readFileSync(path.join(manager.getSessionDirPath(session.id), 'state.json'), 'utf8'));
  const bootstrap = () => bootstrapShellRuntime({ cwd: root, runtimeConfig: getRuntimeConfig(root),
    gitContext: { insideGit: false, branch: null, isClean: null, root: null },
    sessionManager: new SessionManager(), renderer: renderer as never, emitLifecycleMessages: false });
  return { manager, session, renderer, runtime, close, state, bootstrap };
}

it.each(['prompt', 'tool', 'approval'] as const)('retains durable %s evidence while ordinary exit waits for cancellation', async stage => {
  const entered = deferred();
  const release = deferred();
  const test = setup(async function* (_prompt, signal) {
    if (stage !== 'prompt') yield { type: stage === 'tool' ? 'tool.started' : 'approval.requested',
      toolName: 'edit', taskId: 'pending-call' } as QueryEvent;
    entered.resolve();
    await release.promise;
    if (signal.aborted) throw new Error('Fixture cancellation');
  });
  const run = test.runtime.executePrompt(test.session.id, 'retain this exact pending request');
  const result = run.catch(error => error);
  await entered.promise;
  const before = test.state();
  let cleanup: Promise<void> | undefined;
  let settled = false;
  try {
    test.close(() => { cleanup = test.runtime.cancelAndWait().then(() => { settled = true; }); });
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(test.state()).toMatchObject({ pendingPrompt: before.pendingPrompt,
      pendingPromptEntryId: before.pendingPromptEntryId, runPhase: before.runPhase });
    const reopened = new SessionManager();
    const snapshot = reopened.getRecoverySnapshot(test.session.id);
    expect(snapshot.pendingPrompt).toBe('retain this exact pending request');
    expect(hasUnfinishedSessionWork(snapshot)).toBe(true);
    if (stage === 'tool') expect(snapshot.pendingLifecycle.pendingTools).toHaveProperty('pending-call');
    if (stage === 'approval') expect(snapshot.pendingLifecycle.pendingApprovals).toHaveProperty('pending-call');
    expect(test.bootstrap().context.session.id).toBe(test.session.id);
  } finally {
    release.resolve();
    await result;
    await cleanup;
  }
  const reopened = new SessionManager();
  expect(reopened.getSession(test.session.id)?.status).toBe('interrupted');
  expect(reopened.getRecoverySnapshot(test.session.id).pendingPrompt).toBe('retain this exact pending request');
  expect(reopened.describeSessionReentry(test.session.id).autoResumeReady).toBe(true);
  expect(test.bootstrap().context.session.id).toBe(test.session.id);
});

it('retains a previously interrupted prompt when exiting an idle runtime', () => {
  const test = setup();
  test.manager.persistUserPromptBarrier(test.session.id, 'resume this interrupted request');
  test.manager.markTurnActive(test.session.id);
  test.manager.saveInterrupted(test.session.id, 'turn');
  const before = test.state();
  expect(test.close()).toHaveBeenCalledWith(0);
  expect(test.state()).toEqual(before);
  const reopened = new SessionManager();
  expect(reopened.getSession(test.session.id)?.status).toBe('interrupted');
  expect(reopened.getRecoverySnapshot(test.session.id).pendingPrompt).toBe('resume this interrupted request');
  expect(reopened.describeSessionReentry(test.session.id).autoResumeReady).toBe(true);
});

it('retains stopped outcome evidence on ordinary close', () => {
  const test = setup();
  test.manager.addTurn(test.session.id, { role: 'user', content: 'inspect before writing' });
  test.manager.saveError(test.session.id, 'verification is missing', {
    terminalReason: 'stopped_not_proven', terminalClassification: 'stopped',
  });
  const before = test.state();
  expect(hasUnfinishedSessionWork(test.manager.getRecoverySnapshot(test.session.id))).toBe(true);
  expect(test.close()).toHaveBeenCalledWith(0);
  expect(test.state()).toEqual(before);
  expect(new SessionManager().getRecoverySnapshot(test.session.id)).toMatchObject({
    terminalReason: 'stopped_not_proven', terminalClassification: 'stopped',
  });
  expect(test.bootstrap().context.session.id).toBe(test.session.id);
});

it('retains unverified compact task state without a pending prompt', () => {
  const test = setup();
  test.manager.addTurn(test.session.id, { role: 'user', content: 'verify these changes' });
  test.manager.saveCompleted(test.session.id);
  const statePath = path.join(test.manager.getSessionDirPath(test.session.id), 'state.json');
  fs.writeFileSync(statePath, JSON.stringify({ ...test.state(), workingMemory: { continuity: { taskState: {
    source: 'compact', unverifiedFiles: ['changed.ts'], continuationSafety: { status: 'safe', reasons: [] },
  } } } }));
  const before = test.state();
  expect(hasUnfinishedSessionWork(test.manager.getRecoverySnapshot(test.session.id))).toBe(true);
  expect(test.close()).toHaveBeenCalledWith(0);
  expect(test.state()).toEqual(before);
  expect(new SessionManager().getRecoverySnapshot(test.session.id).taskState?.unverifiedFiles).toEqual(['changed.ts']);
  expect(test.bootstrap().context.session.id).toBe(test.session.id);
});

it('keeps active local commands in the original cancellation join', async () => {
  const test = setup();
  test.manager.addTurn(test.session.id, { role: 'user', content: 'local operation' });
  const entered = deferred();
  const release = deferred();
  const command = test.runtime.commands.run(async signal => {
    entered.resolve();
    await release.promise;
    expect(signal.aborted).toBe(true);
  });
  await entered.promise;
  const before = test.state();
  let cleanup: Promise<void> | undefined;
  let settled = false;
  try {
    test.close(() => { cleanup = test.runtime.cancelAndWait().then(() => { settled = true; }); });
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(test.state()).toEqual(before);
    expect(test.runtime.commands.current?.controller.signal.aborted).toBe(true);
  } finally {
    release.resolve();
    await command;
    await cleanup;
  }
  expect(settled).toBe(true);
});

it('keeps a completed run pending until its original settlement hook finishes', async () => {
  const entered = deferred();
  const release = deferred();
  const test = setup();
  const runtime = new ShellSessionRuntime({ sessionManager: test.manager, renderer: test.renderer as never,
    runPrompt: async function* () {
      yield { type: 'query.completed', result: { status: 'completed', terminalReason: 'completed',
        terminalClassification: 'success', transcript: [],
        sharedContext: { sessionId: test.session.id, initialPrompt: 'done', notes: [], handoffs: [] },
        finalOutput: 'done' } };
    },
    promptSettled: async () => { entered.resolve(); await release.promise; },
  });
  const run = runtime.executePrompt(test.session.id, 'done');
  await entered.promise;
  expect(runtime.getCurrentRunController()).toBeNull();
  let cleanup: Promise<void> | undefined;
  try {
    const before = test.state();
    handleShellClose({ sessionRuntime: runtime, renderer: test.renderer as never,
      runtimeContext: { session: test.session } as never, sessionManager: test.manager,
      exit: () => { cleanup = runtime.cancelAndWait(); } });
    expect(test.state()).toEqual(before);
    expect(test.manager.getSession(test.session.id)?.status).toBe('completed');
  } finally {
    release.resolve();
    await run;
    await cleanup;
  }
});

it('reports unreadable recovery without clearing it or offering a resume id', () => {
  const test = setup();
  test.manager.addTurn(test.session.id, { role: 'user', content: 'retained request' });
  const before = test.state();
  const snapshot = vi.spyOn(test.manager, 'getRecoverySnapshot').mockImplementation(() => {
    throw new Error('PRIVATE_RECOVERY_FAILURE');
  });
  try {
    expect(test.close()).toHaveBeenCalledWith(1);
    expect(test.state()).toEqual(before);
    expect(test.renderer.renderLine.mock.calls).toEqual([
      ['Session state could not be saved; session close was not verified.'],
    ]);
  } finally { snapshot.mockRestore(); }
});

it.each([false, true])('closes confirmed idle sessions and checks actual retention (conversation=%s)', conversation => {
  const test = setup();
  if (conversation) {
    test.manager.addTurn(test.session.id, { role: 'user', content: 'finished question' });
    test.manager.addTurn(test.session.id, { role: 'assistant', content: 'finished answer' });
    test.manager.saveCompleted(test.session.id);
  }
  expect(test.close()).toHaveBeenCalledWith(0);
  expect(test.runtime.getState()).toBe('terminated');
  expect(test.manager.sessionExists(test.session.id)).toBe(conversation);
  expect(test.renderer.renderLine.mock.calls).toEqual([[conversation ? `\n  --resume ${test.session.id}\n` : '']]);
  if (conversation) {
    expect(new SessionManager().getSession(test.session.id)?.status).toBe('terminated');
    expect(hasUnfinishedSessionWork(new SessionManager().getRecoverySnapshot(test.session.id))).toBe(false);
    expect(test.bootstrap().context.session.id).not.toBe(test.session.id);
  }
});

it('keeps explicit durable termination as the prompt-clearing primitive', () => {
  const test = setup();
  test.manager.persistUserPromptBarrier(test.session.id, 'explicitly discarded request');
  test.manager.saveTerminated(test.session.id);
  expect(test.state().pendingPrompt).toBeUndefined();
  expect(test.state().pendingPromptEntryId).toBeUndefined();
  expect(new SessionManager().describeSessionReentry(test.session.id).autoResumeReady).toBe(false);
});
