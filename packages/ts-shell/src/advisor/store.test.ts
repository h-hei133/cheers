import { afterEach, expect, it } from 'vitest';
import { createAdvisorHarness, cleanupAdvisorHarnesses, advisorResult } from '../test-utils/advisor.js';
import { readAdvisor, writeAdvisor } from './store.js';
import { AdvisorRuntime } from './runtime.js';
import { readGoalEdit, writeGoal } from '../planning/goal/store.js';

afterEach(cleanupAdvisorHarnesses);

it('ordinary session saves preserve advisor state while new and forked sessions start off without its payload', async () => {
  const setup = createAdvisorHarness(); await setup.runtime.capture(setup.boundary('durable'), async () => advisorResult(), setup.signal);
  const original = readAdvisor(setup.manager, setup.session).advisor;
  setup.manager.addTurn(setup.session.id, { role: 'assistant', content: 'Ordinary answer' }); setup.manager.saveCompleted(setup.session.id);
  expect(readAdvisor(setup.manager, setup.session).advisor).toEqual(original);
  const reentered = setup.manager.resume(setup.session.id); expect(readAdvisor(setup.manager, reentered).advisor).toEqual(original);
  for (const session of [setup.manager.createNew(setup.root), setup.manager.fork(setup.session.id)]) {
    const edit = readAdvisor(setup.manager, session); expect(edit.bound.state.advisor).toBeUndefined(); expect(edit.advisor).toMatchObject({ enabled: false, status: 'off', notes: [] });
  }
});

it('advisor-only empty sessions remain in reentry catalog and are not discarded', () => {
  const setup = createAdvisorHarness(false, false); const session = setup.manager.createNew(setup.root);
  const runtime = new AdvisorRuntime({ ...setup.host, current: () => session }); runtime.configure({ target: 'openai/review-model', every: 2, timeoutMs: 100, mode: 'turn' });
  expect(setup.manager.discardIfEmpty(session.id)).toBe(false);
  expect(setup.manager.listReentrySummaries().map(item => item.id)).toContain(session.id);
  expect(readAdvisor(setup.manager, session).advisor.config!.target).toBe('openai/review-model');
});

it('advisor CAS refuses stale advisor writes and preserves newer independent goal state', () => {
  const setup = createAdvisorHarness(); const original = readAdvisor(setup.manager, setup.session);
  writeGoal(setup.manager, setup.session, readGoalEdit(setup.manager, setup.session), { type: 'prepare', objective: 'Newer independent goal' });
  writeAdvisor(setup.manager, setup.session, original, { ...original.advisor, status: 'held' });
  expect(readGoalEdit(setup.manager, setup.session).goal!.objective).toBe('Newer independent goal');
  expect(() => writeAdvisor(setup.manager, setup.session, original, { ...original.advisor, status: 'off' })).toThrow();
  expect(readAdvisor(setup.manager, setup.session).advisor.status).toBe('held');
});
