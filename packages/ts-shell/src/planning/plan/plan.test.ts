import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SessionManager } from '../../session/SessionManager.js';
import type { Session } from '../../session/schema/sessionRecord.js';
import { routeSlashCommand } from '../../core/commands/slashRouter.js';
import { planningCommandFor } from '../../cli/runtime/planning.js';
import { readPlan } from './store.js';
import { planVersion } from './codec.js';
import { readGoalEdit, writeGoal } from '../goal/store.js';
import { readGuidance } from '../goal/guidance/store.js';
import { guidanceVersion } from '../goal/guidance/state.js';
import { SessionPublicationError } from '../../session/store/bound.js';
import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { ShellSessionRuntime } from '../../core/shell/sessionRuntime.js';
import { decodeRequestLedger } from '../../core/agent/request/codec.js';
import { runGuidanceCommand } from '../goal/guidance/command.js';
import { decodeGuidance } from '../goal/guidance/state.js';

let scratch: string; let root: string; let manager: SessionManager; let session: Session; let mode: 'build' | 'plan';
let runtime: ShellSessionRuntime; let context: ShellRuntimeContext;
beforeEach(() => {
  scratch = fs.mkdtempSync(path.resolve(process.cwd(), '../../.tmp/plan-test-')); root = path.join(scratch, 'project');
  const home = path.join(scratch, 'home'); fs.mkdirSync(path.join(root, '.git'), { recursive: true }); fs.mkdirSync(home);
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home); vi.stubEnv('GIT_CEILING_DIRECTORIES', scratch);
  manager = new SessionManager(); session = manager.createNew(root); mode = 'build';
  runtime = { getCurrentRunController: () => null, setAgentMode: (value: 'build' | 'plan') => { mode = value; } } as ShellSessionRuntime;
  context = { session, projectRoot: root, cwd: root } as ShellRuntimeContext;
});
afterEach(() => { vi.unstubAllEnvs(); fs.rmSync(scratch, { recursive: true, force: true }); });
function slash(text: string) { return routeSlashCommand(text, { cwd: root, projectRoot: root, sessionId: session.id,
  interactive: false, planningCommand: planningCommandFor(context, manager, runtime) }); }

it('preserves exact shell source, approval versions and independent permissions through the real slash path', async () => {
  await slash('/plan set Write the target\nThen check it.');
  expect(mode).toBe('plan');
  await slash('/plan check --target "a b.txt" --implementation -- printf "%s" "a b"');
  const draft = readPlan(manager, session).plan!;
  expect(draft.criteria[0]).toMatchObject({ command: 'printf "%s" "a b"', targets: ['a b.txt'], implementation: true });
  const old = planVersion(draft); await slash('/plan set A changed plan');
  expect((await slash(`/plan-review approve ${old}`))?.kind).toBe('local');
  expect(readPlan(manager, session).plan?.phase).toBe('draft');
  const exact = planVersion(readPlan(manager, session).plan!);
  await slash(`/plan-review approve ${exact}`); expect(mode).toBe('plan');
  const result = await slash(`/plan-review execute ${exact}`);
  expect(result).toMatchObject({ kind: 'prompt', promptMetadata: { source: 'plan-execution', planVersion: exact } });
  expect(mode).toBe('build');
  expect(readPlan(manager, session).plan?.approval?.version).toBe(exact);
});

it('leaves active goal and mode unchanged on malformed actions and stale versions', async () => {
  writeGoal(manager, session, readGoalEdit(manager, session), { type: 'set', objective: 'Existing goal' });
  const before = readGoalEdit(manager, session).goal;
  await slash('/plan-review execute stale'); await slash('/guided-goal answer invalid text');
  await slash('/plan artifact');
  expect(readGoalEdit(manager, session).goal).toEqual(before); expect(mode).toBe('build');
});

it('creates only a paused user goal after every explicit guided answer and exact approval', async () => {
  await slash('/guided-goal Build a parser'); const first = readGuidance(manager, session).draft!;
  await slash(`/guided-goal approve ${guidanceVersion(first)}`); expect(readGoalEdit(manager, session).goal).toBeUndefined();
  await slash('/guided-goal answer outcome no'); expect(readGuidance(manager, session).draft?.answers.outcome).toBeUndefined();
  await slash('/guided-goal answer outcome Handles quoted arguments');
  await slash('/guided-goal answer constraints Preserve the public API');
  const complete = readGuidance(manager, session).draft!;
  await slash(`/guided-goal approve ${guidanceVersion(first)}`); expect(readGoalEdit(manager, session).goal).toBeUndefined();
  await slash(`/guided-goal approve ${guidanceVersion(complete)}`);
  expect(readGoalEdit(manager, session).goal).toMatchObject({ phase: 'paused', origin: 'user', runOwner: null });
  expect(readGoalEdit(manager, session).goal?.tokenBudget).toBeUndefined();
  expect((await slash('/guided-goal cancel'))).toMatchObject({ output: expect.stringContaining('already created') });
});

