import { EventEmitter } from "node:events";
import { expect, it, vi } from "vitest";
import { killAllTrackedProcesses } from "../../core/shell/platform/processTree.js";
import { createCliShutdown } from "./shutdown.js";
vi.mock("../../core/shell/platform/processTree.js", () => ({ killAllTrackedProcesses: vi.fn() }));

it.each([false, true])("waits for process cleanup even if resource close fails (%s)", async fails => {
  let release!: () => void;
  vi.mocked(killAllTrackedProcesses).mockReturnValue(new Promise(resolve => { release = resolve; }));
  const events = new EventEmitter();
  const exit = vi.fn();
  const writeError = vi.fn();
  let done!: () => void;
  const exited = new Promise<void>(resolve => { done = resolve; });
  const shutdown = createCliShutdown({
    process: events as NodeJS.Process, writeError,
    close: () => { if (fails) throw new Error("resource failure"); return Promise.resolve(); },
    exit: code => { exit(code); done(); },
  });
  shutdown.exit();
  await Promise.resolve();
  await Promise.resolve();
  expect(exit).not.toHaveBeenCalled();
  release();
  await exited;
  expect(exit).toHaveBeenCalledWith(fails ? 1 : 0);
  expect(writeError).toHaveBeenCalledTimes(fails ? 1 : 0);
});

it("keeps cleanup failure visible at the CLI exit", async () => {
  vi.mocked(killAllTrackedProcesses).mockRejectedValue(new Error("EPERM"));
  const errors: string[] = [];
  const exited = new Promise<number>(resolve => {
    createCliShutdown({ process: new EventEmitter() as NodeJS.Process,
      close: async () => {}, writeError: message => { errors.push(message); }, exit: resolve }).exit();
  });
  expect(await exited).toBe(1);
  expect(errors).toEqual([expect.stringContaining("not verified")]);
});

it('blocks runtime reentry and exits unsuccessfully when a resource ignores cancellation', async () => {
  vi.mocked(killAllTrackedProcesses).mockResolvedValue(undefined);
  const close = vi.fn(() => new Promise<void>(() => {}));
  const errors: string[] = [];
  let finish!: (code: number) => void;
  const exited = new Promise<number>(resolve => { finish = resolve; });
  const shutdown = createCliShutdown({ process: new EventEmitter() as NodeJS.Process, close,
    writeError: message => errors.push(message), exit: finish, timeoutMs: 20 });
  await expect(shutdown.close()).rejects.toThrow('reentry is blocked');
  shutdown.exit();
  expect(await exited).toBe(1);
  expect(close).toHaveBeenCalledTimes(1);
  expect(errors).toEqual([expect.stringContaining('not verified')]);
});

it.each([['SIGTERM', 143], ['SIGHUP', 129]] as const)('runs %s persistence once before resource cancellation', async (signal, code) => {
  vi.mocked(killAllTrackedProcesses).mockResolvedValue(undefined);
  const events = new EventEmitter(); const order: string[] = [];
  const persist = vi.fn((received: string) => { order.push(received); });
  const exited = new Promise<number>(resolve => {
    createCliShutdown({ process: events as NodeJS.Process, onSignal: persist,
      close: async () => { order.push('close'); }, writeError: vi.fn(), exit: resolve });
  });
  events.emit(signal); events.emit(signal === 'SIGTERM' ? 'SIGHUP' : 'SIGTERM');
  expect(await exited).toBe(code);
  expect(persist.mock.calls).toEqual([[signal]]);
  expect(order).toEqual([signal, 'close']);
  expect(events.listenerCount(signal)).toBe(0);
});

it.each(['close', 'exit'] as const)('does not run signal persistence for ordinary %s', async action => {
  vi.mocked(killAllTrackedProcesses).mockResolvedValue(undefined);
  const persist = vi.fn(); let done!: () => void;
  const exited = new Promise<void>(resolve => { done = resolve; });
  const shutdown = createCliShutdown({ process: new EventEmitter() as NodeJS.Process, onSignal: persist,
    close: async () => {}, writeError: vi.fn(), exit: done });
  if (action === 'close') await shutdown.close();
  else { shutdown.exit(); await exited; }
  expect(persist).not.toHaveBeenCalled();
});

it.each(['reject', 'hang'] as const)('bounds signal persistence that will %s and reports safely', async kind => {
  vi.mocked(killAllTrackedProcesses).mockResolvedValue(undefined);
  const processEvents = new EventEmitter(); const errors: string[] = []; const close = vi.fn(async () => {});
  const onSignal = vi.fn(() => kind === 'reject' ? Promise.reject(new Error('private fixture failure')) : new Promise<void>(() => {}));
  const exited = new Promise<number>(resolve => {
    createCliShutdown({ process: processEvents as NodeJS.Process, close, onSignal, timeoutMs: 20,
      exit: resolve, writeError: message => errors.push(message) });
  });
  processEvents.emit('SIGTERM');
  expect(await exited).toBe(1);
  expect(onSignal).toHaveBeenCalledOnce(); expect(close).toHaveBeenCalledOnce();
  expect(errors).toEqual(['Resource cleanup failed; process exit was not verified.']);
});

it('joins a signal received during ordinary close into its original cleanup budget', async () => {
  vi.mocked(killAllTrackedProcesses).mockResolvedValue(undefined);
  const processEvents = new EventEmitter(); let release!: () => void;
  const close = vi.fn(() => new Promise<void>(resolve => { release = resolve; }));
  const persist = vi.fn(async () => { throw new Error('private fixture'); });
  let finish!: (code: number) => void; const exited = new Promise<number>(resolve => { finish = resolve; });
  const shutdown = createCliShutdown({ process: processEvents as NodeJS.Process, close, onSignal: persist,
    exit: finish, writeError: vi.fn(), timeoutMs: 100 });
  const pending = shutdown.close();
  await Promise.resolve(); processEvents.emit('SIGHUP'); release();
  await expect(pending).rejects.toThrow('private fixture');
  expect(await exited).toBe(1);
  expect(close).toHaveBeenCalledOnce(); expect(persist.mock.calls).toEqual([['SIGHUP']]);
});
