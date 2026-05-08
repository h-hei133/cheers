import { describe, expect, it } from "vitest";
import {
  formatExecutionStartedLine,
  formatTurnEndBoundary,
  formatTurnStartBoundary,
  renderTurnResultFallback,
} from "./turnBoundarySurface.js";

describe("turn boundary surface", () => {
  it("formats normal, resumed, and continued turn boundaries", () => {
    expect(formatTurnStartBoundary({ turnNumber: 1, origin: "normal" })).toBe(
      "\n=== Turn 1 ===",
    );
    expect(formatTurnStartBoundary({ turnNumber: 2, origin: "resumed" })).toBe(
      "\n=== Turn 2 (resumed) ===",
    );
    expect(
      formatTurnEndBoundary({
        turnNumber: 3,
        origin: "continued",
        status: "completed",
      }),
    ).toBe("=== End Turn 3 (continued) ===\n");
  });

  it("keeps non-success turn endings explicit", () => {
    expect(
      formatTurnEndBoundary({
        turnNumber: 1,
        origin: "normal",
        status: "interrupted",
      }),
    ).toBe("=== End Turn 1 (interrupted) ===\n");
    expect(
      formatTurnEndBoundary({
        turnNumber: 2,
        origin: "resumed",
        status: "error",
      }),
    ).toBe("=== End Turn 2 (resumed, error) ===\n");
  });

  it("formats execution-started lines after preflight passes", () => {
    expect(formatExecutionStartedLine("normal")).toBe("Execution started...");
    expect(formatExecutionStartedLine("resumed")).toBe(
      "Execution started (resumed context)...",
    );
    expect(formatExecutionStartedLine("continued")).toBe(
      "Execution started (continued context)...",
    );
  });

  it("renders minimal fallback results for turns without runtime result blocks", () => {
    const rendered: string[] = [];

    renderTurnResultFallback(
      {
        renderLine(line: string) {
          rendered.push(line);
        },
        renderChunk() {},
      } as never,
      {
        outcome: "interrupted",
        detail: "Current request was cancelled before completion.",
        doNext: "Use /resume to continue the interrupted session.",
      },
    );

    expect(rendered).toEqual([
      "",
      "Result",
      "- Outcome: interrupted",
      "- Detail: Current request was cancelled before completion.",
      "- DoNext: Use /resume to continue the interrupted session.",
      "",
    ]);
  });
});
