import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SessionManager } from '../../../session/SessionManager.js';
import type { Session } from '../../../session/schema/sessionRecord.js';
import { ShellSessionRuntime } from '../../../core/shell/sessionRuntime.js';
import { runTurn } from '../../../turn/session.js';
import { createCoreToolRegistry } from '../../../core/tools/registry.js';
import { HookDispatcher } from '../../../core/hooks/hookDispatcher.js';
import { readGoalEdit, writeGoal } from '../store.js';
import { readPlan } from '../../plan/store.js';
import { runPlanCommand } from '../../plan/command.js';
import { planVersion, textDigest } from '../../plan/codec.js';
import { acceptanceCapture } from './capture.js';
import { completeAcceptedGoal } from './complete.js';
import { decodeAcceptance, decodeVerifiedCompletion } from './codec.js';
import type { StepFunction } from '../../../turn/step.js';
import { assertSourceAccess } from '../../../core/query/sourcePolicy.js';
import { GoalScheduler } from '../run/scheduler.js';

let scratch: string; let root: string; let manager: SessionManager; let session: Session;
beforeEach(() => {
  scratch = fs.mkdtempSync(path.resolve(process.cwd(), '../../.tmp/acceptance-test-')); root = path.join(scratch, 'project');
  const home = path.join(scratch, 'home'); fs.mkdirSync(path.join(root, '.git'), { recursive: true }); fs.mkdirSync(home);
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home); vi.stubEnv('GIT_CEILING_DIRECTORIES', scratch);
  manager = new SessionManager(); session = manager.createNew(root);
  writeGoal(manager, session, readGoalEdit(manager, session), { type: 'prepare', objective: 'Create a verified target' });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(scratch, { recursive: true, force: true }); });
