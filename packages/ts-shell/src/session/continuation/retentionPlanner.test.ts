import { describe, expect, it } from "vitest";
import type { QueryEvent } from "../../core/query/runtime/events.js";
import type { OrchestrationResult } from "../../orchestration/types.js";
import { applyCompactRetentionPlan } from "./retentionPlanner.js";

describe("applyCompactRetentionPlan", () => {
  it("updates source counters without compacting before the turn threshold", () => {
    const result = applyCompactRetentionPlan({
      workingMemory: { sourceEventCount: 2, sourceTurnCount: 1 },
      event: { type: "query.failed", error: "stopped" },
      turnThreshold: 2,
      now: "2026-05-13T00:00:00.000Z",
      approvalAuditHistory: [],
    });

    expect(result).toMatchObject({
      sourceEventCount: 3,
      sourceTurnCount: 1,
      updatedAt: "2026-05-13T00:00:00.000Z",
    });
    expect(result).not.toHaveProperty("compacted");
  });

  it("applies compact continuity retention once the threshold is reached", () => {
    const result = applyCompactRetentionPlan({
      workingMemory: {
        summary: ["- keep-this: prior context"],
        continuity: { existing: "preserved" },
        sourceEventCount: 11,
        sourceTurnCount: 1,
      },
      event: makeQueryCompletedEvent(),
      turnThreshold: 2,
      now: "2026-05-13T00:00:00.000Z",
      approvalAuditHistory: [],
      actionHandoffSummary: "Resumed from edit-file on src/a.ts.",
      writeContinuity: {
        writerStarted: false,
        target: "src/a.ts, src/b.ts, src/c.ts",
      },
      seedInfluence: "target-carryover",
      failureHandoffDiagnostic:
        "Failure handoff: status=blocked; target=src/a.ts, src/b.ts, src/c.ts.",
    });

    expect(result).toMatchObject({
      sourceEventCount: 12,
      sourceTurnCount: 2,
      compacted: true,
      compactReason: "auto-threshold",
      compactedAt: "2026-05-13T00:00:00.000Z",
      continuity: {
        existing: "preserved",
        lastWriterStarted: false,
        lastWriteEffectTarget: "src/a.ts, src/b.ts, src/c.ts",
        lastSeedInfluence: "target-carryover",
        lastFailureHandoffDiagnostic:
          "Failure handoff: status=blocked; target=src/a.ts, src/b.ts, src/c.ts.",
      },
    });
    expect((result as { summary: readonly string[] }).summary).toContain(
      "- last-write-effect-target: src/a.ts, src/b.ts, src/c.ts",
    );
    expect((result as { summary: readonly string[] }).summary).toContain(
      "- keep-this: prior context",
    );
  });
});

function makeQueryCompletedEvent(): QueryEvent {
  const result: OrchestrationResult = {
    status: "stopped_error",
    terminalReason: "stopped_error",
    terminalClassification: "stopped",
    stopReason: "blocked",
    transcript: [],
    sharedContext: {
      sessionId: "sess_test",
      initialPrompt: "update three files",
      notes: [],
      handoffs: [],
    },
    finalOutput: "stopped",
  };
  return { type: "query.completed", result };
}
