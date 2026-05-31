import { describe, expect, it } from "vitest";
import type { QueryCompletionTranscriptEvent } from "./truth.js";
import { selectContinuityTerminalSource } from "./truth.js";

describe("selectContinuityTerminalSource", () => {
  it("does not let query-level success upgrade a coding-level stopped result", () => {
    const codingStopped = makeCompletion("stopped", "stopped_error");
    const querySuccess = makeCompletion("success", "completed");

    expect(
      selectContinuityTerminalSource({
        lastQueryCompletion: querySuccess,
        lastCodingCompletion: codingStopped,
      }),
    ).toBe(codingStopped);
  });
});

function makeCompletion(
  terminalClassification: "success" | "stopped",
  terminalReason: "completed" | "stopped_error",
): QueryCompletionTranscriptEvent {
  return {
    type: "query-event",
    timestamp: "2026-01-01T00:00:00.000Z",
    event: {
      type: "query.completed",
      result: {
        status: terminalClassification === "success" ? "success" : "stopped",
        response: "",
        terminalClassification,
        terminalReason,
        sharedContext: {},
      },
    },
  } as QueryCompletionTranscriptEvent;
}
