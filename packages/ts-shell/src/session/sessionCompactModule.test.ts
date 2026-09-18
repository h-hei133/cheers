import { describe, expect, it } from "vitest";
import type { QueryEvent } from "../core/query/runtime/events.js";
import type { CodingResultSummary } from "../result/types.js";
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

  it("carries safe changed-file task state through compact continuity", () => {
    const compacted = applySessionCompactRetention({
      workingMemory: { sourceTurnCount: 1, summary: [] },
      event: makeCompletedEvent(
        makeChangedFileCodingResult({
          changedFiles: ["src/checkout/state.ts"],
          failedFiles: [
            {
              path: "src/checkout/state.test.ts",
              reason: "expected checked-out status",
            },
          ],
          verifiedFiles: [],
          unverifiedFiles: ["src/checkout/state.ts"],
          reason: "expected checked-out status",
          command: "npm test -- src/checkout/state.test.ts",
          nextAction: "repair checkout state and rerun focused verification",
          blockerKind: "test-failed",
          repairAttempts: 1,
          repairNotes: ["first repair did not update dependent state"],
        }),
      ),
      turnThreshold: 2,
      historyLimit: 4,
      now: "2026-05-21T00:00:00.000Z",
    }) as {
      readonly compacted: boolean;
      readonly continuity: {
        readonly taskState?: {
          readonly source: string;
          readonly changedFiles: readonly string[];
          readonly proofGap: readonly string[];
          readonly repairAttempts: readonly unknown[];
          readonly originalFailureClassification?: string;
          readonly nextVerificationPlan?: { readonly command?: string };
          readonly continuationSafety?: { readonly status?: string };
        };
      };
    };

    expect(compacted.compacted).toBe(true);
    expect(compacted.continuity.taskState).toMatchObject({
      source: "compact",
      changedFiles: ["src/checkout/state.ts"],
      unverifiedFiles: ["src/checkout/state.ts"],
      originalFailureClassification: "test-failed",
      nextVerificationPlan: {
        command: "npm test -- src/checkout/state.test.ts",
      },
      continuationSafety: { status: "safe" },
    });
    expect(compacted.continuity.taskState?.proofGap).toContain("verification failed");
    expect(compacted.continuity.taskState?.repairAttempts).toHaveLength(1);
  });

  it("does not carry compact task state when safety quality is stale", () => {
    const compacted = applySessionCompactRetention({
      workingMemory: {
        sourceTurnCount: 1,
        summary: [],
        continuity: {
          taskState: {
            source: "compact",
            pendingAction: "verify",
            proofGap: ["verification proof missing for changed files"],
            changedFiles: ["src/stale-compact.ts"],
            verifiedFiles: [],
            unverifiedFiles: ["src/stale-compact.ts"],
            failureCategories: ["verification failed"],
            originalFailureClassification: "test-failed",
            repairAttempts: [],
            nextVerificationPlan: {
              command: "npm test -- src/stale-compact.test.ts",
              targetFiles: ["src/stale-compact.ts"],
            },
            artifactPendingState: {
              claims: [],
              evidenceIds: [],
              missingClaims: [],
            },
            continuationSafety: {
              status: "stale",
              reasons: ["older compact state contradicted newer turn"],
            },
          },
        },
      },
      event: makeCompletedEvent(
        makeCodingResult({
          reason: "newer result has no changed files",
          nextAction: "discover current owner state",
          evidence: ["actionable-blocker-kind:stale-state"],
        }),
      ),
      turnThreshold: 2,
      historyLimit: 4,
      now: "2026-05-21T00:00:00.000Z",
    }) as {
      readonly continuity: {
        readonly taskState?: { readonly changedFiles?: readonly string[] };
      };
    };

    expect(compacted.continuity.taskState?.changedFiles ?? []).toEqual([]);
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

function makeChangedFileCodingResult(input: {
  readonly changedFiles: readonly string[];
  readonly failedFiles: ReadonlyArray<{ path: string; reason: string }>;
  readonly verifiedFiles: readonly string[];
  readonly unverifiedFiles: readonly string[];
  readonly reason: string;
  readonly command: string;
  readonly nextAction: string;
  readonly blockerKind: string;
  readonly repairAttempts: number;
  readonly repairNotes: readonly string[];
}): CodingResultSummary {
  return {
    taskKind: "edit-file",
    changedFiles: [...input.changedFiles],
    failedFiles: [...input.failedFiles],
    patches: input.changedFiles.map((path) => ({
      path,
      operation: "update",
      status: "applied",
    })),
    repair: {
      status: input.repairAttempts > 0 ? "failed" : "not-needed",
      attempts: input.repairAttempts,
      recoveredItems: [],
      failedItems: input.failedFiles.map((file) => file.path),
      notes: [...input.repairNotes],
    },
    continuation: {
      status: "failed-after-bounded-continuation",
      attempts: 1,
      evidence: ["pending changed-file proof gap"],
    },
    changeSet: {
      gitAware: false,
      preExistingDirtyFiles: [],
      postRunDirtyFiles: [...input.changedFiles],
      attemptedFiles: [...input.changedFiles, ...input.failedFiles.map((file) => file.path)],
      changedFiles: [...input.changedFiles],
      unchangedAttemptedFiles: [],
    },
    taskSatisfaction: {
      verdict: "partial",
      reasons: [input.reason],
      requiredEvidence: ["focused verification"],
      observedEvidence: [],
    },
    verifiedFiles: [...input.verifiedFiles],
    unverifiedFiles: input.unverifiedFiles.map((path) => ({
      path,
      reason: input.reason,
    })),
    verification: {
      status: "failed",
      command: input.command,
      reason: input.reason,
      blockerKind: input.blockerKind,
      nextAction: input.nextAction,
    },
    evidence: ["focused verification failed"],
  };
}
