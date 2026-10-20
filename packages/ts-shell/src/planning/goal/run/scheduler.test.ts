import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionManager } from '../../../session/SessionManager.js';
import type { Session } from '../../../session/schema/sessionRecord.js';
import { ShellSessionRuntime } from '../../../core/shell/sessionRuntime.js';
import type { StreamingRenderer } from '../../../presentation/terminal/streaming.js';
import type { HookDispatcher } from '../../../core/hooks/hookDispatcher.js';
import type { QueryEvent } from '../../../core/query/runtime/events.js';
import { runTurn } from '../../../turn/session.js';
import type { StepFunction } from '../../../turn/step.js';
import { goalRequestPolicy } from '../budget.js';
import { readGoalEdit } from '../store.js';
import { runSessionGoalCommand } from '../command.js';
import { GoalScheduler } from './scheduler.js';
import { claimGoalRun, recoverGoalRun } from './store.js';
import { createRunOwner } from './owner.js';
import { cancelGoalRunForShutdown, installGoalScheduler } from '../../../cli/runtime/goalScheduling.js';
import { createCliShutdown } from '../../../cli/runtime/shutdown.js';

let scratch: string; let root: string; let manager: SessionManager; let session: Session;
const schedulers: GoalScheduler[] = [];
const hooks = { dispatch: async () => ({ decision: 'allow' as const }) } as unknown as HookDispatcher;
beforeEach(async () => {
  const base = path.resolve('../../.tmp'); fs.mkdirSync(base, { recursive: true }); scratch = fs.mkdtempSync(path.join(base, 'goal-run-'));
  root = path.join(scratch, 'project'); const home = path.join(scratch, 'home');
  fs.mkdirSync(path.join(root, '.git'), { recursive: true }); fs.mkdirSync(home);
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home); vi.stubEnv('GIT_CEILING_DIRECTORIES', scratch);
  manager = new SessionManager(); session = manager.createNew(root);
  await command(['set', 'Advance recorded work']);
});
afterEach(async () => {
  for (const scheduler of schedulers.splice(0)) await scheduler.stop('user');
  vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(scratch, { recursive: true, force: true });
});
function command(args: string[]) { return runSessionGoalCommand(args, { cwd: root, projectRoot: root, sessionId: session.id }, manager, session); }
function goal() { return readGoalEdit(manager, session).goal!; }

function setup(step: StepFunction, submitOverride?: (run: (prompt: string, metadata: Record<string, unknown>) => Promise<void>, prompt: string, metadata: Record<string, unknown>) => Promise<void>) {
  let scheduler!: GoalScheduler;
  const lines: string[] = [];
  const renderer = { renderLine: (line: string) => { lines.push(line); }, renderChunk: (delta: string) => { lines.push(delta); },
    renderReasoningDelta: () => {}, renderBlock: () => {} } as unknown as StreamingRenderer;
  const runtime = new ShellSessionRuntime({ sessionManager: manager, renderer, onCancelRequested: () => scheduler.interrupt(),
    runPrompt: (prompt, signal) => runTurn({ sessionId: session.id, workspaceRoot: root, prompt, signal, step,
      history: manager.getSession(session.id)!.turns.slice(0, -1), onMessage: message => manager.addTurn(session.id, message), hooks, maxSteps: 1, permissionScope: 'allow-all',
      tools: new Map([['read', { name: 'read', description: 'Read-only fixture', argsSchema: { type: 'object' }, execute: async () => ({ success: true, output: 'observed' }) }]]) }) });
  const run = async (prompt: string, promptMetadata: Record<string, unknown>) => { await runtime.executePrompt(session.id, prompt, { promptMetadata }); };
  scheduler = new GoalScheduler({ store: manager, current: () => session, cancel: () => runtime.cancelCurrentRun(), report: message => lines.push(message),
    host: { ready: () => runtime.getCurrentRunController() === null, submit: (prompt, metadata) => submitOverride ? submitOverride(run, prompt, metadata) : run(prompt, metadata) } });
  runtime.observeEvents(event => scheduler.observe(event), { renders: false }); schedulers.push(scheduler);
  return { scheduler, runtime, lines };
}

