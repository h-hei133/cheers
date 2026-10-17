import { afterEach, expect, it, vi } from 'vitest';
import { createCoreToolRegistry } from '../registry.js';
import type { ExecutionService } from '../../../runtime/execution/types.js';
import type { BackgroundRunner } from '../../../workflow/jobs/local/model.js';
import type { ToolExecutionContext } from '../../../tools/types.js';

afterEach(() => vi.useRealTimers());

it('promotes a default-timeout foreground command without spawning again', async () => {
  vi.useFakeTimers();
  const detach = vi.fn();
  const kill = vi.fn(async () => {});
  const adopt = vi.fn(() => ({ id: 'task-1', command: 'echo hi', cwd: '/tmp', pid: 4321, startedAt: 0, state: 'running', output: '' }));
  const promote = vi.fn(() => true);
  const startCommand = vi.fn(() => ({
    handle: { pid: 4321, onOutput: () => () => {}, detach, kill, result: new Promise(() => {}) },
    result: new Promise(() => {}),
  }));
  const service = { startCommand, runCommand: vi.fn() } as unknown as ExecutionService;
  const background = { adopt, promote, start: vi.fn(), list: () => [], get: () => undefined, stop: async () => false, onEnded: () => () => {} } as unknown as BackgroundRunner;
  const bash = createCoreToolRegistry({ executionService: service }).get('bash')!;
  const context = { workspaceRoot: '/tmp', cwd: '/tmp', sessionId: 's', background, onOutput: () => {} } as unknown as ToolExecutionContext;
  const pending = bash.execute({ command: 'echo hi' }, context);
  await Promise.resolve();
  await vi.advanceTimersByTimeAsync(60_000);
  const result = await pending;
  expect(adopt).toHaveBeenCalledWith(expect.objectContaining({ pid: 4321 }), expect.objectContaining({ command: 'echo hi' }));
  expect(detach).toHaveBeenCalled();
  expect(promote).toHaveBeenCalledWith('task-1');
  expect(kill).not.toHaveBeenCalled();
  expect(result.success).toBe(true);
  expect(result.output).toContain('task-1');
});

it('stops the child when promotion is refused at capacity', async () => {
  vi.useFakeTimers();
  const detach = vi.fn();
  const kill = vi.fn(async () => {});
  const adopt = vi.fn(() => ({ id: 'task-2', command: 'echo hi', cwd: '/tmp', pid: 4322, startedAt: 0, state: 'running', output: '' }));
  const promote = vi.fn(() => false);
  const service = { startCommand: () => ({ handle: { pid: 4322, onOutput: () => () => {}, detach, kill, result: new Promise(() => {}) },
    result: new Promise(() => {}) }), runCommand: vi.fn() } as unknown as ExecutionService;
  const background = { adopt, promote, start: vi.fn(), list: () => [], get: () => undefined, stop: async () => false, onEnded: () => () => {} } as unknown as BackgroundRunner;
  const bash = createCoreToolRegistry({ executionService: service }).get('bash')!;
  const context = { workspaceRoot: '/tmp', cwd: '/tmp', sessionId: 's', background, onOutput: () => {} } as unknown as ToolExecutionContext;
  const pending = bash.execute({ command: 'echo hi' }, context);
  await Promise.resolve();
  await vi.advanceTimersByTimeAsync(60_000);
  const result = await pending;
  expect(kill).toHaveBeenCalled();
  expect(result.success).toBe(false);
});
