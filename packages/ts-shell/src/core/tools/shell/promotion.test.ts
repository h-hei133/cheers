import { afterEach, expect, it, vi } from 'vitest';
import { createCoreToolRegistry } from '../registry.js';
import type { ExecutionService } from '../../../runtime/execution/types.js';
import type { BackgroundRunner } from '../../../runtime/execution/background/model.js';
import { FOREGROUND_PROMOTION_DELAY_MS } from '../../../runtime/execution/commandTimeout.js';
import type { ToolExecutionContext } from '../../../tools/types.js';

afterEach(() => vi.useRealTimers());

it('keeps a default foreground command in front for five seconds before promotion', async () => {
  vi.useFakeTimers();
  const detach = vi.fn();
  const kill = vi.fn(async () => {});
  const adopt = vi.fn(() => ({ id: 'task-1', command: 'echo hi', cwd: '/tmp', pid: 4321, startedAt: 0, state: 'running', output: '' }));
  const promote = vi.fn(() => 'promoted' as const);
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
  await vi.advanceTimersByTimeAsync(FOREGROUND_PROMOTION_DELAY_MS - 1);
  expect(promote).not.toHaveBeenCalled();
  expect(detach).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  const result = await pending;
  expect(startCommand).toHaveBeenCalledWith(expect.objectContaining({ timeoutMs: 300_000 }));
  expect(adopt).toHaveBeenCalledWith(expect.objectContaining({ pid: 4321 }), expect.objectContaining({ command: 'echo hi' }),
    expect.objectContaining({ append: expect.any(Function), finish: expect.any(Function), dispose: expect.any(Function) }));
  expect(detach).toHaveBeenCalled();
  expect(promote).toHaveBeenCalledWith('task-1');
  expect(kill).not.toHaveBeenCalled();
  expect(result.success).toBe(true);
  expect(result.output).toContain('after 5 seconds');
  expect(result.output).toContain('task-1');
});

it('reports the result when the command settles before promotion', async () => {
  vi.useFakeTimers();
  const detach = vi.fn();
  const promote = vi.fn(() => 'settled' as const);
  const adopt = vi.fn(() => ({ id: 'task-3', command: 'echo hi', cwd: '/tmp', pid: 4323, startedAt: 0, state: 'running', output: '' }));
  const settled = new Promise(resolve => setTimeout(() => resolve({ status: 'completed', exitCode: 0, stdout: 'late', stderr: '' }),
    FOREGROUND_PROMOTION_DELAY_MS - 1));
  const service = { startCommand: () => ({ handle: { pid: 4323, onOutput: () => () => {}, detach, kill: async () => {}, result: settled },
    result: settled }), runCommand: vi.fn() } as unknown as ExecutionService;
  const background = { adopt, promote, start: vi.fn(), list: () => [], get: () => undefined, stop: async () => false, onEnded: () => () => {} } as unknown as BackgroundRunner;
  const bash = createCoreToolRegistry({ executionService: service }).get('bash')!;
  const context = { workspaceRoot: '/tmp', cwd: '/tmp', sessionId: 's', background, onOutput: () => {} } as unknown as ToolExecutionContext;
  const pending = bash.execute({ command: 'echo hi' }, context);
  await Promise.resolve();
  await vi.advanceTimersByTimeAsync(FOREGROUND_PROMOTION_DELAY_MS - 1);
  expect(promote).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  const result = await pending;
  expect(promote).not.toHaveBeenCalled();
  expect(result.success).toBe(true);
  expect(result.output).toContain('late');
});

it('keeps an explicitly timed command in the foreground', async () => {
  const runCommand = vi.fn(async () => ({ status: 'completed' as const, exitCode: 0,
    stdout: 'settled', stderr: '' }));
  const startCommand = vi.fn();
  const adopt = vi.fn();
  const promote = vi.fn();
  const service = { runCommand, startCommand } as unknown as ExecutionService;
  const background = { adopt, promote, start: vi.fn(), list: () => [], get: () => undefined, stop: async () => false,
    onEnded: () => () => {} } as unknown as BackgroundRunner;
  const bash = createCoreToolRegistry({ executionService: service }).get('bash')!;
  const context = { workspaceRoot: '/tmp', cwd: '/tmp', sessionId: 's', background, onOutput: () => {} } as unknown as ToolExecutionContext;

  const result = await bash.execute({ command: 'echo hi', timeout: 12 }, context);

  expect(runCommand).toHaveBeenCalledWith(expect.objectContaining({ timeoutMs: 12_000 }));
  expect(startCommand).not.toHaveBeenCalled();
  expect(adopt).not.toHaveBeenCalled();
  expect(promote).not.toHaveBeenCalled();
  expect(result.success).toBe(true);
  expect(result.output).toContain('settled');
});

it('returns as soon as a new message promotes the command', async () => {
  const detach = vi.fn();
  const promote = vi.fn(() => 'promoted' as const);
  const adopt = vi.fn(() => ({ id: 'task-4', command: 'echo hi', cwd: '/tmp', pid: 4324, startedAt: 0, state: 'running', output: '' }));
  const service = { startCommand: () => ({ handle: { pid: 4324, onOutput: () => () => {}, detach, kill: async () => {}, result: new Promise(() => {}) },
    result: new Promise(() => {}) }), runCommand: vi.fn() } as unknown as ExecutionService;
  const background = { adopt, promote, whenPromoted: () => Promise.resolve('promoted' as const), start: vi.fn(), list: () => [], get: () => undefined,
    stop: async () => false, onEnded: () => () => {} } as unknown as BackgroundRunner;
  const bash = createCoreToolRegistry({ executionService: service }).get('bash')!;
  const context = { workspaceRoot: '/tmp', cwd: '/tmp', sessionId: 's', background, onOutput: () => {} } as unknown as ToolExecutionContext;
  const result = await bash.execute({ command: 'echo hi' }, context);
  expect(detach).toHaveBeenCalled();
  expect(result.success).toBe(true);
  expect(result.output).toContain('task-4');
});

it('stops the child when promotion is refused at capacity', async () => {
  vi.useFakeTimers();
  const detach = vi.fn();
  const kill = vi.fn(async () => {});
  const adopt = vi.fn(() => ({ id: 'task-2', command: 'echo hi', cwd: '/tmp', pid: 4322, startedAt: 0, state: 'running', output: '' }));
  const promote = vi.fn(() => 'refused' as const);
  const service = { startCommand: () => ({ handle: { pid: 4322, onOutput: () => () => {}, detach, kill, result: new Promise(() => {}) },
    result: new Promise(() => {}) }), runCommand: vi.fn() } as unknown as ExecutionService;
  const background = { adopt, promote, start: vi.fn(), list: () => [], get: () => undefined, stop: async () => false, onEnded: () => () => {} } as unknown as BackgroundRunner;
  const bash = createCoreToolRegistry({ executionService: service }).get('bash')!;
  const context = { workspaceRoot: '/tmp', cwd: '/tmp', sessionId: 's', background, onOutput: () => {} } as unknown as ToolExecutionContext;
  const pending = bash.execute({ command: 'echo hi' }, context);
  await Promise.resolve();
  await vi.advanceTimersByTimeAsync(FOREGROUND_PROMOTION_DELAY_MS);
  const result = await pending;
  expect(kill).toHaveBeenCalled();
  expect(result.success).toBe(false);
});
