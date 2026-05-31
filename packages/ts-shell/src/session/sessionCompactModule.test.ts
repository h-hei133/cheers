import { describe, expect, it } from "vitest";
import type { QueryEvent } from "../core/query/runtime/events.js";
import type { CodingResultSummary } from "../orchestration/types.js";
import { applySessionCompactRetention } from "./sessionCompactModule.js";

describe("session compact module parity", () => {
  it("compacts approval-denied reason and do-next details distinctly", () => {
    const compacted = applySessionCompactRetention({
      workingMemory: { sourceTurnCount: 1, summary: [] },
      event: makeCompletedEvent(
        makeCodingResult({
          reason: "Approval denied by user for bash",
          nextAction: "Re-run and approve escalation for verify command execution.",
          evidence: ["actionable-blocker-kind:approval-denied"],
        }),
      ),
      turnThreshold: 2,
      historyLimit: 4,
      now: "2026-05-21T00:00:00.000Z",
    }) as { summary: readonly string[]; continuity: Record<string, unknown> };

    const summary = compacted.summary.join("\n");
    expect(summary).toContain("reason=Approval denied by user for bash");
    expect(summary).toContain(
      "next=Re-run and approve escalation for verify command execution",
    );
    expect(summary).toContain("blocker=approval-denied");
    expect(compacted.continuity.lastFailureHandoffDiagnostic).toBe(
      "Failure handoff: status=blocked; target=(session compact); reason=Approval denied by user for bash; blocker=approval-denied; next=Re-run and approve escalation for verify command execution.",
    );
  });

  it("compacts context packet and agent-plan summaries without raw content", () => {
    const compacted = applySessionCompactRetention({
      workingMemory: { sourceTurnCount: 1, summary: [] },
      event: makeCompletedEvent(
        makeCodingResult({
          reason: "Context packet needs more related reads before planning.",
          nextAction: "Read suggested candidates before planning mutation.",
          evidence: [
            "context-packet ctx_abc; target=src/target.ts; included=2; omitted=1; mutationAuthority=not-granted; raw-full-content-excluded",
            "agent-plan plan_abc; readiness=needs-more-context; confidence=medium; missingFacts=1; suggestedReads=1; mutationAuthority=not-granted; redaction=redacted-and-budgeted",
            "actionable-blocker-kind:unsupported-future-edit",
          ],
        }),
      ),
      turnThreshold: 2,
      historyLimit: 4,
      now: "2026-05-21T00:00:00.000Z",
    }) as { summary: readonly string[] };

    const summary = compacted.summary.join("\n");
    expect(summary).toContain("context-packet=context-packet ctx_abc");
    expect(summary).toContain("agent-plan=agent-plan plan_abc");
    expect(summary).toContain("mutationAuthority=not-granted");
    expect(summary).toContain("raw-full-content-excluded");
    expect(summary).not.toContain("RAW_SECRET_FILE_CONTENT");
  });
});

function makeCompletedEvent(codingResult: CodingResultSummary): QueryEvent {
  return {
    type: "query.completed",
    result: {
      status: "stopped_error",
      terminalReason: "stopped_error",
      terminalClassification: "stopped",
      stopReason: codingResult.verification.nextAction,
      transcript: [],
      sharedContext: {
        sessionId: "sess_compact_parity",
        initialPrompt: "continue stopped parity",
        notes: [],
        handoffs: [],
      },
      finalOutput: "",
      codingResult,
    },
  };
}

function makeCodingResult(input: {
  readonly reason: string;
  readonly nextAction: string;
  readonly evidence: readonly string[];
}): CodingResultSummary {
  return {
    taskKind: "edit-file",
    changedFiles: [],
    failedFiles: [{ path: "(session compact)", reason: input.reason }],
    patches: [],
    repair: {
      status: "failed",
      attempts: 0,
      recoveredItems: [],
      failedItems: [],
      notes: [],
    },
    continuation: {
      status: "failed-after-bounded-continuation",
      attempts: 1,
      evidence: [...input.evidence],
    },
    changeSet: {
      gitAware: false,
      preExistingDirtyFiles: [],
      postRunDirtyFiles: [],
      attemptedFiles: [],
      changedFiles: [],
      unchangedAttemptedFiles: [],
    },
    taskSatisfaction: {
      verdict: "insufficient-evidence",
      reasons: [input.reason],
      requiredEvidence: [],
      observedEvidence: [...input.evidence],
    },
    verifiedFiles: [],
    unverifiedFiles: [],
    verification: {
      status: "blocked",
      reason: input.reason,
      blockerKind: "unknown",
      nextAction: input.nextAction,
    },
    evidence: [...input.evidence],
  };
}
