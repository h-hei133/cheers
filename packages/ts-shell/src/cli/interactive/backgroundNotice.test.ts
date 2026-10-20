import { expect, it } from 'vitest';
import { createBackgroundFollowUp } from './backgroundNotice.js';
import type { BackgroundTask } from '../../workflow/jobs/local/model.js';

const task = (id: string, state: BackgroundTask['state'] = 'exited', output = 'done'): BackgroundTask =>
  ({ id, command: 'build', cwd: '/tmp', pid: 1, startedAt: 0, state, output });

it('sends nothing unless the follow-up is enabled', () => {
  expect(createBackgroundFollowUp({ enabled: false })(task('a'))).toBeUndefined();
});

it('re-reads the enable policy for each completion', () => {
  let enabled = false;
  const followUp = createBackgroundFollowUp({ enabled: () => enabled });
  expect(followUp(task('a'))).toBeUndefined();
  enabled = true;
  expect(followUp(task('a'))).toContain('a');
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

it('redacts credentials before a follow-up crosses into model input', () => {
  const followUp = createBackgroundFollowUp({ enabled: true });
  const text = followUp(task('a', 'exited', 'token=fixture-secret\nsafe tail'))!;
  expect(text).not.toContain('fixture-secret');
  expect(text).toContain('safe tail');
});

it('redacts command flags and Basic auth in both command and output', () => {
  const followUp = createBackgroundFollowUp({ enabled: true });
  const text = followUp({
    ...task('a', 'exited', 'Authorization: Basic dXNlcjpwYXNz\nsafe tail'),
    command: 'curl --api-key fixture-api --password fixture-password -uuser:fixture-pass https://user:fixture-pass@example.test DB_PASSWORD=fixture-db',
  })!;
  expect(text).not.toContain('fixture-api');
  expect(text).not.toContain('fixture-password');
  expect(text).not.toContain('fixture-pass');
  expect(text).not.toContain('fixture-db');
  expect(text).not.toContain('dXNlcjpwYXNz');
  expect(text).toContain('safe tail');
});
