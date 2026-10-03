import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { installInteractiveSignalHandlers } from "./interactiveSignals.js";

describe("line session shutdown", () => {
  it.each([true, false])("closes once and checks retained state after termination (kept=%s)", kept => {
    const process = new EventEmitter();
    const input = new EventEmitter();
    const close = vi.fn(() => input.emit("close"));
    const terminate = vi.fn();
    const renderLine = vi.fn();
    const exit = vi.fn();
    const sessionExists = vi.fn(() => { expect(terminate).toHaveBeenCalledTimes(1); return kept; });
    installInteractiveSignalHandlers({
      process: process as never, readline: Object.assign(input, { close }) as never,
      sessionRuntime: { getCurrentRunController: () => undefined, terminate } as never,
      runtimeContext: { session: { id: "session-id" } } as never,
      sessionManager: { sessionExists }, renderer: { renderLine } as never, exit,
    });
    process.emit("SIGINT");
    input.emit("close");
    expect(terminate).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(exit.mock.calls).toEqual([[0]]);
    expect(renderLine.mock.calls).toEqual([[kept ? "\n  --resume session-id\n" : ""]]);
    expect(process.listenerCount("SIGINT")).toBe(0);
    expect(input.listenerCount("close")).toBe(0);
  });

  it("cancels an active turn without closing, then handles EOF once", () => {
    const process = new EventEmitter();
    const input = new EventEmitter();
    const controller = new AbortController();
    const terminate = vi.fn();
    const exit = vi.fn();
    const cancelCurrentRun = vi.fn(() => controller.abort());
    installInteractiveSignalHandlers({
      process: process as never, readline: Object.assign(input, { close: () => input.emit("close") }) as never,
      sessionRuntime: { getCurrentRunController: () => controller, cancelCurrentRun, terminate } as never,
      runtimeContext: { session: { id: "session-id" } } as never,
      sessionManager: { sessionExists: () => true }, renderer: { renderLine: vi.fn() } as never, exit,
    });
    process.emit("SIGINT");
    expect(controller.signal.aborted).toBe(true);
    expect(terminate).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
    input.emit("close");
    expect(terminate).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledTimes(1);
  });
});
