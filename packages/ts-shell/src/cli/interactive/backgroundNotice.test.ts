import { expect, it } from 'vitest';
import { createBackgroundFollowUp } from './backgroundNotice.js';
import type { BackgroundTask } from '../../workflow/jobs/local/model.js';

const task = (id: string, state: BackgroundTask['state'] = 'exited', output = 'done'): BackgroundTask =>
  ({ id, command: 'build', cwd: '/tmp', pid: 1, startedAt: 0, state, output });

it('sends nothing unless the follow-up is enabled', () => {
  expect(createBackgroundFollowUp({ enabled: false })(task('a'))).toBeUndefined();
});

it('delivers a finished task once and ignores running tasks', () => {
  const followUp = createBackgroundFollowUp({ enabled: true });
  expect(followUp(task('a', 'running'))).toBeUndefined();
  expect(followUp(task('a'))).toContain('a');
  expect(followUp(task('a'))).toBeUndefined();
});

it('stops after the per-session budget and truncates long output', () => {
  const followUp = createBackgroundFollowUp({ enabled: true, budget: 1 });
  const long = followUp(task('a', 'exited', 'x'.repeat(5000)))!;
  expect(long.length).toBeLessThan(4200);
  expect(long).toContain('[output truncated]');
  expect(followUp(task('b'))).toBeUndefined();
});
