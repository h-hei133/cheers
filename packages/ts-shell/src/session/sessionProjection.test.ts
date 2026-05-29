import { describe, expect, it } from "vitest";
import { createEmptyLifecycleIndex } from "../core/tools/toolResultLifecycle.js";
import type {
  RecoverySnapshot,
  Session,
  SessionResumeEligibility,
} from "./SessionManager.js";
import type { SessionContinuitySnapshot } from "./sessionContinuityTypes.js";
import {
  hasContinuationEvidence,
  hasDeterministicTerminalEvidence,
  selectContinuationEvidenceForSnapshot,
} from "./sessionContinuationProjection.js";
import {
  createLifecycleTranscriptEvent,
  createMessageTranscriptEvent,
  createQueryTranscriptEvent,
  decodeTranscriptLine,
  encodeTranscriptEvent,
  transcriptEventToSessionMessage,
} from "./sessionEventCodec.js";
import {
  projectCurrentSessionMetadata,
  projectSessionMetadata,
} from "./sessionMetadataProjection.js";
import { projectSessionTree } from "./sessionTreeProjection.js";
import { projectCompactRetentionPlanInput } from "./sessionCompactProjection.js";
import {
  projectRecoveryTrustBoundaryBlock,
  projectSessionReentrySummary,
  scoreSessionReentrySummary,
} from "./sessionSummaryProjection.js";

