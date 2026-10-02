import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { killAllTrackedProcesses, killProcessTree, processTree, trackChildPid, untrackChildPid } from "./processTree.js";
import { forceProcessTree, terminateProcessTree } from "./termination.js";

// These PIDs are registry keys only: no test sends an OS signal to a fabricated PID.
vi.mock("./termination.js", () => ({ terminateProcessTree: vi.fn(), forceProcessTree: vi.fn() }));
const terminate = vi.mocked(terminateProcessTree);
beforeEach(() => { terminate.mockResolvedValue(undefined); });
afterEach(async () => {
  terminate.mockResolvedValue(undefined);
  await killAllTrackedProcesses();
  vi.clearAllMocks();
});

it("tracks owned PIDs and excludes broadcast or invalid targets", () => {
  for (const pid of [0, 1, -1, 2.5, NaN, 2 ** 31]) trackChildPid(pid);
  expect(processTree.getTrackedCount()).toBe(0);
  trackChildPid(12345);
  trackChildPid(67890);
  expect(processTree.getTrackedCount()).toBe(2);
  untrackChildPid(12345);
  expect(processTree.getTrackedCount()).toBe(1);
});

it("deduplicates cleanup and waits even after the leader closes", async () => {
  let release!: () => void;
  terminate.mockReturnValueOnce(new Promise(resolve => { release = resolve; }));
  trackChildPid(12345);
  const first = killProcessTree(12345);
  expect(killProcessTree(12345)).toBe(first);
  untrackChildPid(12345);
  let finished = false;
  const all = killAllTrackedProcesses().then(() => { finished = true; });
  await Promise.resolve();
  expect(finished).toBe(false);
  expect(terminate).toHaveBeenCalledTimes(1);
  release();
  await all;
  expect(processTree.getTrackedCount()).toBe(0);
});

it("reports failures only after every cleanup settles and retains failed targets", async () => {
  let release!: () => void;
  terminate.mockRejectedValueOnce(new Error("EPERM"));
  terminate.mockReturnValueOnce(new Promise(resolve => { release = resolve; }));
  trackChildPid(12345);
  trackChildPid(67890);
  let finished = false;
  const all = killAllTrackedProcesses().catch(error => { finished = true; return error; });
  await Promise.resolve();
  expect(finished).toBe(false);
  release();
  expect(await all).toBeInstanceOf(AggregateError);
  expect(processTree.getTrackedCount()).toBe(1);
  await killAllTrackedProcesses();
  expect(processTree.getTrackedCount()).toBe(0);
});

it("awaits Windows pending cleanup but does not retry a root already observed closed", async () => {
  const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
  Object.defineProperty(process, "platform", { value: "win32" });
  try {
    let reject!: (error: Error) => void;
    terminate.mockReturnValueOnce(new Promise((_, fail) => { reject = fail; }));
    trackChildPid(12345);
    const pending = killProcessTree(12345).catch(error => error);
    untrackChildPid(12345);
    expect(processTree.getTrackedCount()).toBe(0);
    const all = killAllTrackedProcesses().catch(error => error);
    reject(new Error("taskkill failed"));
    await pending;
    expect(await all).toBeInstanceOf(AggregateError);
    await killAllTrackedProcesses();
    expect(terminate).toHaveBeenCalledTimes(1);
  } finally { Object.defineProperty(process, "platform", platform); }
});

it("does not launch a new Windows force request for a closed root during pending cleanup", async () => {
  const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
  Object.defineProperty(process, "platform", { value: "win32" });
  const once = vi.spyOn(process, "once").mockReturnValue(process);
  let release!: () => void;
  try {
    vi.resetModules();
    const { processTree: manager } = await import("./processTree.js");
    terminate.mockReturnValueOnce(new Promise(resolve => { release = resolve; }));
    manager.trackPid(12345);
    const pending = manager.killProcessTree(12345);
    manager.untrackPid(12345);
    const onExit = once.mock.calls.find(([event]) => event === "exit")![1];
    onExit(0);
    expect(forceProcessTree).not.toHaveBeenCalled();
    release();
    await pending;
  } finally {
    release?.();
    once.mockRestore();
    Object.defineProperty(process, "platform", platform);
  }
});
