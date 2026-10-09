import { afterEach, expect, it, vi } from 'vitest';
import { createAdvisorHarness, cleanupAdvisorHarnesses, advisorResult } from '../test-utils/advisor.js';
import type { SubagentRunInput, SubagentRunResult } from '../core/subagents/runner.js';
import { AdvisorRuntime } from './runtime.js';
import { readAdvisor } from './store.js';
import { writeGoal, readGoalEdit, updateGoalScheduling } from '../planning/goal/store.js';
import * as files from '../session/store/sessionFileStore.js';

afterEach(cleanupAdvisorHarnesses);

it('bounded timeout retains an abort-ignoring execution, prevents a second review and drains the original session without late notes', async () => {
  const setup = createAdvisorHarness({ target: 'openai/review-model', every: 1, timeoutMs: 100, mode: 'turn' });
  let finish!: (value: SubagentRunResult) => void; let started!: () => void; const ready = new Promise<void>(resolve => { started = resolve; });
  const runner = vi.fn(() => { started(); return new Promise<SubagentRunResult>(resolve => { finish = resolve; }); });
  const capture = setup.runtime.capture(setup.boundary('timeout'), runner, setup.signal); await ready;
  const began = Date.now(); await capture; expect(Date.now() - began).toBeLessThan(1000);
  expect(setup.runtime.view()).toMatchObject({ status: 'timeout', notes: [] }); expect(setup.runtime.view().pending).toBeDefined();
  setup.runtime.setEnabled(true); expect(setup.runtime.view().pending).toBeDefined();
  await expect(setup.runtime.reviewLatest()).rejects.toThrow(/not settled/); expect(runner).toHaveBeenCalledOnce();
  const other = setup.manager.createNew(setup.root); setup.setCurrent(other); finish(advisorResult('LATE_ADVICE_MUST_NOT_PUBLISH'));
  for (let count = 0; count < 10; count++) await Promise.resolve();
  expect(readAdvisor(setup.manager, setup.session).advisor.pending).toBeUndefined();
  expect(readAdvisor(setup.manager, setup.session).advisor.notes).toHaveLength(0); expect(readAdvisor(setup.manager, other).advisor.notes).toHaveLength(0);
});

it('one durable pending claim rejects concurrent explicit review without a second runner', async () => {
  const setup = createAdvisorHarness({ target: 'openai/review-model', every: 100, timeoutMs: 500, mode: 'turn' });
  let finish!: (value: SubagentRunResult) => void; let started!: () => void; const ready = new Promise<void>(resolve => { started = resolve; });
  const runner = vi.fn(() => { started(); return new Promise<SubagentRunResult>(resolve => { finish = resolve; }); });
  await setup.runtime.capture(setup.boundary('held'), runner, setup.signal);
  const first = setup.runtime.reviewLatest(); await ready;
  await expect(setup.runtime.reviewLatest()).rejects.toThrow(/not settled/); expect(runner).toHaveBeenCalledOnce();
  finish(advisorResult()); await first; expect(setup.runtime.view().pending).toBeUndefined(); expect(setup.runtime.view().notes).toHaveLength(1);
});

it.each(['off', 'configure'] as const)('cross-host %s immediately fences dispatch and publication even for an abort-ignoring runner', async action => {
  const setup = createAdvisorHarness(); let input!: SubagentRunInput; let finish!: (value: SubagentRunResult) => void; let started!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  const runner = vi.fn((value: SubagentRunInput) => { input = value; started(); return new Promise<SubagentRunResult>(resolve => { finish = resolve; }); });
  const capture = setup.runtime.capture(setup.boundary('live'), runner, setup.signal); await ready;
  const remote = new AdvisorRuntime(setup.host);
  if (action === 'off') remote.setEnabled(false); else remote.configure({ target: 'openai/other', every: 1, timeoutMs: 500, mode: 'turn' });
  expect(input.admission?.()).toContain('changed');
  finish(advisorResult('obsolete review')); await capture;
  expect(readAdvisor(setup.manager, setup.session).advisor.notes).toHaveLength(0); expect(readAdvisor(setup.manager, setup.session).advisor.pending).toBeUndefined();
});

