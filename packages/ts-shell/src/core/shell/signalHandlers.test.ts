import { describe, expect, it, vi } from "vitest";
import { handleShellClose, handleShellSigint } from "./signalHandlers.js";

describe("shell signal handlers", () => {
  it.each([true, false])("checks retention after termination before rendering resume (kept=%s)", kept => {
    const events: string[] = [];
    handleShellClose({
      sessionRuntime: { terminate: (id: string) => events.push(`terminate:${id}`) } as never,
      runtimeContext: { session: { id: "saved" } } as never,
      renderer: { renderLine: (line: string) => events.push(line) } as never,
      readline: { close: () => events.push("close") },
      sessionManager: { sessionExists: id => { events.push(`exists:${id}`); return kept; } },
      exit: code => events.push(`exit:${code}`),
    });
    expect(events).toEqual(["terminate:saved", "close", "exists:saved", kept ? "\n  --resume saved\n" : "", "exit:0"]);
  });

  it("supports embedded close without terminating the host", () => {
    const events: string[] = [];
    handleShellClose({
      sessionRuntime: { terminate: () => events.push("terminated") } as never,
      runtimeContext: { session: { id: "saved" } } as never,
      renderer: { renderLine: () => events.push("rendered") } as never,
      sessionManager: { sessionExists: () => false },
    });
    expect(events).toEqual(["terminated", "rendered"]);
  });

  it('preserves a preceding surface failure after successful session persistence', () => {
    const terminate = vi.fn();
    const exit = vi.fn();
    handleShellClose({ sessionRuntime: { terminate } as never, runtimeContext: { session: { id: 'saved' } } as never,
      renderer: { renderLine: () => {} } as never, sessionManager: { sessionExists: () => false }, cleanupFailed: true, exit });
    expect(terminate).toHaveBeenCalledOnce();
    expect(exit.mock.calls).toEqual([[1]]);
  });

  it("reports failed persistence safely and still exits unsuccessfully", () => {
    const failure = new Error("unreadable session with private fixture detail");
    const renderLine = vi.fn();
    const sessionExists = vi.fn(() => true);
    const exit = vi.fn();
    expect(() => handleShellClose({
      sessionRuntime: { terminate: () => { throw failure; } } as never,
      runtimeContext: { session: { id: "saved" } } as never,
      renderer: { renderLine } as never,
      sessionManager: { sessionExists }, exit,
    })).not.toThrow();
    expect(exit.mock.calls).toEqual([[1]]);
    expect(sessionExists).not.toHaveBeenCalled();
    expect(renderLine.mock.calls).toEqual([["Session state could not be saved; session close was not verified."]]);
  });

  it.each(["retention", "renderer"])("still exits if %s fails after persistence", stage => {
    const exit = vi.fn();
    const renderLine = vi.fn(() => { if (stage === "renderer") throw new Error("disconnected"); });
    expect(() => handleShellClose({
      sessionRuntime: { terminate: () => {} } as never,
      runtimeContext: { session: { id: "saved" } } as never,
      renderer: { renderLine } as never,
      sessionManager: { sessionExists: () => { if (stage === "retention") throw new Error("unreadable"); return true; } },
      exit,
    })).not.toThrow();
    expect(exit.mock.calls).toEqual([[1]]);
  });

  it("retains persistence failure for embedded callers without an exit hook", () => {
    const failure = new Error("write failed");
    expect(() => handleShellClose({
      sessionRuntime: { terminate: () => { throw failure; } } as never,
      runtimeContext: { session: { id: "saved" } } as never,
      renderer: { renderLine: () => {} } as never,
    })).toThrow(failure);
  });

  it("requests interruption without prompting before the turn closes", () => {
    const events: string[] = [];
    const controller = new AbortController();

    handleShellSigint({
      sessionRuntime: {
        getCurrentRunController: () => controller,
        cancelCurrentRun() {
          controller.abort();
          events.push("cancelled");
        },
        terminate() {
          events.push("terminated");
        },
      } as never,
      renderer: { renderLine: (line: string) => events.push(line) } as never,
      runtimeContext: { session: { id: "sess_1" } } as never,
      readline: {
        prompt: () => events.push("prompt"),
        close: () => events.push("close"),
      } as never,
      exit: (() => {
        throw new Error("should not exit");
      }) as never,
    });

    expect(controller.signal.aborted).toBe(true);
    expect(events).toContain("cancelled");
    expect(events).toContain("\nCancellation requested by user (Ctrl+C).");
    expect(events).not.toContain("prompt");
  });
});