const check = 'cat -- "accepted.txt"';
const access = (absolute: string) => assertSourceAccess(absolute, root, [], 'accept-edits', []);
async function plan(source: string) {
  const args = source.startsWith('check') ? ['check', '--target', 'accepted.txt', '--implementation', '--', 'cat', '--', 'accepted.txt']
    : source.startsWith('artifact') ? ['artifact', 'accepted.txt', textDigest('ok\n'), '--implementation'] : ['set', 'Implement the target'];
  return runPlanCommand('plan', args, { cwd: root, projectRoot: root, sessionId: session.id, rawCommandArgs: source }, manager, session,
    { setMode: () => {}, beforeChange: async () => {} });
}
async function approved() {
  await plan('set Implement the target'); await plan(`check --target accepted.txt --implementation -- ${check}`);
  await plan(`artifact accepted.txt ${textDigest('ok\n')} --implementation`);
  const version = planVersion(readPlan(manager, session).plan!);
  for (const action of ['approve', 'execute'] as const) await runPlanCommand('plan-review', [action, version],
    { cwd: root, projectRoot: root, sessionId: session.id }, manager, session, { beforeChange: async () => {}, setMode: () => {} });
  return version;
}
function makeRuntime(step: StepFunction, hooks = new HookDispatcher(), finish = true) {
  let origin = '';
  const runtime = new ShellSessionRuntime({ sessionManager: manager, renderer: { renderLine: () => {}, renderChunk: () => {} } as never,
    runPrompt: (prompt, signal) => {
      const current = manager.getSession(session.id)!; origin = current.turns.at(-1)!.id!;
      const run = runTurn({ sessionId: session.id, prompt, workspaceRoot: root, agentMode: 'build', permissionScope: 'accept-edits',
        escalationPromptHandler: async () => ({ approved: true }), correlationId: origin,
        commandProof: acceptanceCapture(manager, session, origin, readGoalEdit(manager, current).goal!.id),
        history: [], onMessage: message => manager.addTurn(session.id, message), step, tools: createCoreToolRegistry(), hooks,
        maxSteps: 8, signal });
      return { events: run.events, input: run, sourceEntryId: () => origin,
        settled: () => { if (finish) completeAcceptedGoal(manager, manager.getSession(session.id)!, access); } };
    } });
  return runtime;
}
async function turn(step: StepFunction, hooks = new HookDispatcher(), finish = true) {
  await makeRuntime(step, hooks, finish).executePrompt(session.id, 'Implement the approved plan', { outputMode: 'print',
    promptMetadata: { source: 'plan-execution', planVersion: planVersion(readPlan(manager, session).plan!) } });
}
function script(commands: readonly string[] = [check], after?: () => void, reuseCallId = false): StepFunction {
  let index = 0;
  return async () => {
    index++;
    if (index === 1) return { text: '', toolCalls: [{ id: 'write', name: 'write', args: { path: 'accepted.txt', content: 'ok\n' } }], stopReason: 'stop' };
    if (index <= commands.length + 1) return { text: '', toolCalls: [{ id: reuseCallId ? 'reused-check' : `check-${index}`, name: 'bash', args: { command: commands[index - 2]! } }], stopReason: 'stop' };
    after?.(); return { text: 'Done', toolCalls: [], stopReason: 'stop' };
  };
}
it('completes actual edit/native criteria from a persisted approved prompt while the original session snapshot is stale', async () => {
  const version = await approved(); await turn(script());
  const goal = readGoalEdit(manager, session).goal!;
  expect(goal.phase).toBe('complete'); expect(goal.completion).toMatchObject({ source: 'verified-acceptance', planVersion: version });
  const evidence = decodeAcceptance(readGoalEdit(manager, session).state.goalAcceptance)!.checks;
  expect(Object.values(evidence)[0]?.native).toMatchObject({ status: 'completed', exitCode: 0, callId: 'check-2' });
  expect(Object.values(evidence)[0]?.native.invocationId).not.toBe('check-2');
  expect(JSON.stringify(goal.completion)).not.toContain('stdout');
  expect(session.turns).toEqual([]);
});
it('publishes completion after a real scheduler round reconciles and dispatches no later round', async () => {
  await approved(); writeGoal(manager, session, readGoalEdit(manager, session), { type: 'resume' });
  const runtime = makeRuntime(script()); let count = 0;
  const scheduler = new GoalScheduler({ store: manager, current: () => session, cancel: () => runtime.cancelCurrentRun(), report: () => {},
    afterRoundSettled: current => { completeAcceptedGoal(manager, current, access); },
    host: { ready: () => runtime.getCurrentRunController() === null, submit: async (prompt, promptMetadata) => {
      count++; await runtime.executePrompt(session.id, prompt, { outputMode: 'print', promptMetadata });
    } } });
  runtime.observeEvents(event => scheduler.observe(event), { renders: false });
  try {
    expect(scheduler.start()).toBeUndefined(); await scheduler.wait();
    expect(readGoalEdit(manager, session).goal).toMatchObject({ phase: 'complete', runOwner: null,
      scheduling: { pendingRound: false, drain: 'settled' }, completion: { source: 'verified-acceptance' } });
    expect(count).toBe(1);
  } finally { await scheduler.stop('user'); }
});
it('requires evidence even when model prose claims completion', async () => {
  await approved(); await turn(async () => ({ text: 'All completed; all checks passed.', toolCalls: [], stopReason: 'stop' }));
  expect(readGoalEdit(manager, session).goal?.phase).toBe('paused');
});
it('refuses stale target versions and later failed native checks', async () => {
  await approved(); await turn(script([check], () => fs.writeFileSync(path.join(root, 'accepted.txt'), 'changed\n')));
  expect(readGoalEdit(manager, session).goal?.phase).toBe('paused');
  await turn(script([check, `${check}; exit 1`]));
  expect(readGoalEdit(manager, session).goal?.phase).toBe('paused');
});

