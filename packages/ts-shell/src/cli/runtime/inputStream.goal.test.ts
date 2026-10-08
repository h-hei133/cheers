import fs from 'node:fs';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SessionManager } from '../../session/SessionManager.js';
import { ShellSessionRuntime } from '../../core/shell/sessionRuntime.js';
import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import { configurationBinding } from '../../core/shell/configuration.js';
import { ApprovalTrustPolicy } from '../../core/shell/approvalTrustPolicy.js';
import { HookDispatcher } from '../../core/hooks/hookDispatcher.js';
import { runNonInteractivePrompt } from '../../entrypoints/cliRuntimeModule.js';
import { runTurn } from '../../turn/session.js';
import { readGoalEdit } from '../../planning/goal/store.js';
import { runPromptInputStream } from './inputStream.js';
import { installGoalScheduler } from './goalScheduling.js';

let scratch: string; let root: string;
beforeEach(() => {
  scratch = fs.mkdtempSync(path.resolve(process.cwd(), '../../.tmp/pipe-goal-test-'));
  root = path.join(scratch, 'project'); const home = path.join(scratch, 'home');
  fs.mkdirSync(path.join(root, '.git'), { recursive: true }); fs.mkdirSync(home);
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home); vi.stubEnv('GIT_CEILING_DIRECTORIES', scratch);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(scratch, { recursive: true, force: true }); });

it('activates the actual pipe scheduler and accepts show/pause while its model turn is held', async () => {
  const manager = new SessionManager(); const session = manager.createNew(root);
  const context = { session, projectRoot: root, cwd: root, runtimeConfig: { denyRules: [] },
    configuration: { substrateRevision: 0, current: { binding: configurationBinding({ session, projectRoot: root }) } } } as unknown as ShellRuntimeContext;
  const stdin = new PassThrough(); const lines: string[] = []; let sends = 0;
  let started!: () => void; const first = new Promise<void>(resolve => { started = resolve; });
  let shown!: () => void; const show = new Promise<void>(resolve => { shown = resolve; });
  let paused!: () => void; const pause = new Promise<void>(resolve => { paused = resolve; });
  const renderer = { renderLine: (line: string) => { lines.push(line); }, renderChunk: () => {}, renderBlock: () => {} } as never;
  const logger = { info: () => {}, error: () => {} } as never;
  const runtime = new ShellSessionRuntime({ sessionManager: manager, renderer,
    runPrompt: (prompt, signal) => runTurn({ sessionId: session.id, prompt, workspaceRoot: root, signal,
      history: [], hooks: new HookDispatcher(), tools: new Map(), maxSteps: 1,
      onMessage: message => manager.addTurn(session.id, message), step: async (_messages, stepSignal) => {
        sends++; started();
        await new Promise<void>(resolve => stepSignal.addEventListener('abort', () => resolve(), { once: true }));
        return { text: 'Interrupted', toolCalls: [], stopReason: 'stop' };
      } }) });
  const scheduler = installGoalScheduler(context, manager, runtime, line => lines.push(line));
  const run = runPromptInputStream({ stdin, runtimeContext: context, sessionRuntime: runtime, renderer, logger,
    runPrompt: async prompt => {
      const result = await runNonInteractivePrompt({ prompt, printMode: false, awaitGoalScheduling: false,
        sessionManager: manager, runtimeContext: context, sessionRuntime: runtime, renderer, logger,
        approvalTrustPolicy: new ApprovalTrustPolicy(path.join(scratch, 'trust.json')), setActiveNonInteractiveApprovalMode: () => {} });
      if (prompt === '/goal show') shown();
      if (prompt === '/goal pause') paused();
      return result;
    } });
  try {
    stdin.write('/goal set Advance the recorded work\n'); await first;
    stdin.write('/goal show\n'); await show;
    expect(sends).toBe(1);
    stdin.write('/goal pause\n'); await pause;
    expect(readGoalEdit(manager, session).goal).toMatchObject({ phase: 'paused', runOwner: { token: expect.any(String) },
      scheduling: { pendingRound: true, drain: 'unknown', reason: 'recovery-required' } });
    stdin.end(); await run;
    expect(sends).toBe(1); expect(lines.join('\n')).toContain('Goal paused.');
  } finally { stdin.end(); await scheduler.stop('user'); }
});

it('drains an EOF goal activation through the closed pipe host without dispatching a new round', async () => {
  const manager = new SessionManager(); const session = manager.createNew(root);
  const context = { session, projectRoot: root, cwd: root, runtimeConfig: { denyRules: [] },
    configuration: { substrateRevision: 0, current: { binding: configurationBinding({ session, projectRoot: root }) } } } as unknown as ShellRuntimeContext;
  const stdin = new PassThrough(); const renderer = { renderLine: () => {}, renderChunk: () => {} } as never;
  const runtime = new ShellSessionRuntime({ sessionManager: manager, renderer, runPrompt: async function* () {
    throw new Error('An EOF goal must not dispatch an automatic prompt.');
  } });
  const scheduler = installGoalScheduler(context, manager, runtime, () => {});
  try {
    const run = runPromptInputStream({ stdin, runtimeContext: context, sessionRuntime: runtime, renderer, logger: { info: () => {} } as never,
      runPrompt: prompt => runNonInteractivePrompt({ prompt, printMode: false, awaitGoalScheduling: false,
        sessionManager: manager, runtimeContext: context, sessionRuntime: runtime, renderer, logger: { info: () => {} } as never,
        approvalTrustPolicy: new ApprovalTrustPolicy(path.join(scratch, 'trust.json')), setActiveNonInteractiveApprovalMode: () => {} }) });
    stdin.end('/goal set Finish later\n'); await run;
    expect(readGoalEdit(manager, session).goal).toMatchObject({ phase: 'paused', runOwner: null,
      scheduling: { pendingRound: false, drain: 'settled' } });
    expect(manager.getSession(session.id)?.turns).toHaveLength(0); expect(scheduler.ownerToken()).toBeUndefined();
  } finally { await scheduler.stop('user'); }
});
