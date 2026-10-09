import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { SessionManager } from '../../session/SessionManager.js';
import type { Session } from '../../session/schema/sessionRecord.js';
import { readStateSnapshotRequired } from '../../session/store/sessionStateStore.js';
import * as files from '../../session/store/sessionFileStore.js';
import { writeProjectState, projectStatePath } from '../../core/state/projectState.js';
import type { CommandContext } from '../../core/commands/types.js';
import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import { runGoalCommand } from '../../core/commands/goalCommandRuntime.js';
import { goalCommandFor, goalObjectiveFor, prepareGoalSession } from '../../cli/runtime/goal.js';
import { environmentLine } from '../../turn/prompt.js';
import { decodeGoal } from './codec.js';
import { GoalWriteError, type GoalAction } from './model.js';
import { readGoalEdit, writeGoal, goalIsDetached, updateGoalScheduling } from './store.js';
import { runSessionGoalCommand } from './command.js';
import { goalObjective } from './projection.js';
import { transitionGoal } from './state.js';

let scratch: string;
let root: string;
let other: string;
let manager: SessionManager;
let session: Session;

beforeEach(() => {
  const temporary = path.resolve(process.cwd(), '../../.tmp');
  fs.mkdirSync(temporary, { recursive: true });
  scratch = fs.mkdtempSync(path.join(temporary, 'goal-test-'));
  root = path.join(scratch, 'project'); other = path.join(scratch, 'other');
  fs.mkdirSync(path.join(root, '.git'), { recursive: true });
  fs.mkdirSync(path.join(other, '.git'), { recursive: true });
  const home = path.join(scratch, 'home'); fs.mkdirSync(home);
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home); vi.stubEnv('GIT_CEILING_DIRECTORIES', scratch);
  manager = new SessionManager(); session = manager.createNew(root);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(scratch, { recursive: true, force: true }); });

function context(current: Session = session): CommandContext {
  return { cwd: current.projectRoot, projectRoot: current.projectRoot, sessionId: current.id };
}
function goal(current: Session = session) { return readGoalEdit(manager, current).goal; }
function command(args: string[], current: Session = session) { return runSessionGoalCommand(args, context(current), manager, current); }
function statePath(current: Session = session) { return path.join(manager.getSessionDirPath(current.id), 'state.json'); }

