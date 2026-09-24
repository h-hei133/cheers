import { describe, expect, it } from "vitest";
import { createEmptyLifecycleIndex } from "../core/tools/toolResultLifecycle.js";
import { projectSessionContextRebuild } from "../context/sessionContextRebuildProjection.js";
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
} from "./recovery/recoveryTrustBoundary.js";
import {
  projectSessionReentrySummary,
  scoreSessionReentrySummary,
} from "./presentation/sessionReentrySurface.js";

describe("session substrate projections", () => {
  it("encodes transcript events with an entry id and no other shape change", () => {
    const message = createMessageTranscriptEvent({
      role: "user",
      content: "resume this",
      timestamp: "2026-05-19T00:00:00.000Z",
    });
    expect(JSON.parse(encodeTranscriptEvent(message))).toEqual({
      type: "message",
      id: expect.stringMatching(/^msg_[0-9a-f]{8}$/),
      role: "user",
      content: "resume this",
      timestamp: "2026-05-19T00:00:00.000Z",
    });
    // The id comes along: a branch is a set of these ids, and a message that
    // lost its own could not be assigned to one.
    const { id, ...rest } = transcriptEventToSessionMessage(message)!;
    expect(rest).toEqual({
      role: "user",
      content: "resume this",
      timestamp: "2026-05-19T00:00:00.000Z",
    });
    expect(id).toBe(message.id);

    expect(
      createLifecycleTranscriptEvent({
        event: "run-interrupted",
        timestamp: "2026-05-19T00:00:01.000Z",
        detail: "pending prompt",
      }),
    ).toEqual({
      type: "lifecycle",
      id: expect.stringMatching(/^evt_[0-9a-f]{8}$/),
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
      id: expect.stringMatching(/^qevt_[0-9a-f]{8}$/),
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

  it("projects branch-capable entries with active leaf and unsupported branch truthfulness", () => {
    const projection = projectSessionTree({
      session: {
        ...makeSession({
          id: "sess_branch_contract",
          status: "active",
        }),
        turns: [
          {
            role: "user",
            content: "build it",
            timestamp: "2026-05-19T00:00:01.000Z",
          },
        ],
      },
    });

    expect(projection.activeLeafId).toBe("sess_branch_contract:turn-1");
    expect(projection.activePathProjection).toMatchObject({
      activeLeafId: "sess_branch_contract:turn-1",
      pathLength: 2,
      entryKinds: ["session-root", "turn-message"],
      contextRebuildReadiness: "projection-ready",
    });
    expect(projection.nodes.at(-1)).toMatchObject({
      activeLeaf: true,
      activePath: true,
      sourceSessionIdentity: "sess_branch_contract",
      payloadSummary: "metadata-only",
    });
    expect(projection.branchSupport).toBe("not-proven");
    expect(projection.branchSummary.notProvenClaims).toContain(
      "branch-navigation",
    );
    expect(JSON.stringify(projection)).not.toContain("build it");
  });

  it("projects compaction and branch summary contracts without success evidence or raw summaries", () => {
    const projection = projectSessionTree({
      session: makeSession({
        id: "sess_compaction_contract",
        status: "completed",
      }),
      compactions: [
        {
          id: "compact_1",
          firstKeptEntryId: "sess_compaction_contract:turn-2",
          summary:
            "raw provider output: hidden reasoning token=secret oldText=raw-before newText=raw-after",
          tokensBefore: 1200,
          evidence: "observed",
        },
      ],
      branchSummaries: [
        {
          id: "branch_summary_1",
          sourceBranchIdentity: "sess_compaction_contract",
          targetLocation:
            "/home/wang/.private-agents-real/provider.env raw provider output: hidden reasoning",
          summary: "branch summary exists",
        },
      ],
    });
    const serialized = JSON.stringify(projection);

    expect(projection.compaction).toMatchObject({
      availability: "observed",
      terminalSuccessClaim: false,
    });
    expect(projection.compaction.records[0]).toMatchObject({
      compactionId: "compact_1",
      firstKeptEntryId: "sess_compaction_contract:turn-2",
      summaryAvailability: "available",
      evidence: "observed",
      tokenMetadata: { tokensBefore: 1200 },
      terminalSuccessClaim: false,
    });
    expect(projection.branchSummary.records[0]).toMatchObject({
      branchSummaryId: "branch_summary_1",
      sourceBranchIdentity: "sess_compaction_contract",
      summaryAvailability: "available",
      terminalSuccessClaim: false,
    });
    expect(serialized).not.toMatch(
      /hidden reasoning|token=secret|raw-before|raw-after|cheers-real|branch summary exists/i,
    );
    expect(serialized).not.toContain('"success":true');
    expect(projection.compaction.records[0]?.notProvenClaims).toContain(
      "compaction-summary-truth",
    );
    expect(projection.branchSummary.records[0]?.notProvenClaims).toContain(
      "branch-summary-truth",
    );
  });

  it("projects context rebuild inputs from the active path with policy exclusions and missing facts", () => {
    const sessionProjection = projectSessionTree({
      session: {
        ...makeSession({
          id: "sess_rebuild",
          status: "active",
        }),
        turns: [
          {
            role: "user",
            content: "unsafe file contents",
            timestamp: "2026-05-19T00:00:01.000Z",
          },
        ],
      },
      compactions: [
        {
          id: "compact_rebuild",
          summary: "summarized",
          evidence: "planned",
        },
      ],
    });

    const rebuild = projectSessionContextRebuild({ sessionProjection });
    const serialized = JSON.stringify(rebuild);

    expect(rebuild.rebuildSource).toMatchObject({
      sessionIdentity: "sess_rebuild",
      activeLeafId: "sess_rebuild:turn-1",
      treeSupport: "linear-path",
      branchSupport: "not-proven",
    });
    expect(rebuild.activePathEntriesConsidered).toEqual([
      {
        id: "sess_rebuild:root",
        kind: "session-root",
        payloadSummary: "metadata-only",
      },
      {
        id: "sess_rebuild:turn-1",
        kind: "turn-message",
        payloadSummary: "metadata-only",
      },
    ]);
    expect(rebuild.compactionSummariesConsidered).toEqual([
      {
        compactionId: "compact_rebuild",
        summaryAvailability: "available",
        evidence: "planned",
        retainedContextFactIds: [],
        excludedContextFactIds: [],
        staleInputIds: [],
        unsafeInputIds: [],
        missingFactIds: [],
        unsupportedFactIds: [],
      },
    ]);
    expect(rebuild.policy).toEqual({
      resourceDetails: "excluded",
      toolDetails: "excluded",
      rawTranscript: "excluded",
    });
    expect(rebuild.missingFacts).toContain(
      "storage-backed-branch-navigation",
    );
    expect(rebuild.terminalSuccessClaim).toBe(false);
    expect(serialized).not.toMatch(/unsafe file contents|summarized/i);
  });

  it("projects recovery trust boundary blocks with the existing hint shape", () => {
    expect(
      projectRecoveryTrustBoundaryBlock({
        sessionId: "sess_blocked",
        sessionDir: "/home/test/.cheers/sessions/sess_blocked",
        reason: "continuation-evidence-missing",
        detail: "error state has no continuation evidence",
      }),
    ).toEqual({
      sessionId: "sess_blocked",
      reason: "continuation-evidence-missing",
      detail: "error state has no continuation evidence",
      recoveryHint:
        "Session sess_blocked is not recoverable. Start a fresh session or manually repair /home/test/.cheers/sessions/sess_blocked.",
    });
  });

  it("keeps a message's model origin across the transcript round trip", () => {
    // The origin names which model produced an answer. It has to survive the
    // write and come back on the read: a conversation rebuilt after a
    // restart would otherwise attribute every answer to whichever model is
    // current.
    const event = createMessageTranscriptEvent({
      role: "assistant",
      content: "the answer",
      origin: { provider: "p", model: "m" },
      timestamp: "2026-05-19T00:00:00.000Z",
    });
    const decoded = decodeTranscriptLine(encodeTranscriptEvent(event));
    const message = transcriptEventToSessionMessage(decoded);
    expect(message?.origin).toEqual({ provider: "p", model: "m" });
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
