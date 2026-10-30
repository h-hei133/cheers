import { afterEach, expect, it, vi } from 'vitest';
import { createTaskWaitToolDefinition } from './shell/background.js';
import type { BackgroundTask } from '../../workflow/jobs/local/model.js';
import type { ToolExecutionContext } from '../../tools/types.js';

const controllers: AbortController[] = [];
afterEach(() => {
  for (const controller of controllers.splice(0)) controller.abort();
  vi.clearAllTimers();
  vi.useRealTimers();
});

function fixture(onOutput = vi.fn()) {
  vi.useFakeTimers();
  const controller = new AbortController(); controllers.push(controller);
  const task: BackgroundTask = { id: 'selected', command: 'PRIVATE_COMMAND', cwd: '/tmp', pid: 1,
    startedAt: Date.now() - 120_000, state: 'paused', output: 'PRIVATE_OUTPUT' };
  const release = vi.fn(), stop = vi.fn(), get = vi.fn(() => task);
  let notify!: (task: BackgroundTask) => void;
  const context = { workspaceRoot: '/tmp', taskId: 'wait-call', onOutput, abortSignal: controller.signal,
    background: { get, stop, list: () => [task], onEnded: (callback: typeof notify) => { notify = callback; return release; } },
  } as unknown as ToolExecutionContext;
  return { controller, task, release, stop, get, context, onOutput,
    settle: () => notify({ ...task, state: 'exited', exitCode: 0, output: 'PUBLIC_FINAL' }) };
}

it('shows bounded wait time while retaining event-driven completion and the original task state', async () => {
  const f = fixture();
  let finished = false;
  const pending = createTaskWaitToolDefinition().execute({ taskId: f.task.id, timeoutSeconds: 30 }, f.context)
    .then(result => { finished = true; return result; });
  expect(f.onOutput).toHaveBeenCalledTimes(1);
  expect(f.onOutput).toHaveBeenLastCalledWith('Waiting for task completion: 0s elapsed (wait limit 30s).\n');
  await vi.advanceTimersByTimeAsync(10_000);
  expect(f.onOutput).toHaveBeenCalledTimes(3);
  expect(f.onOutput).toHaveBeenLastCalledWith('Waiting for task completion: 10s elapsed (wait limit 30s).\n');
  expect(f.get).toHaveBeenCalledTimes(2);
  expect(finished).toBe(false); expect(f.stop).not.toHaveBeenCalled();
  const progress = f.onOutput.mock.calls.flat().join('');
  expect(progress).not.toMatch(/PRIVATE_|still running|completed|percent|%/i);
  f.settle(); const result = await pending;
  expect(result.output).toContain('PUBLIC_FINAL'); expect(result.output).not.toContain('Waiting for task');
  expect(f.release).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
  await vi.advanceTimersByTimeAsync(20_000); expect(f.onOutput).toHaveBeenCalledTimes(3);
});

it.each(['cancel', 'timeout', 'settled'] as const)('retires every progress timer on %s', async ending => {
  const f = fixture();
  const pending = createTaskWaitToolDefinition().execute({ taskId: f.task.id, timeoutSeconds: 12 }, f.context);
  await vi.advanceTimersByTimeAsync(5000);
  expect(f.onOutput).toHaveBeenCalledTimes(2);
  if (ending === 'cancel') f.controller.abort();
  else if (ending === 'timeout') await vi.advanceTimersByTimeAsync(7000);
  else f.settle();
  const result = await pending, count = f.onOutput.mock.calls.length;
  expect(result.output).toContain(ending === 'cancel' ? 'Wait cancelled' : ending === 'timeout' ? 'Wait limit reached after 12s' : 'PUBLIC_FINAL');
  expect(f.release).toHaveBeenCalledTimes(1); expect(f.stop).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
  await vi.advanceTimersByTimeAsync(60_000); expect(f.onOutput).toHaveBeenCalledTimes(count);
});

it('creates no progress interval without an output observer', async () => {
  const f = fixture();
  const pending = createTaskWaitToolDefinition().execute({ taskId: f.task.id }, { ...f.context, onOutput: undefined });
  expect(vi.getTimerCount()).toBe(1);
  await vi.advanceTimersByTimeAsync(20_000); expect(f.get).toHaveBeenCalledTimes(2);
  f.settle(); await pending;
  expect(vi.getTimerCount()).toBe(0); expect(f.onOutput).not.toHaveBeenCalled();
});

it('does not show progress for an already completed task or pre-cancelled wait', async () => {
  const f = fixture();
  f.get.mockReturnValue({ ...f.task, state: 'exited', exitCode: 0 });
  await createTaskWaitToolDefinition().execute({ taskId: f.task.id }, f.context);
  f.get.mockReturnValue(f.task); f.controller.abort();
  const cancelled = await createTaskWaitToolDefinition().execute({ taskId: f.task.id }, f.context);
  expect(cancelled.output).toContain('Wait cancelled');
  expect(f.onOutput).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
});

it('rechecks completion before announcing that it will wait', async () => {
  const f = fixture();
  f.get.mockReturnValueOnce(f.task).mockReturnValue({ ...f.task, state: 'exited', exitCode: 0 });
  await createTaskWaitToolDefinition().execute({ taskId: f.task.id }, f.context);
  expect(f.onOutput).not.toHaveBeenCalled(); expect(f.release).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it('cleans up when the initial progress callback cancels the wait synchronously', async () => {
  const f = fixture(); f.onOutput.mockImplementation(() => f.controller.abort());
  const pending = createTaskWaitToolDefinition().execute({ taskId: f.task.id }, f.context);
  expect(f.onOutput).toHaveBeenCalledTimes(1);
  const result = await pending;
  expect(result.output).toContain('Wait cancelled'); expect(f.onOutput).toHaveBeenCalledTimes(1);
  expect(f.release).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
});

it.each([1, 2])('keeps waiting on the task if progress observer call %s fails', async failedCall => {
  const f = fixture(); let calls = 0;
  f.onOutput.mockImplementation(() => { if (++calls === failedCall) throw new Error('PRIVATE_OBSERVER_FAILURE'); });
  const pending = createTaskWaitToolDefinition().execute({ taskId: f.task.id }, f.context);
  await vi.advanceTimersByTimeAsync(15_000);
  expect(f.onOutput).toHaveBeenCalledTimes(failedCall);
  expect(f.release).not.toHaveBeenCalled(); expect(f.get).toHaveBeenCalledTimes(2);
  f.settle(); const result = await pending;
  expect(result.output).toContain('PUBLIC_FINAL'); expect(JSON.stringify(result)).not.toContain('PRIVATE_OBSERVER_FAILURE');
  expect(f.release).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
});

it('bounds progress to the clamped five-minute wait instead of extending the task deadline', async () => {
  const f = fixture();
  const pending = createTaskWaitToolDefinition().execute({ taskId: f.task.id, timeoutSeconds: 900 }, f.context);
  await vi.advanceTimersByTimeAsync(300_000); const result = await pending;
  expect(f.onOutput.mock.calls.length).toBeLessThanOrEqual(61);
  expect(f.onOutput.mock.calls.length).toBeGreaterThan(1);
  expect(result.output).toContain('Wait limit reached after 300s');
  expect(f.stop).not.toHaveBeenCalled(); expect(f.get).toHaveBeenCalledTimes(3);
  expect(vi.getTimerCount()).toBe(0);
});