describe('session goals', () => {
  it('keeps explicit creation/pause/resume identities and manual completion/abandonment distinct', async () => {
    await command(['set', 'Build', 'authentication']);
    const created = goal()!;
    expect(created).toMatchObject({ schemaVersion: 1, revision: 1, phase: 'active', sessionId: session.id, runOwner: null });
    expect(created).not.toHaveProperty('tokenBudget');
    expect(goalObjective(readGoalEdit(manager, session))).toBe('Build authentication');
    expect((await command(['replacement'])).output).toContain('unfinished');
    expect(goal()).toEqual(created);
    await command(['pause']); expect(goal()).toMatchObject({ id: created.id, revision: 2, phase: 'paused' });
    expect(goalObjective(readGoalEdit(manager, session))).toBeUndefined();
    await command(['resume']); expect(goal()).toMatchObject({ id: created.id, revision: 3, phase: 'active' });
    await command(['done']);
    expect(goal()).toMatchObject({ id: created.id, phase: 'complete', completion: { source: 'user-declared', declaration: '/goal complete', timestamp: expect.any(String) } });
    const completed = goal();
    expect((await command(['resume'])).output).toContain('cannot resume'); expect(goal()).toEqual(completed);
    await command(['clear']); expect(goal()).toMatchObject({ id: created.id, phase: 'dropped' });
    expect(goal()).not.toHaveProperty('completion');
    await command(['set', 'Next objective']); expect(goal()!.id).not.toBe(created.id);
  });

  it('leaves legacy goals inert and imports only their description into a fresh paused goal', async () => {
    writeProjectState(root, { goal: { objective: 'Legacy standing task', phase: 'active', updatedAt: '2026-10-01T00:00:00.000Z' } });
    const before = fs.readFileSync(projectStatePath(root), 'utf8');
    expect(environmentLine(root)).not.toContain('Legacy standing task');
    expect((await command(['show'])).output).toContain('/goal import'); expect(goal()).toBeUndefined();
    await command(['import']);
    expect(goal()).toMatchObject({ phase: 'paused', origin: 'legacy-project', objective: 'Legacy standing task', pauseReason: 'legacy-import' });
    expect(goalObjective(readGoalEdit(manager, session))).toBeUndefined();
    await command(['resume']); expect(goal()!.phase).toBe('active');
    expect(fs.readFileSync(projectStatePath(root), 'utf8')).toBe(before);
    expect(goal(manager.createNew(root))).toBeUndefined();
    expect(goal(manager.createNew(other))).toBeUndefined();
    expect(goal(manager.fork(session.id))).toBeUndefined();
  });

  it('preserves the latest goal and other owner state across CAS mutations and normal lifecycle writes', async () => {
    await command(['set', 'Keep working']);
    const edit = readGoalEdit(manager, session);
    const current = readStateSnapshotRequired(statePath());
    const usage = { byModel: {}, turnsCount: 0, toolCallsCount: 0, lastBucketKey: '', lastUpdated: 1 };
    files.writeJsonFileAtomic(statePath(), { ...current, workingMemory: { owner: 'memory' }, harness: { retained: true }, usage });
    writeGoal(manager, session, edit, { type: 'pause' });
    expect(readStateSnapshotRequired(statePath())).toMatchObject({ workingMemory: { owner: 'memory' }, harness: { retained: true }, usage });
    expect(() => writeGoal(manager, session, edit, { type: 'resume' })).toThrow(GoalWriteError);
    await command(['resume']); const active = goal();
    manager.addTurn(session.id, { role: 'user', content: 'Manual turn' });
    manager.markRunStarted(session.id, 'Manual turn'); manager.markTurnActive(session.id); manager.saveCompleted(session.id);
    expect(goal()).toEqual(active); expect(goal()!.phase).toBe('active');
  });

  it('demotes a saved active goal on process activation and same-ID explicit session reentry', async () => {
    const runtime = { session, projectRoot: root, cwd: root } as ShellRuntimeContext;
    const handler = goalCommandFor(runtime, manager);
    await runGoalCommand(['set', 'Bound objective'], { ...context(), goalCommand: handler });
    const created = goal()!;
    manager.addTurn(session.id, { role: 'user', content: 'ordinary save' });
    expect(goalObjectiveFor(runtime, manager)).toBe('Bound objective');
    const restarted = { session: manager.getSession(session.id)!, projectRoot: root, cwd: root } as ShellRuntimeContext;
    prepareGoalSession(restarted, manager);
    expect(goal()).toMatchObject({ id: created.id, phase: 'paused', pauseReason: 'session-reentry' });
    expect(goalObjectiveFor(restarted, manager)).toBeUndefined();
    const restartedHandler = goalCommandFor(restarted, manager);
    await runGoalCommand(['resume'], { ...context(), goalCommand: restartedHandler });
    expect(goalObjectiveFor(restarted, manager)).toBe('Bound objective');
    restarted.session = manager.resume(session.id);
    expect(goalObjectiveFor(restarted, manager)).toBeUndefined();
    expect(goal()).toMatchObject({ id: created.id, phase: 'paused' });
  });

  it('rejects stale or missing session mutations without resurrection and keeps rebound goals detached until dropped', async () => {
    await command(['set', 'Old workspace']);
    const edit = readGoalEdit(manager, session); const original = goal()!;
    const rebound = manager.rebindSessionProjectRoot(session.id, other);
    expect(() => writeGoal(manager, session, edit, { type: 'pause' })).toThrow(GoalWriteError);
    const detached = readGoalEdit(manager, rebound);
    expect(goalIsDetached(detached)).toBe(true); expect(goalObjective(detached)).toBeUndefined();
    expect((await command(['show'], rebound)).output).toContain('detached');
    expect((await command(['resume'], rebound)).output).toContain('detached'); expect(goal(rebound)).toEqual(original);
    await command(['drop'], rebound); await command(['set', 'New workspace'], rebound);
    expect(goal(rebound)).toMatchObject({ phase: 'active', workspace: { path: other } });
    expect(goal(rebound)!.id).not.toBe(original.id);
    const missingEdit = readGoalEdit(manager, rebound); const directory = manager.getSessionDirPath(session.id);
    manager.deleteSession(session.id);
    expect(() => writeGoal(manager, rebound, missingEdit, { type: 'pause' })).toThrow(GoalWriteError);
    expect(fs.existsSync(directory)).toBe(false);
  });

  it('rejects replaced session directories and replaced workspace identities', async () => {
    await command(['set', 'Identity bound']); const edit = readGoalEdit(manager, session);
    const directory = manager.getSessionDirPath(session.id); const backup = `${directory}-backup`;
    fs.renameSync(directory, backup); fs.cpSync(backup, directory, { recursive: true });
    expect(() => writeGoal(manager, session, edit, { type: 'pause' })).toThrow(GoalWriteError);
    const replacementEdit = readGoalEdit(manager, session);
    fs.renameSync(root, `${root}-backup`); fs.mkdirSync(root);
    expect(() => writeGoal(manager, session, replacementEdit, { type: 'resume' })).toThrow(GoalWriteError);
    expect(goalIsDetached(readGoalEdit(manager, session))).toBe(true);
    expect(goalObjective(readGoalEdit(manager, session))).toBeUndefined();
  });

  it('keeps automatic or forged completion fail-closed and rejects unsupported persisted schemas', async () => {
    await command(['set', 'Requires evidence']); const edit = readGoalEdit(manager, session); const original = goal();
    for (const action of [{ type: 'complete' }, { type: 'complete', source: 'acceptance', evidence: ['passes'] },
      { type: 'complete', source: 'user-declared', verified: true }, { type: 'complete-automatically', evidence: { verified: true } }]) {
      expect(() => transitionGoal(edit.goal, edit.scope, action as GoalAction)).toThrow(GoalWriteError);
      expect(() => writeGoal(manager, session, edit, action as GoalAction)).toThrow(GoalWriteError);
      expect(goal()).toEqual(original);
    }
    expect(decodeGoal({ ...original, phase: 'complete', completion: { source: 'acceptance', verified: true } })).toBeUndefined();
    const current = readStateSnapshotRequired(statePath()); files.writeJsonFileAtomic(statePath(), { ...current, goal: { ...original, schemaVersion: 99 } });
    const before = fs.readFileSync(statePath(), 'utf8');
    expect((await command(['clear'])).output).toContain('not saved');
    expect(fs.readFileSync(statePath(), 'utf8')).toBe(before);
  });

  it('reports write/verification uncertainty and saved-lock failure without claiming an unchanged outcome', async () => {
    await command(['set', 'Durable objective']);
    const write = files.writeJsonFileAtomic;
    vi.spyOn(files, 'writeJsonFileAtomic').mockImplementationOnce((target, value) => { write(target, value); throw new Error('reported after publication'); });
    expect((await command(['pause'])).output).toContain('persistence is unverified'); expect(goal()!.phase).toBe('paused');
    vi.restoreAllMocks();
    vi.spyOn(files, 'withFileLock').mockImplementationOnce((_target, action) => { action(); throw new Error('lock release'); });
    expect((await command(['resume'])).output).toContain('state was saved'); expect(goal()!.phase).toBe('active');
  });

  it('decodes legacy control generation without writes and keeps it stable through ordinary scheduling saves', async () => {
    await command(['set', 'Legacy generation']); const original = goal()!;
    const { controlRevision: _generation, ...legacy } = original;
    const current = readStateSnapshotRequired(statePath()); files.writeJsonFileAtomic(statePath(), { ...current, goal: legacy });
    const before = fs.readFileSync(statePath()); expect(goal()!.controlRevision).toBe(original.revision); expect(fs.readFileSync(statePath())).toEqual(before);
    updateGoalScheduling(manager, session, readGoalEdit(manager, session), saved => ({ ...saved, revision: saved.revision + 1, updatedAt: new Date().toISOString() }));
    expect(goal()).toMatchObject({ revision: 2, controlRevision: 1 });
    updateGoalScheduling(manager, session, readGoalEdit(manager, session), saved => ({ ...saved, revision: saved.revision + 1, phase: 'paused', updatedAt: new Date().toISOString() }));
    expect(goal()).toMatchObject({ revision: 3, controlRevision: 2 });
    await command(['resume']); await command(['budget', '100']); expect(goal()).toMatchObject({ revision: 5, controlRevision: 4 });
    expect(decodeGoal({ ...goal(), controlRevision: 6 })).toBeUndefined(); expect(decodeGoal({ ...goal(), controlRevision: 0 })).toBeUndefined();
  });
});