it('requires the committed file mode for an artifact implementation even when its bytes are unchanged', async () => {
  await plan('set Preserve the approved implementation version');
  await plan(`artifact accepted.txt ${textDigest('ok\n')} --implementation`);
  const version = planVersion(readPlan(manager, session).plan!);
  for (const action of ['approve', 'execute'] as const) await runPlanCommand('plan-review', [action, version],
    { cwd: root, projectRoot: root, sessionId: session.id }, manager, session, { beforeChange: async () => {}, setMode: () => {} });
  let committedMode = 0;
  await turn(script([], () => { const file = path.join(root, 'accepted.txt'); committedMode = fs.statSync(file).mode & 0o777; fs.chmodSync(file, 0o777); }));
  expect(fs.readFileSync(path.join(root, 'accepted.txt'), 'utf8')).toBe('ok\n');
  expect(readGoalEdit(manager, session).goal?.phase).toBe('paused');
  fs.chmodSync(path.join(root, 'accepted.txt'), committedMode);
  expect(completeAcceptedGoal(manager, manager.getSession(session.id)!, access)).toBe(true);
  expect(readGoalEdit(manager, session).goal?.completion?.source).toBe('verified-acceptance');
});
it('refuses reused actual model call IDs even when both native invocations succeed', async () => {
  await approved(); await turn(script([check, check], undefined, true));
  const events = manager.getTranscriptEvents(session.id);
  const proofs = events.filter(event => event.type === 'query-event' && event.event.type === 'execution.command')
    .map(event => event.type === 'query-event' && event.event.type === 'execution.command' ? event.event.proof : undefined);
  expect(proofs).toHaveLength(2); expect(new Set(proofs.map(proof => proof!.invocationId)).size).toBe(2);
  expect(proofs.every(proof => proof?.exitCode === 0 && proof.callId === 'reused-check')).toBe(true);
  expect(readGoalEdit(manager, session).goal?.phase).toBe('paused');
});
it('invalidates target evidence when the native command changes its covered target while it runs', async () => {
  const changing = 'cat -- "accepted.txt"; printf "changed\\n" > "accepted.txt"';
  await plan('set Verify an unchanged target');
  await runPlanCommand('plan', ['check', '--target', 'accepted.txt', '--', changing],
    { cwd: root, projectRoot: root, sessionId: session.id, rawCommandArgs: `check --target accepted.txt -- ${changing}` }, manager, session,
    { setMode: () => {}, beforeChange: async () => {} });
  const version = planVersion(readPlan(manager, session).plan!);
  for (const action of ['approve', 'execute'] as const) await runPlanCommand('plan-review', [action, version],
    { cwd: root, projectRoot: root, sessionId: session.id }, manager, session, { beforeChange: async () => {}, setMode: () => {} });
  await turn(script([changing]));
  const acceptance = decodeAcceptance(readGoalEdit(manager, session).state.goalAcceptance)!;
  expect(Object.values(acceptance.checks)[0]).toMatchObject({ known: false, native: { exitCode: 0 } });
  expect(readGoalEdit(manager, session).goal?.phase).toBe('paused');
});
it('rejects malformed persisted verified criteria and receipt evidence', async () => {
  await approved(); await turn(script());
  const completion = readGoalEdit(manager, session).goal!.completion!;
  expect(decodeVerifiedCompletion(completion)).toBeDefined();
  expect(decodeVerifiedCompletion({ ...completion, criteria: [true, false] })).toBeUndefined();
  if (completion.source !== 'verified-acceptance') throw new Error('Expected verified completion');
  expect(decodeVerifiedCompletion({ ...completion, evidence: completion.evidence.map(item => ({ ...item,
    operationReceipts: [{ operationId: 'forged', revision: -1, sequence: 1 }] })) })).toBeUndefined();
});
it('uses native exit status before result shaping and treats read-policy refusal as unknown', async () => {
  await approved(); manager.persistUserPromptBarrier(session.id, 'check', { source: 'plan-execution', planVersion: planVersion(readPlan(manager, session).plan!) });
  const current = manager.getSession(session.id)!;
  const observer = acceptanceCapture(manager, current, current.turns.at(-1)!.id!, readGoalEdit(manager, session).goal!.id);
  fs.writeFileSync(path.join(root, 'accepted.txt'), 'ok\n');
  const tool = createCoreToolRegistry().get('bash')!;
  await tool.execute({ command: check }, { taskId: 'fake', workspaceRoot: root, sessionId: session.id, commandProof: observer,
    assertSourceAccess: () => { throw new Error('denied'); } });
  expect(Object.values(decodeAcceptance(readGoalEdit(manager, session).state.goalAcceptance)!.checks)[0]?.known).toBe(false);
  expect(() => completeAcceptedGoal(manager, session, access)).toThrow();
});

it('does not adopt a fabricated approved prompt present only in an in-memory session snapshot', async () => {
  const version = await approved(); const source = 'fabricated-source';
  fs.writeFileSync(path.join(root, 'accepted.txt'), 'ok\n');
  const forged = { ...session, turns: [{ id: source, role: 'user' as const, content: 'Implement', timestamp: new Date().toISOString(),
    metadata: { source: 'plan-execution', planVersion: version } }] };
  const observer = acceptanceCapture(manager, forged, source, readGoalEdit(manager, session).goal!.id);
  await createCoreToolRegistry().get('bash')!.execute({ command: check }, { taskId: 'forged', workspaceRoot: root,
    sessionId: session.id, commandProof: observer, assertSourceAccess: access });
  expect(decodeAcceptance(readGoalEdit(manager, session).state.goalAcceptance)).toMatchObject({ checks: {}, pending: {} });
  expect(readGoalEdit(manager, session).goal?.phase).toBe('paused');
});
