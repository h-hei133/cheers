import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { spawn } from "node:child_process";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { killProcessTree, untrackChildPid } from "../../core/shell/platform/processTree.js";
import { executeLocally } from "./local.js";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));
vi.mock("../../core/shell/platform/processTree.js", () => ({
  killProcessTree: vi.fn(), trackChildPid: vi.fn(), untrackChildPid: vi.fn(),
}));
function childProcess() {
  const child = Object.assign(new EventEmitter(), {
    pid: 12345, stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn(), unref: vi.fn(),
  });
  vi.mocked(spawn).mockReturnValue(child as never);
  return child;
}
beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); });
afterEach(() => { vi.useRealTimers(); });

it("retains timeout status when a TERM handler exits with zero", async () => {
  const child = childProcess();
  vi.mocked(killProcessTree).mockResolvedValue(undefined);
  const result = executeLocally({ command: "test", args: [], cwd: ".", timeoutMs: 100 });
  await vi.advanceTimersByTimeAsync(100);
  child.emit("close", 0, null);
  expect(await result).toMatchObject({ status: "timeout", exitCode: 0 });
});

it("waits for the group cleanup after the leader has closed", async () => {
  const child = childProcess();
  let release!: () => void;
  vi.mocked(killProcessTree).mockReturnValue(new Promise(resolve => { release = resolve; }));
  const controller = new AbortController();
  let finished = false;
  const result = executeLocally({ command: "test", args: [], cwd: ".", abortSignal: controller.signal })
    .then(value => { finished = true; return value; });
  controller.abort();
  child.emit("close", 0, null);
  await Promise.resolve();
  expect(finished).toBe(false);
  release();
  expect(await result).toMatchObject({ status: "cancelled" });
});

it.each(["timeout", "cancel"])("settles %s cleanup failure without a close event and retains output", async reason => {
  const child = childProcess();
  vi.mocked(killProcessTree).mockRejectedValue(new Error("permission denied"));
  const controller = new AbortController();
  const result = executeLocally({ command: "test", args: [], cwd: ".", timeoutMs: 100, abortSignal: controller.signal });
  child.stdout.write("work done before stop");
  child.stderr.write("existing diagnostic");
  if (reason === "cancel") controller.abort();
  else await vi.advanceTimersByTimeAsync(100);
  expect(await result).toMatchObject({ status: "failed", stdout: "work done before stop",
    stderr: expect.stringContaining("termination failed and remains unverified") });
  expect((await result).stderr).toContain("existing diagnostic");
  expect((await result).stderr).toContain(reason === "cancel" ? "Command cancelled" : "Command timed out");
  expect(untrackChildPid).not.toHaveBeenCalled();
  expect(child.unref).toHaveBeenCalled();
  expect(child.stdout.destroyed).toBe(true);
});

it("forgets a Windows root after a late close following failed termination", async () => {
  const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
  Object.defineProperty(process, "platform", { value: "win32" });
  try {
    const child = childProcess();
    vi.mocked(killProcessTree).mockRejectedValue(new Error("taskkill failed"));
    const controller = new AbortController();
    const result = executeLocally({ command: "test", args: [], cwd: ".", abortSignal: controller.signal });
    controller.abort();
    expect((await result).status).toBe("failed");
    expect(untrackChildPid).not.toHaveBeenCalled();
    child.emit("close", 0, null);
    await Promise.resolve();
    expect(untrackChildPid).toHaveBeenCalledWith(12345);
  } finally { Object.defineProperty(process, "platform", platform); }
});

it("can deliver stdout without retaining output or mixing stderr into the consumer", async () => {
  const child = childProcess();
  const chunks: Buffer[] = [];
  const result = executeLocally({ command: "test", args: [], cwd: ".", captureOutput: false,
    onStdout: chunk => chunks.push(chunk) });
  child.stdout.write("source data");
  child.stderr.write("diagnostic data");
  child.emit("close", 0, null);
  expect(await result).toMatchObject({ status: "completed", stdout: "", stderr: "" });
  expect(Buffer.concat(chunks).toString()).toBe("source data");
});
