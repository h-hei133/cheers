import { describe, expect, it } from "vitest";
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