it('a durable goal pause/resume cycle cannot reauthorize old review while normal scheduler saves retain its generation', async () => {
  const setup = createAdvisorHarness(); writeGoal(setup.manager, setup.session, readGoalEdit(setup.manager, setup.session), { type: 'set', objective: 'Review active work' });
  let input!: SubagentRunInput; let finish!: (value: SubagentRunResult) => void; let started!: () => void; const ready = new Promise<void>(resolve => { started = resolve; });
  const runner = vi.fn((value: SubagentRunInput) => { input = value; started(); return new Promise<SubagentRunResult>(resolve => { finish = resolve; }); });
  const capture = setup.runtime.capture(setup.boundary('before control cycle'), runner, setup.signal); await ready;
  const initial = readGoalEdit(setup.manager, setup.session).goal!;
  updateGoalScheduling(setup.manager, setup.session, readGoalEdit(setup.manager, setup.session), goal => ({ ...goal, revision: goal.revision + 1, updatedAt: new Date().toISOString() }));
  expect(readGoalEdit(setup.manager, setup.session).goal!.controlRevision).toBe(initial.controlRevision); expect(input.admission?.()).toBeUndefined();
  writeGoal(setup.manager, setup.session, readGoalEdit(setup.manager, setup.session), { type: 'pause' });
  writeGoal(setup.manager, setup.session, readGoalEdit(setup.manager, setup.session), { type: 'resume' });
  expect(input.admission?.()).toContain('changed'); finish(advisorResult('obsolete after pause/resume')); await capture;
  expect(setup.runtime.view().notes).toHaveLength(0); expect(setup.runtime.view().pending).toBeUndefined();
});

it.each(['empty', 'failed', 'thrown', 'unavailable'] as const)('reports %s review safely without credentials, provider bodies or success notes', async kind => {
  const setup = createAdvisorHarness(); const secret = 'sk-synthetic-body-NEVER-DISPLAY';
  const runtime = kind === 'unavailable' ? new AdvisorRuntime({ ...setup.host, validateTarget: () => { throw new Error(secret); } }) : setup.runtime;
  if (runtime !== setup.runtime) runtime.setEnabled(true);
  const runner = vi.fn(async () => {
    if (kind === 'thrown') throw new Error(`HTTP response body ${secret}`);
    return kind === 'failed' ? { ...advisorResult(secret), failed: true, failure: `HTTP response body ${secret}` } : advisorResult(kind === 'empty' ? '   ' : 'advice');
  });
  await runtime.capture(setup.boundary('safe snapshot'), runner, setup.signal);
  expect(runtime.view().notes).toHaveLength(0); expect(runtime.view().pending).toBeUndefined();
  expect(setup.reports.join('\n')).not.toContain(secret); expect(runtime.view().status).toBe(kind === 'unavailable' ? 'unavailable' : 'error');
  if (kind === 'unavailable') expect(runner).not.toHaveBeenCalled();
});

it('a changed durable transcript frontier fences an older pending checkpoint review', async () => {
  const setup = createAdvisorHarness(); let input!: SubagentRunInput; let finish!: (value: SubagentRunResult) => void; let started!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  const runner = vi.fn((value: SubagentRunInput) => { input = value; started(); return new Promise<SubagentRunResult>(resolve => { finish = resolve; }); });
  const capture = setup.runtime.capture(setup.boundary('older snapshot'), runner, setup.signal); await ready;
  setup.manager.persistUserPromptBarrier(setup.session.id, 'Newer independent prompt'); expect(input.admission?.()).toContain('changed');
  finish(advisorResult('stale after new prompt')); await capture; expect(setup.runtime.view().notes).toHaveLength(0);
});

it.each(['goal-control', 'transcript'] as const)('rechecks %s under the publication lock and drains a stale result without a note', async cause => {
  const setup = createAdvisorHarness(); writeGoal(setup.manager, setup.session, readGoalEdit(setup.manager, setup.session), { type: 'set', objective: 'Locked publication' });
  let finish!: (value: SubagentRunResult) => void; let started!: () => void; const ready = new Promise<void>(resolve => { started = resolve; });
  const runner = vi.fn(() => { started(); return new Promise<SubagentRunResult>(resolve => { finish = resolve; }); });
  const capture = setup.runtime.capture(setup.boundary('before lock race'), runner, setup.signal); await ready;
  const lock = files.withFileLock;
  vi.spyOn(files, 'withFileLock').mockImplementationOnce((target, action) => {
    if (cause === 'goal-control') { writeGoal(setup.manager, setup.session, readGoalEdit(setup.manager, setup.session), { type: 'pause' }); writeGoal(setup.manager, setup.session, readGoalEdit(setup.manager, setup.session), { type: 'resume' }); }
    else setup.manager.persistUserPromptBarrier(setup.session.id, 'Changed at note publication');
    return lock(target, action);
  });
  finish(advisorResult('must never publish')); await capture;
  expect(setup.runtime.view().notes).toHaveLength(0); expect(setup.runtime.view().pending).toBeUndefined(); expect(setup.runtime.view().status).toBe('stale');
  expect(setup.reports.join('\n')).toContain('stale before publication');
});