describe("session substrate projections", () => {
  it("encodes transcript events without changing their stored JSON shape", () => {
    const message = createMessageTranscriptEvent({
      role: "user",
      content: "resume this",
      timestamp: "2026-05-19T00:00:00.000Z",
    });
    expect(JSON.parse(encodeTranscriptEvent(message))).toEqual({
      type: "message",
      role: "user",
      content: "resume this",
      timestamp: "2026-05-19T00:00:00.000Z",
    });
    expect(transcriptEventToSessionMessage(message)).toEqual({
      role: "user",
      content: "resume this",
      timestamp: "2026-05-19T00:00:00.000Z",
    });

    expect(
      createLifecycleTranscriptEvent({
        event: "run-interrupted",
        timestamp: "2026-05-19T00:00:01.000Z",
        detail: "pending prompt",
      }),
    ).toEqual({
      type: "lifecycle",
      event: "run-interrupted",
      timestamp: "2026-05-19T00:00:01.000Z",
      detail: "pending prompt",
    });

    expect(
      createQueryTranscriptEvent({
        event: { type: "query.started", sessionId: "sess_1", prompt: "go" },
        timestamp: "2026-05-19T00:00:02.000Z",
      }),
    ).toEqual({
      type: "query-event",
      event: { type: "query.started", sessionId: "sess_1", prompt: "go" },
      timestamp: "2026-05-19T00:00:02.000Z",
    });
  });

  it("keeps unknown or legacy transcript lines parse-compatible", () => {
    expect(
      decodeTranscriptLine(
        JSON.stringify({
          type: "legacy-event",
          payload: { preserved: true },
          timestamp: "2026-05-19T00:00:00.000Z",
        }),
      ),
    ).toEqual({
      type: "legacy-event",
      payload: { preserved: true },
      timestamp: "2026-05-19T00:00:00.000Z",
    });
  });

  it("projects session reentry summaries and preserves scoring semantics", () => {
    const session = makeSession({
      id: "sess_reentry",
      status: "interrupted",
      updatedAt: "2026-05-19T00:00:00.000Z",
    });
    const summary = projectSessionReentrySummary({
      session,
      trustBoundary: makeEligibility({
        recoverable: true,
        disposition: "fully-resumable",
        autoResumeReady: true,
        detail: "Pending prompt and interruption evidence are available",
      }),
      recoverySnapshot: makeRecoverySnapshot({
        pendingPrompt: "finish task",
        runPhase: "turn-active",
        lastUserMessage: {
          role: "user",
          content: "finish task",
          timestamp: "2026-05-19T00:00:00.000Z",
        },
      }),
      continuitySnapshot: makeContinuitySnapshot({
        lastStagedRepairStepCount: 3,
        lastStagedRepairNextStep: 2,
      }),
    });

    expect(summary).toMatchObject({
      id: "sess_reentry",
      status: "interrupted",
      projectRoot: "/workspace",
      pendingPrompt: "finish task",
      runPhase: "turn-active",
      lastUserMessage: "finish task",
      recoverable: true,
      resumeDisposition: "fully-resumable",
      autoResumeReady: true,
      stagedRepairStepCount: 3,
      stagedRepairNextStep: 2,
    });
    expect(
      scoreSessionReentrySummary({
        summary,
        preferredProjectRoot: "/workspace",
      }),
    ).toBeGreaterThan(
      scoreSessionReentrySummary({
        summary: { ...summary, terminalClassification: "success" },
        preferredProjectRoot: "/other",
      }),
    );
  });

  it("projects continuation evidence with replay-safe redaction and critical markers", () => {
    const projected = selectContinuationEvidenceForSnapshot([
      "one",
      "two",
      "three",
      "four",
      "five",
      "six",
      "seven",
      "eight",
      "raw-dom:<html>secret</html>",
      "authorization: bearer token",
      "verify-command-hint:npm test",
      "browser-agent-transaction-trace:trace_1",
      "claim-ledger claim_ledger_abc; version=v1; terminal=confirmation-required; raw-content-excluded",
      "raw-file:src/app.ts=full dump",
    ]);

    expect(projected).toEqual([
      "one",
      "two",
      "three",
      "four",
      "five",
      "six",
      "seven",
      "eight",
      "verify-command-hint:npm test",
      "browser-agent-transaction-trace:trace_1",
      "claim-ledger claim_ledger_abc; version=v1; terminal=confirmation-required; raw-content-excluded",
    ]);
    expect(projected.join("\n")).not.toMatch(/<html|secret|token|raw-file/i);
  });

  it("keeps recovery evidence predicates deterministic", () => {
    expect(
      hasContinuationEvidence(
        makeRecoverySnapshot({ pendingPrompt: "continue this" }),
      ),
    ).toBe(true);
    expect(
      hasContinuationEvidence(
        makeRecoverySnapshot({ runPhase: "prompt-persisted" }),
      ),
    ).toBe(true);
    expect(hasContinuationEvidence(makeRecoverySnapshot())).toBe(false);

    expect(
      hasDeterministicTerminalEvidence(
        makeRecoverySnapshot({ terminalClassification: "stopped" }),
      ),
    ).toBe(true);
    expect(
      hasDeterministicTerminalEvidence(
        makeRecoverySnapshot({
          lastLifecycleEvent: {
            type: "lifecycle",
            event: "run-error",
            timestamp: "2026-05-19T00:00:00.000Z",
          },
        }),
      ),
    ).toBe(true);
    expect(hasDeterministicTerminalEvidence(makeRecoverySnapshot())).toBe(false);
  });

  it("projects compact retention inputs without changing optional fields", () => {
    expect(
      projectCompactRetentionPlanInput({
        workingMemory: { sourceTurnCount: 1 },
        event: { type: "query.failed", error: "boom" },
        turnThreshold: 12,
        now: "2026-05-19T00:00:00.000Z",
        approvalAuditHistory: [],
        actionHandoffSummary: "Resumed from edit-file on src/a.ts.",
        seedInfluence: "target-carryover",
      }),
    ).toEqual({
      workingMemory: { sourceTurnCount: 1 },
      event: { type: "query.failed", error: "boom" },
      turnThreshold: 12,
      now: "2026-05-19T00:00:00.000Z",
      approvalAuditHistory: [],
      actionHandoffSummary: "Resumed from edit-file on src/a.ts.",
      seedInfluence: "target-carryover",
    });
  });

  it("projects metadata and current-session records without changing field names", () => {
    const session = makeSession({
      id: "sess_meta",
      status: "active",
      rootMode: "git-root",
    });

    expect(projectSessionMetadata(session)).toEqual({
      id: "sess_meta",
      projectRoot: "/workspace",
      rootMode: "git-root",
      requestedWorkspaceRoot: undefined,
      targetPathBase: undefined,
      gitRoot: undefined,
      title: undefined,
      createdAt: "2026-05-19T00:00:00.000Z",
      updatedAt: "2026-05-19T00:00:00.000Z",
    });
    expect(
      projectCurrentSessionMetadata({
        sessionId: "sess_meta",
        updatedAt: "2026-05-19T00:00:01.000Z",
      }),
    ).toEqual({
      sessionId: "sess_meta",
      updatedAt: "2026-05-19T00:00:01.000Z",
    });
  });

  it("projects a schema-neutral active path without raw transcript content or terminal success claims", () => {
    const projection = projectSessionTree({
      session: {
        ...makeSession({
          id: "sess_tree",
          status: "completed",
          updatedAt: "2026-05-19T00:00:03.000Z",
        }),
        turns: [
          {
            role: "user",
            content: "token=secret oldText=raw-before",
            timestamp: "2026-05-19T00:00:01.000Z",
          },
          {
            role: "assistant",
            content: "raw provider output: hidden reasoning",
            timestamp: "2026-05-19T00:00:02.000Z",
          },
        ],
      },
      stateSnapshot: {
        status: "completed",
        terminalClassification: "success",
        terminalReason: "completed",
      },
    });
    const serialized = JSON.stringify(projection);

    expect(projection.treeSupport).toBe("linear-path");
    expect(projection.branchSupport).toBe("not-proven");
    expect(projection.activePath).toEqual([
      "sess_tree:root",
      "sess_tree:turn-1",
      "sess_tree:turn-2",
    ]);
    expect(projection.terminal.terminalSuccessClaim).toBe(false);
    expect(projection.terminal.notProvenClaims).toContain("terminal-success");
    expect(serialized).not.toMatch(/token=secret|raw-before|hidden reasoning|raw provider output/i);
  });

  it("projects recovery trust boundary blocks with the existing hint shape", () => {
    expect(
      projectRecoveryTrustBoundaryBlock({
        sessionId: "sess_blocked",
        sessionDir: "/home/test/.private-agents/sessions/sess_blocked",
        reason: "continuation-evidence-missing",
        detail: "error state has no continuation evidence",
      }),
    ).toEqual({
      sessionId: "sess_blocked",
      reason: "continuation-evidence-missing",
      detail: "error state has no continuation evidence",
      recoveryHint:
        "Session sess_blocked is not recoverable. Start a fresh session or manually repair /home/test/.private-agents/sessions/sess_blocked.",
    });
  });
});

