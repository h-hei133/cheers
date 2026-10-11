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
