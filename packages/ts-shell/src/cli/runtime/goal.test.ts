import { afterEach, expect, it, vi } from 'vitest';
import { createAdvisorHarness, cleanupAdvisorHarnesses, advisorResult } from '../../test-utils/advisor.js';
import { createShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import { getRuntimeConfig } from '../../config/runtimeConfig.js';
import { readGoalEdit } from '../../planning/goal/store.js';
import { advisorFor } from './advisor.js';
import { goalCommandFor } from './goal.js';

afterEach(cleanupAdvisorHarnesses);

it.each(['done', 'clear', 'complete', 'drop'])('disarms the advisor on goal %s before a new goal can dispatch it', async action => {
  const setup = createAdvisorHarness(false, false); vi.stubEnv('OPENAI_API_KEY', 'SYNTHETIC_GOAL_ADVISOR');
  const context = createShellRuntimeContext({ cwd: setup.root, projectRoot: setup.root, originalCwd: setup.root, rootMode: 'direct',
    targetPathBase: setup.root, gitRoot: null, gitContext: { insideGit: false, root: null, branch: null, isClean: true },
    runtimeConfig: { ...getRuntimeConfig(setup.root), provider: 'openai',
      providerCredentials: { openai: { baseUrl: 'https://provider.example.invalid/v1' } } }, session: setup.session });
  const command = goalCommandFor(context, setup.manager);
  const commandContext = { cwd: setup.root, projectRoot: setup.root, sessionId: setup.session.id };
  await command(['set', 'First goal'], commandContext);
  const advisor = advisorFor(context, setup.manager, { renderLine: () => {} });
  advisor.configure({ target: 'openai/review-model', every: 1, timeoutMs: 500, mode: 'turn' }); advisor.setEnabled(true);
  const runner = vi.fn(async () => advisorResult());
  await advisor.capture(setup.boundary('First goal evidence'), runner, setup.signal);
  expect(runner).toHaveBeenCalledOnce(); runner.mockClear();
  await command([action], commandContext);
  expect(readGoalEdit(setup.manager, setup.session).goal?.phase).toBe(['done', 'complete'].includes(action) ? 'complete' : 'dropped');
  const epoch = advisor.view().epoch;
  await command([action, 'unexpected'], commandContext);
  await command([action], { ...commandContext, sessionId: 'retired' });
  expect(advisor.view().epoch).toBe(epoch);
  await command(['set', 'Second goal'], commandContext);
  await advisor.capture(setup.boundary('Second goal evidence'), runner, setup.signal);
  expect(runner).not.toHaveBeenCalled();
  expect(advisor.view().status).toBe('paused');
  advisor.setEnabled(true); await advisor.capture(setup.boundary('Explicitly enabled evidence'), runner, setup.signal);
  expect(runner).toHaveBeenCalledOnce();
});