it.each(['0', '12345', '9007199254740991', 'off'])('binds optional guided budget %s to exact approval and the shared paused-goal ledger', async budget => {
  await slash('/guided-goal Build a parser');
  await slash('/guided-goal answer outcome Handles quoted arguments');
  await slash('/guided-goal answer constraints Preserve the public API');
  const before = guidanceVersion(readGuidance(manager, session).draft!);
  await slash(`/guided-goal answer budget ${budget}`);
  const draft = readGuidance(manager, session).draft!;
  expect(draft.answers.budget).toBe(budget); expect(guidanceVersion(draft)).not.toBe(before);
  expect((await slash('/guided-goal show'))).toMatchObject({ output: expect.stringContaining(`budget: ${budget}`) });
  await slash(`/guided-goal approve ${before}`); expect(readGoalEdit(manager, session).goal).toBeUndefined();
  await slash(`/guided-goal approve ${guidanceVersion(draft)}`);
  const edit = readGoalEdit(manager, session); const goal = edit.goal!;
  expect(goal).toMatchObject({ phase: 'paused', origin: 'user', runOwner: null });
  expect(goal.tokenBudget).toBe(budget === 'off' ? undefined : Number(budget));
  expect(decodeRequestLedger(edit.requestLedger)?.scopes[goal.id]).toMatchObject({ historyUnknown: false, pending: {} });
  expect(session.turns).toEqual([]); expect(mode).toBe('build');
});

it('clears a staged guided cap with off and rejects malformed budgets before pausing or writing', async () => {
  await slash('/guided-goal Build a parser');
  await slash('/guided-goal answer budget 12'); await slash('/guided-goal answer budget off');
  expect(readGuidance(manager, session).draft?.answers.budget).toBe('off');
  writeGoal(manager, session, readGoalEdit(manager, session), { type: 'set', objective: 'Existing active goal' });
  const before = readGuidance(manager, session).draft; const goal = readGoalEdit(manager, session).goal;
  const beforeChange = vi.fn(async () => {});
  for (const value of ['-1', '01', '1.5', '+1', '1e3', '9007199254740992', 'OFF', '1 extra', 'no']) {
    await expect(runGuidanceCommand(['answer', 'budget', ...value.split(' ')],
      { cwd: root, projectRoot: root, sessionId: session.id, rawCommandArgs: `answer budget ${value}` }, manager, session,
      undefined, beforeChange)).rejects.toThrow();
  }
  expect(beforeChange).not.toHaveBeenCalled(); expect(readGuidance(manager, session).draft).toEqual(before);
  expect(readGoalEdit(manager, session).goal).toEqual(goal); expect(mode).toBe('build');
  expect(decodeGuidance({ ...before, answers: { ...before!.answers, budget: '9007199254740992' } })).toBeUndefined();
});

it('keeps command-only planning sessions across discard, catalog selection and reentry; forks start clean', async () => {
  await slash('/guided-goal staged goal'); expect(manager.getSession(session.id)?.turns).toEqual([]);
  expect(manager.discardIfEmpty(session.id)).toBe(false);
  expect(manager.listRecentSessions().some(item => item.id === session.id)).toBe(true);
  const pages = []; for await (const page of manager.catalog.list({ sessionId: session.id, projectRoot: root })) pages.push(page);
  expect(pages.at(-1)?.sessions.some(item => item.id === session.id && item.reentry === 'available')).toBe(true);
  manager.saveTerminated(session.id); expect(readGuidance(manager, manager.getSession(session.id)!).draft?.id).toBe(readGuidance(manager, session).draft?.id);
  const fork = manager.fork(session.id); expect(readGuidance(manager, fork).draft).toBeUndefined(); expect(readPlan(manager, fork).plan).toBeUndefined();
  const empty = manager.createNew(root); expect(manager.discardIfEmpty(empty.id)).toBe(true);
});
