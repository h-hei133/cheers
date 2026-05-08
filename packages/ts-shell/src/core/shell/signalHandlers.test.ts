import { describe, expect, it } from "vitest";
import { handleShellSigint } from "./signalHandlers.js";

describe("shell signal handlers", () => {
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
