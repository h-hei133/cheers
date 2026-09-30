import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { drainInput } from "./drain.js";

afterEach(() => vi.useRealTimers());

describe("terminal input drain", () => {
  it("waits for an idle interval after the last delayed report", async () => {
    vi.useFakeTimers();
    const input = new PassThrough();
    const done = vi.fn();
    const draining = drainInput(input).then(done);
    await vi.advanceTimersByTimeAsync(40);
    input.write("\x1b[13;1:3u");
    await vi.advanceTimersByTimeAsync(40);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10);
    await draining;
    expect(done).toHaveBeenCalledOnce();
    expect(input.listenerCount("data")).toBe(0);
    expect(input.listenerCount("close")).toBe(0);
  });

  it("bounds waiting even when reports never become idle", async () => {
    vi.useFakeTimers();
    const input = new PassThrough();
    const done = vi.fn();
    const draining = drainInput(input, 100, 50).then(done);
    for (let n = 0; n < 3; n++) {
      await vi.advanceTimersByTimeAsync(30);
      input.write("late report");
    }
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10);
    await draining;
    expect(input.listenerCount("data")).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("finishes immediately when the input closes", async () => {
    const input = new PassThrough();
    const draining = drainInput(input);
    input.destroy();
    await draining;
    expect(input.listenerCount("data")).toBe(0);
    await drainInput(input);
  });
});
