import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { terminateProcessTree, terminateWindowsTree } from "./termination.js";

vi.mock("node:child_process", () => ({ spawn: vi.fn(), spawnSync: vi.fn() }));
const missing = () => Object.assign(new Error("gone"), { code: "ESRCH" });
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe.skipIf(process.platform === "win32")("POSIX termination", () => {
  it("gives TERM handlers a full grace period before KILL", async () => {
    const kill = vi.spyOn(process, "kill").mockReturnValue(true);
    const done = terminateProcessTree(12345);
    expect(kill).toHaveBeenCalledWith(-12345, "SIGTERM");
    await vi.advanceTimersByTimeAsync(999);
    expect(kill).not.toHaveBeenCalledWith(-12345, "SIGKILL");
    await vi.advanceTimersByTimeAsync(1);
    await done;
    expect(kill).toHaveBeenCalledWith(-12345, "SIGKILL");
  });

  it("does not kill again or fall back to a reused leader PID when the group disappears", async () => {
    const kill = vi.spyOn(process, "kill").mockImplementation((_pid, value) => {
      if (value === 0) throw missing();
      return true;
    });
    await terminateProcessTree(12345);
    expect(kill.mock.calls).toEqual([[-12345, "SIGTERM"], [-12345, 0]]);
  });

  it("never targets a reused direct PID when the owned group is absent", async () => {
    const kill = vi.spyOn(process, "kill").mockImplementation((pid, value) => {
      if (pid < 0 || value === 0) throw missing();
      return true;
    });
    await terminateProcessTree(12345);
    expect(kill.mock.calls).toEqual([[-12345, "SIGTERM"]]);
  });

  it("does not turn permission errors into exit evidence or direct-PID fallback", async () => {
    const kill = vi.spyOn(process, "kill").mockImplementation(() => {
      throw Object.assign(new Error("denied"), { code: "EPERM" });
    });
    await expect(terminateProcessTree(12345)).rejects.toThrow("denied");
    expect(kill).toHaveBeenCalledTimes(1);
  });

  it("never broadcasts a signal for PID 1 or invalid inputs", async () => {
    const kill = vi.spyOn(process, "kill").mockReturnValue(true);
    for (const pid of [1, 0, -1, 1.2, NaN, 2 ** 31]) await terminateProcessTree(pid);
    expect(kill).not.toHaveBeenCalled();
  });
});

describe("Windows cascade", () => {
  function launcher() {
    const child = Object.assign(new EventEmitter(), { kill: vi.fn(), unref: vi.fn() });
    vi.mocked(spawn).mockReturnValue(child as never);
    return child;
  }
  it("waits for launcher close and passes an argument vector", async () => {
    const child = launcher();
    let finished = false;
    const done = terminateWindowsTree(12345).then(() => { finished = true; });
    child.emit("spawn");
    await Promise.resolve();
    expect(finished).toBe(false);
    expect(spawn).toHaveBeenLastCalledWith(expect.stringMatching(/taskkill.exe$/),
      ["/F", "/T", "/PID", "12345"], { stdio: "ignore", windowsHide: true });
    child.emit("close", 0);
    await done;
  });
  it.each(["error", "nonzero", "signal"])("reports %s failures", async kind => {
    const child = launcher();
    const done = expect(terminateWindowsTree(12345)).rejects.toThrow();
    if (kind === "error") child.emit("error", new Error("launch failed"));
    else child.emit("close", kind === "nonzero" ? 1 : null);
    await done;
  });
  it("bounds the wait and cannot mistake timeout-triggered close for success", async () => {
    const child = launcher();
    child.kill.mockImplementation(() => child.emit("close", 0));
    const done = expect(terminateWindowsTree(12345)).rejects.toThrow("termination is unverified");
    await vi.advanceTimersByTimeAsync(5000);
    await done;
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
    expect(child.unref).toHaveBeenCalled();
  });
});
