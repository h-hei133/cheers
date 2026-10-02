import { describe, expect, it } from "vitest";
import type { AgentExecutionOutput, OrchestrationResult } from "../../result/types.js";
import { deriveQueryRuntimeObservationState } from "../../core/query/runtime/observation.js";
import { classifyTranscriptLine, decodeTranscriptLineSafe } from "../sessionEventCodec.js";

function output(): AgentExecutionOutput {
  return {
    role: "coder", content: "done", events: [{ type: "tool.result", toolName: "verify", taskId: "call_0", success: true, coveredFiles: ["a.ts"] }],
    codingResult: {
      taskKind: "edit-file", changedFiles: ["a.ts"], verifiedFiles: ["a.ts"], unverifiedFiles: [], failedFiles: [], evidence: ["test passed"],
      changeSet: { gitAware: false, changedFiles: ["a.ts"], attemptedFiles: ["a.ts"], preExistingDirtyFiles: [], postRunDirtyFiles: [], unchangedAttemptedFiles: [] },
      taskSatisfaction: { verdict: "satisfied", reasons: [], requiredEvidence: [], observedEvidence: [] },
      repair: { status: "not-needed", attempts: 0, notes: [], recoveredItems: [], failedItems: [] },
      continuation: { status: "first-pass-success", attempts: 0, evidence: [] },
      verification: { status: "passed" }, lastActionResultSeed: { writeEffect: "verified" },
    },
  };
}

const line = (event: unknown) => JSON.stringify({ type: "query-event", timestamp: "2026-10-03T00:00:00Z", event });

describe("persisted query output admission", () => {
  it("retains current output and terminal data for replay and observations", () => {
    const original = output();
    const event = decodeTranscriptLineSafe(line({ type: "turn.completed", output: original }));
    expect(event?.type === "query-event" && event.event).toEqual({ type: "turn.completed", output: original });
    expect(deriveQueryRuntimeObservationState([original]).changedFiles).toEqual(["a.ts"]);
    const result: OrchestrationResult = {
      status: "completed", terminalReason: "completed", terminalClassification: "success", finalOutput: "done",
      sharedContext: { sessionId: "session", initialPrompt: "edit", notes: [], handoffs: [] }, transcript: [original], codingResult: original.codingResult,
    };
    expect(decodeTranscriptLineSafe(line({ type: "query.completed", result }))).toMatchObject({ event: { result } });
  });

  it.each([{ toString: null }, ["not-needed"]])("rejects status objects without coercion: %j", invalid => {
    const original = output();
    for (const key of ["repair", "continuation"] as const) {
      const candidate = { ...original, codingResult: { ...original.codingResult, [key]: { ...original.codingResult![key], status: invalid } } };
      expect(classifyTranscriptLine(line({ type: "turn.completed", output: candidate }))).toEqual({ kind: "unreadable" });
    }
    const candidate = { ...original, codingResult: { ...original.codingResult, lastActionResultSeed: { writeEffect: invalid } } };
    expect(classifyTranscriptLine(line({ type: "turn.completed", output: candidate }))).toEqual({ kind: "unreadable" });
    expect(classifyTranscriptLine(line({ type: "query.completed", result: { status: "completed", terminalReason: "completed", terminalClassification: invalid } }))).toEqual({ kind: "unreadable" });
  });

  it.each([null, { type: "tool.result", toolName: {}, taskId: "t", success: false }, { type: "tool.result", toolName: "verify", taskId: "t", coveredFiles: {} }])("rejects malformed events before runtime observation: %j", invalid => {
    expect(classifyTranscriptLine(line({ type: "turn.completed", output: { ...output(), events: [invalid] } }))).toEqual({ kind: "unreadable" });
  });
});
