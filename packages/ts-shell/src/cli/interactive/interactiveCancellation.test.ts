import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";

import { installInteractiveCancellation } from "./interactiveCancellation.js";

describe("interactive cancellation", () => {
  it("preserves double-Esc timing and cancellation messages", () => {
    const stdin = new EventEmitter() as NodeJS.ReadStream;
    stdin.isTTY = true;
    const lines: string[] = [];
    let cancelled = 0;
    let currentTime = 1000;

    installInteractiveCancellation({
      stdin,
      readline: {} as never,
      sessionRuntime: {
        getCurrentRunController: () => ({}),
        cancelCurrentRun: () => {
          cancelled += 1;
        },
      } as never,
      renderer: {
        renderLine: (line: string) => lines.push(line),
      } as never,
      now: () => currentTime,
      setTimeout: (() => undefined) as never,
    });

    stdin.emit("keypress", "", { name: "escape" });
    currentTime += 2999;
    stdin.emit("keypress", "", { name: "escape" });

    expect(cancelled).toBe(1);
    expect(lines).toEqual([
      "\nPress Esc again within 3 seconds to cancel the current response.",
      "\nCancellation requested (double Esc detected).",
    ]);
  });

  it("ignores Esc when no run controller is active", () => {
    const stdin = new EventEmitter() as NodeJS.ReadStream;
    stdin.isTTY = true;
    const lines: string[] = [];

    installInteractiveCancellation({
      stdin,
      readline: {} as never,
      sessionRuntime: {
        getCurrentRunController: () => null,
        cancelCurrentRun: () => {
          throw new Error("should not cancel");
        },
      } as never,
      renderer: {
        renderLine: (line: string) => lines.push(line),
      } as never,
    });

    stdin.emit("keypress", "", { name: "escape" });

    expect(lines).toEqual([]);
  });
});