function makeSession(input: {
  readonly id: string;
  readonly status: Session["status"];
  readonly updatedAt?: string;
  readonly rootMode?: Session["rootMode"];
}): Session {
  return {
    id: input.id,
    projectRoot: "/workspace",
    ...(input.rootMode ? { rootMode: input.rootMode } : {}),
    createdAt: "2026-05-19T00:00:00.000Z",
    updatedAt: input.updatedAt ?? "2026-05-19T00:00:00.000Z",
    status: input.status,
    turns: [],
  };
}

function makeEligibility(
  input: Omit<SessionResumeEligibility, "block">,
): SessionResumeEligibility {
  return input;
}

function makeRecoverySnapshot(
  input: Partial<RecoverySnapshot> = {},
): RecoverySnapshot {
  return {
    pendingLifecycle: createEmptyLifecycleIndex(),
    repairSummary: {
      insertedPromptMessage: false,
      insertedQueryStarted: false,
      strippedInterruptedTerminalEvents: 0,
      insertedRunInterrupted: false,
      ignoredDuplicateTurnStarts: 0,
      ignoredUnpairedTurnCompletions: 0,
      ignoredRoleMismatchedTurnCompletions: 0,
    },
    transcriptEvents: [],
    ...input,
  };
}

function makeContinuitySnapshot(
  input: Partial<SessionContinuitySnapshot> = {},
): SessionContinuitySnapshot {
  return {
    sessionId: "sess_reentry",
    projectRoot: "/workspace",
    recentChangedFiles: [],
    recentTargetFiles: [],
    recentFailedFiles: [],
    recentVerifiedFiles: [],
    lastRepairNotes: [],
    lastContinuationEvidence: [],
    lastTaskSatisfactionReasons: [],
    unresolvedItems: [],
    ...input,
  };
}