function completed(): Extract<QueryEvent, { type: 'query.completed' }> {
  return { type: 'query.completed', result: { status: 'completed', terminalReason: 'completed', terminalClassification: 'success',
    transcript: [], sharedContext: { sessionId: session.id, initialPrompt: 'internal', notes: [], handoffs: [] }, finalOutput: 'All done.' } };
}

describe('durable goal scheduling', () => {
  it('preserves manual terminal output with a passive goal scheduler observer installed', async () => {
    const lines: string[] = [];
    const runtime = new ShellSessionRuntime({ sessionManager: manager,
      renderer: { renderLine: (text: string) => lines.push(text), renderChunk: (text: string) => lines.push(text) } as never,
      runPrompt: async function* () {
        yield { type: 'message.delta', role: 'coder', delta: 'Visible manual answer' };
        yield completed();
      } });
    schedulers.push(installGoalScheduler({ session } as never, manager, runtime, text => lines.push(text)));
    await runtime.executePrompt(session.id, 'Ordinary human turn');
    expect(lines.join('\n')).toContain('Visible manual answer');
    expect(goal().scheduling).toBeUndefined();
  });

  it('bounds actual CLI cleanup after an automatic runtime ignores cancellation without clearing its owner', async () => {
    vi.useFakeTimers();
    let scheduler!: GoalScheduler;
    const runtime = new ShellSessionRuntime({ sessionManager: manager, renderer: { renderLine() {}, renderChunk() {} } as never,
      onCancelRequested: () => scheduler.interrupt(), runPrompt: async function* () { await new Promise<void>(() => {}); } });
    scheduler = installGoalScheduler({ session } as never, manager, runtime, () => {});
    let closed = false;
    const shutdown = createCliShutdown({ close: () => cancelGoalRunForShutdown(runtime), process: new EventEmitter() as never,
      exit() {}, writeError() {} });
    try {
      expect(scheduler.start()).toBeUndefined(); await vi.advanceTimersByTimeAsync(81);
      expect(runtime.getCurrentRunController()).not.toBeNull();
      const stopped = scheduler.stop('user'); await vi.advanceTimersByTimeAsync(1_100); await stopped; await scheduler.wait();
      const closing = shutdown.close().then(() => { closed = true; }); await vi.advanceTimersByTimeAsync(1_100);
      expect(closed).toBe(true); await closing;
      expect(runtime.getCurrentRunController()).not.toBeNull();
      expect(goal()).toMatchObject({ phase: 'paused', runOwner: { token: expect.any(String) },
        scheduling: { pendingRound: true, drain: 'unknown' } });
    } finally { vi.clearAllTimers(); vi.useRealTimers(); }
  });

  it('continues beyond per-turn model step limits and retains actual prompt persistence and human origin', async () => {
    manager.persistUserPromptBarrier(session.id, 'The human request'); manager.saveCompleted(session.id);
    let count = 0;
    const step: StepFunction = vi.fn(async (_messages, _signal, listener) => {
      listener.onText?.('another observation');
      return { text: 'another observation', toolCalls: [{ id: `read-${++count}`, name: 'read', args: {} }], stopReason: 'stop' };
    });
    const { scheduler, lines } = setup(step);
    expect(scheduler.start()).toBeUndefined();
    await vi.waitFor(() => expect(goal().scheduling).toMatchObject({ phase: 'ready', round: 4, lastOutcome: 'step-limit', pendingRound: false }), { timeout: 3000, interval: 5 });
    await command(['pause']); await scheduler.stop();
    const stopped = count;
    await new Promise(resolve => setTimeout(resolve, 120));
    expect(count).toBe(stopped); expect(stopped).toBeGreaterThanOrEqual(4);
    expect(goal()).toMatchObject({ phase: 'paused', runOwner: null }); expect(goal().completion).toBeUndefined();
    expect(manager.getSession(session.id)!.turns.filter(turn => turn.role === 'user' && turn.metadata?.source === 'goal-continuation')).toHaveLength(stopped);
    expect(manager.buildContinuitySnapshot(session.id).lastUserIntent).toBe('The human request');
    expect(lines.join('\n')).toContain('another observation');
  });

  it('keeps a live scheduling owner during reentry and fences other request owners', async () => {
    const owner = createRunOwner(); claimGoalRun(manager, session, owner);
    expect(() => claimGoalRun(manager, session, createRunOwner())).toThrow();
    expect(recoverGoalRun(manager, session).goal).toMatchObject({ phase: 'active', runOwner: owner });
    const policy = goalRequestPolicy(manager, session)!;
    expect(() => policy.reserve({ requestId: 'other', bodyDigest: '0'.repeat(64), provider: 'test', model: 'm', endpoint: 'openai-compatible', purpose: 'turn' })).toThrow(/inactive/);
  });

  it('rechecks pending input at actual handoff and releases only a confirmed unsubmitted round', async () => {
    const { scheduler } = setup(async () => ({ text: 'answer', toolCalls: [], stopReason: 'stop' }));
    let checks = 0; const submit = vi.fn(async () => {});
    scheduler.attach({ ready: () => ++checks < 4, submit });
    expect(scheduler.start()).toBeUndefined();
    await vi.waitFor(() => expect(goal().scheduling).toMatchObject({ phase: 'ready', round: 1, pendingRound: false }));
    expect(submit).not.toHaveBeenCalled();
  });

  it('retains an unresolved round when a host reports success without its durable prompt/terminal receipt', async () => {
    const { scheduler } = setup(async () => ({ text: 'answer', toolCalls: [], stopReason: 'stop' }));
    const submit = vi.fn(async () => { scheduler.observe(completed()); });
    scheduler.attach({ ready: () => true, submit }); scheduler.start();
    await vi.waitFor(() => expect(goal().scheduling).toMatchObject({ phase: 'draining', pendingRound: true, reason: 'recovery-required', drain: 'unknown' }));
    expect(submit).toHaveBeenCalledOnce(); expect(goal().runOwner).not.toBeNull();
  });

  it('settles the attached host captured by a round after that host is detached', async () => {
    const { scheduler } = setup(async () => ({ text: 'answer', toolCalls: [], stopReason: 'stop' }));
    let release!: () => void;
    const settled = vi.fn();
    const detach = scheduler.attach({
      ready: () => true,
      submit: () => new Promise<void>(resolve => { release = resolve; }),
      settled,
    });
    scheduler.start();
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));

    detach();
    release();
    await vi.waitFor(() => expect(settled).toHaveBeenCalledOnce());
  });

  it('responds to pause after bounded drain without clearing a hung round or admitting a replacement', async () => {
    const { scheduler } = setup(async () => ({ text: 'answer', toolCalls: [], stopReason: 'stop' }));
    let release!: () => void;
    const settled = vi.fn();
    const hung = new Promise<void>(resolve => { release = resolve; });
    scheduler.attach({ ready: () => true, submit: () => hung, settled }); scheduler.start();
    await vi.waitFor(() => expect(goal().scheduling).toMatchObject({ phase: 'running', pendingRound: true }));
    const owner = goal().runOwner; const started = Date.now();
    await scheduler.stop('user'); await scheduler.wait();
    expect(Date.now() - started).toBeLessThan(1800);
    expect(settled).toHaveBeenCalledOnce();
    expect(goal()).toMatchObject({ phase: 'paused', runOwner: owner, scheduling: { phase: 'draining', pendingRound: true, drain: 'unknown' } });
    expect((await command(['resume'])).output).toContain('not saved: recovery-required');
    expect(() => claimGoalRun(manager, session, createRunOwner())).toThrow();
    release();
    await vi.waitFor(() => expect(goal().scheduling?.reason).toBe('recovery-required'));
    expect(settled).toHaveBeenCalledOnce();
  });

  it('recovers a proven dead process owner without replaying its interrupted round', async () => {
    const script = path.join(scratch, 'owner.mjs'); const inputFile = path.join(scratch, 'session.json');
    fs.writeFileSync(inputFile, JSON.stringify(session));
    fs.writeFileSync(script, `import fs from 'node:fs';
import { claimGoalRun, beginGoalRound } from ${JSON.stringify(path.resolve('src/planning/goal/run/store.ts'))};
import { createRunOwner } from ${JSON.stringify(path.resolve('src/planning/goal/run/owner.ts'))};
const session = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const host = { getSessionDirPath: () => process.argv[3], getTranscriptEvents: () => [] };
const owner = createRunOwner(); claimGoalRun(host, session, owner); beginGoalRound(host, session, owner.token, () => true);
console.log('running'); process.stdin.resume();
`);
    const [major, minor] = process.versions.node.split('.').map(Number);
    const loading = major! > 20 || major === 20 && minor! >= 6 ? '--import' : '--loader';
    const child = spawn(process.execPath, [loading, path.resolve('../../node_modules/tsx/dist/loader.mjs'), script, inputFile, manager.getSessionDirPath(session.id)], { stdio: ['pipe', 'pipe', 'pipe'] });
    const exited = new Promise<void>(resolve => child.once('exit', () => resolve()));
    try {
      await new Promise<void>((resolve, reject) => {
        let output = ''; child.stdout.on('data', chunk => { output += String(chunk); if (output.includes('running\n')) resolve(); });
        child.once('error', reject); child.once('exit', code => reject(new Error(`owner exited before ready: ${code}`)));
      });
      const owner = goal().runOwner;
      expect(recoverGoalRun(manager, session).goal).toMatchObject({ phase: 'active', runOwner: owner });
      expect(() => claimGoalRun(manager, session, createRunOwner())).toThrow();
      child.kill('SIGKILL'); await exited;
      expect(recoverGoalRun(manager, session).goal).toMatchObject({ phase: 'paused', runOwner: null,
        scheduling: { phase: 'paused', pendingRound: true, reason: 'recovery-required', drain: 'unknown' } });
      expect((await command(['resume'])).output).toContain('not saved: recovery-required');
      expect(manager.getSession(session.id)!.turns).toHaveLength(0);
    } finally { child.kill('SIGKILL'); await exited; }
  });

  it('uses persisted failure after a query success whose normal session save failed', async () => {
    const { scheduler } = setup(async () => ({ text: 'All done.', toolCalls: [], stopReason: 'stop' }), async (run, prompt, metadata) => { await run(prompt, metadata).catch(() => {}); });
    vi.spyOn(manager, 'saveCompleted').mockImplementation(() => { throw new Error('state publication failed'); });
    scheduler.start();
    await vi.waitFor(() => expect(goal().scheduling).toMatchObject({ phase: 'paused', pendingRound: false, lastOutcome: 'failure', reason: 'failure' }));
    expect(goal()).toMatchObject({ phase: 'paused', runOwner: null }); expect(goal().completion).toBeUndefined();
  });

  it.each([['unsupported', 'unsupported'], [undefined, 'failure']] as const)('uses typed admission %s without trusting provider error prose', async (admissionFailure, reason) => {
    const { scheduler } = setup(async () => ({ text: '', toolCalls: [], stopReason: 'error', retriesExhausted: true,
      errorMessage: 'Model request admission unsupported', ...(admissionFailure ? { admissionFailure } : {}) }));
    scheduler.start();
    await vi.waitFor(() => expect(goal().scheduling).toMatchObject({ phase: 'paused', reason, lastOutcome: 'failure', pendingRound: false }));
  });
});
