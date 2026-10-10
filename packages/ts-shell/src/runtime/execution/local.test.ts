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
    pid: 12345, stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn(), unref: vi.fn(),
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
  const result = executeLocally({ command: "test", args: [], cwd: ".", timeoutMs: 100, abortSignal: controller.signal, input: 'x'.repeat(65536) });
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
  expect(child.stdin.destroyed).toBe(true);
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

it('does not report exit zero as success when stdin delivery fails', async () => {
  const child = childProcess();
  const result = executeLocally({ command: 'test', args: [], cwd: '.', input: 'payload' });
  child.stdin.emit('error', Object.assign(new Error('I/O failure'), { code: 'EIO' }));
  child.emit('close', 0, null);
  expect(await result).toMatchObject({ status: 'failed', exitCode: 0, failureKind: 'execution_failure' });
});

it('keeps duplex stdin open for bounded writes until explicitly ended', async () => {
  const child = childProcess(); const received: Buffer[] = [];
  child.stdin.on('data', chunk => received.push(chunk));
  let input!: import('./types.js').ExecutionInput;
  const result = executeLocally({ command: 'test', args: [], cwd: '.', onStdin: port => { input = port; } });
  await input.write(Buffer.from('first')); await input.write(Buffer.from('second'));
  expect(child.stdin.writableEnded).toBe(false);
  await expect(input.write(Buffer.alloc(2 * 1024 * 1024 + 1))).rejects.toThrow(/queue limit/);
  input.end(); child.emit('close', 0, null);
  expect((await result).status).toBe('completed'); expect(Buffer.concat(received).toString()).toBe('firstsecond');
  await expect(input.write(Buffer.from('late'))).rejects.toThrow(/closed/);
});

it('awaits opt-in process-group cleanup after a natural leader exit', async () => {
  const child = childProcess(); let release!: () => void;
  vi.mocked(killProcessTree).mockReturnValue(new Promise(resolve => { release = resolve; }));
  let finished = false;
  const result = executeLocally({ command: 'test', args: [], cwd: '.', cleanupTreeOnExit: true }).then(value => { finished = true; return value; });
  child.emit('close', 0, null); await Promise.resolve();
  expect(killProcessTree).toHaveBeenCalledWith(child.pid); expect(finished).toBe(false);
  release(); expect((await result).status).toBe('completed');
});

it('preserves unverified cleanup when opt-in cleanup fails after a normal leader exit', async () => {
  const child = childProcess(); vi.mocked(killProcessTree).mockRejectedValue(new Error('synthetic failure'));
  const result = executeLocally({ command: 'test', args: [], cwd: '.', cleanupTreeOnExit: true });
  child.emit('close', 0, null);
  expect(await result).toMatchObject({ status: 'failed', terminationFailed: true });
  expect(untrackChildPid).not.toHaveBeenCalled();
});

it.each([false, true])('awaits the paused output consumer and preserves its failure=%s after native close', async rejectOutput => {
  vi.useRealTimers();
  const child = childProcess(); vi.mocked(killProcessTree).mockResolvedValue(undefined);
  let release!: () => void; let reject!: (error: Error) => void;
  const held = new Promise<void>((resolve, refuse) => { release = resolve; reject = refuse; });
  let settled = false;
  const result = executeLocally({ command: 'test', args: [], cwd: '.', onStdout: () => held })
    .then(value => { settled = true; return value; });
  child.stdout.write('retained');
  expect(child.stdout.isPaused()).toBe(true); expect(child.stderr.isPaused()).toBe(true);
  child.emit('close', 0, null); await new Promise(resolve => setImmediate(resolve)); expect(settled).toBe(false);
  if (rejectOutput) reject(new Error('Synthetic output persistence failure')); else release();
  expect(await result).toMatchObject({ status: rejectOutput ? 'failed' : 'completed', stdout: 'retained' });
  expect(child.stdout.isPaused()).toBe(false); expect(child.stderr.isPaused()).toBe(false);
});

it('observes only native started IDs and refuses an aborted dispatch before spawning', async () => {
  const child = childProcess(); const started = vi.fn();
  const result = executeLocally({ command: 'test', args: [], cwd: '.', onStarted: started });
  expect(started).toHaveBeenCalledWith(child.pid); child.emit('close', 0, null); await result;
  vi.mocked(spawn).mockClear(); const controller = new AbortController(); controller.abort();
  expect(await executeLocally({ command: 'test', args: [], cwd: '.', abortSignal: controller.signal, onStarted: started }))
    .toMatchObject({ status: 'cancelled', exitCode: null });
  expect(spawn).not.toHaveBeenCalled(); expect(started).toHaveBeenCalledTimes(1);
});
