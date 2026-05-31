import { describe, expect, it } from "vitest";

import { projectSessionContextRebuild } from "../../context/sessionContextRebuildProjection.js";
import type { ContextWorkingMemory } from "../../context/memory/model.js";
import {
  evaluateContinuationReadiness,
  type ContinuationContextReadinessStatus,
  type ContinuationReadinessStatus,
} from "./readiness.js";
import { projectSessionTree } from "../sessionTreeProjection.js";

describe("continuation readiness", () => {
  it("represents readiness states without executing the next turn", () => {
    const statuses: ContinuationReadinessStatus[] = [
      "ready",
      "ready_with_missing_optional_facts",
      "blocked_missing_required_facts",
      "blocked_unsafe_context",
      "blocked_stale_session",
      "unsupported",
      "not_ready",
      "not_proven",
    ];

    const projections = statuses.map((expected) => {
      const sessionProjection = projectSessionTree({
        session: {
          id: `sess-${expected}`,
          projectRoot: "/workspace",
          createdAt: "2026-05-29T00:00:00.000Z",
          updatedAt: "2026-05-29T00:00:01.000Z",
          status: "active",
          turns: expected === "not_ready" ? [] : [{ role: "user", content: "x" }],
        },
        branchSummaries: expected === "blocked_unsafe_context"
          ? [{
              id: "branch",
              targetLocation: "/home/wang/.private-agents-real/provider.env",
              summary: "secret",
            }]
          : [],
      });
      const contextRebuildProjection = projectSessionContextRebuild({
        sessionProjection,
        requiredFacts: expected === "blocked_missing_required_facts"
          ? ["required-a"]
          : [],
        optionalFacts: expected === "ready_with_missing_optional_facts"
          ? ["optional-a"]
          : [],
        staleFacts: expected === "blocked_stale_session" ? ["stale-a"] : [],
      });
      return evaluateContinuationReadiness({
        sessionProjection,
        contextRebuildProjection,
        requiredFacts: expected === "blocked_missing_required_facts" ? ["required-a"] : [],
        optionalFacts: expected === "ready_with_missing_optional_facts" ? ["optional-a"] : [],
        staleFacts: expected === "blocked_stale_session" ? ["stale-a"] : [],
        unsupported: expected === "unsupported",
        notProven: expected === "not_proven",
      });
    });

    expect(projections.map((projection) => projection.status)).toEqual(statuses);
    expect(projections.every((projection) => projection.nextTurnExecuted === false)).toBe(true);
    expect(projections.every((projection) => projection.terminalSuccessClaim === false)).toBe(true);
    expect(projections.every((projection) => projection.contextRebuildProjectionIds.length === 1)).toBe(true);
  });

  it("keeps branch and compaction gaps visible", () => {
    const sessionProjection = projectSessionTree({
      session: {
        id: "sess-gaps",
        projectRoot: "/workspace",
        createdAt: "2026-05-29T00:00:00.000Z",
        updatedAt: "2026-05-29T00:00:01.000Z",
        status: "active",
        turns: [{ role: "user", content: "x" }],
      },
    });
    const readiness = evaluateContinuationReadiness({
      sessionProjection,
      contextRebuildProjection: projectSessionContextRebuild({ sessionProjection }),
    });

    expect(readiness.branchGapStatus).toBe("branch_unsupported");
    expect(readiness.compactionGapStatus).toBe("compaction_unsupported");
    expect(readiness.notProvenClaims).toContain("continuation-ready-is-not-success");
  });

  it("represents continuation context readiness, refresh reads, and source memory ids", () => {
    const expectedStatuses: ContinuationContextReadinessStatus[] = [
      "ready_for_review_only_planning",
      "ready_with_required_refresh",
      "ready_with_optional_refresh",
      "blocked_stale_context",
      "blocked_workspace_mismatch",
      "blocked_missing_required_facts",
      "blocked_ambiguous_target",
      "unsupported",
    ];
    const sessionProjection = projectSessionTree({
      session: {
        id: "sess-context-readiness",
        projectRoot: "/workspace",
        createdAt: "2026-05-29T00:00:00.000Z",
        updatedAt: "2026-05-29T00:00:01.000Z",
        status: "active",
        turns: [{ role: "user", content: "x" }],
      },
    });

    const projections = expectedStatuses.map((expected) => {
      const contextRebuildProjection = projectSessionContextRebuild({
        sessionProjection,
        requiredFacts: expected === "blocked_missing_required_facts"
          ? ["required-context"]
          : [],
        staleFacts: expected === "blocked_stale_context" ? ["stale-context-packet"] : [],
      });
      const memory = buildSourceMemory({
        requiredRefreshSuggestions: expected === "ready_with_required_refresh"
          ? ["refresh required read"]
          : [],
        optionalRefreshSuggestions: expected === "ready_with_optional_refresh"
          ? ["refresh optional read"]
          : [],
      });
      return evaluateContinuationReadiness({
        sessionProjection,
        contextRebuildProjection,
        requiredFacts: expected === "blocked_missing_required_facts"
          ? ["required-context"]
          : [],
        staleFacts: expected === "blocked_stale_context" ? ["stale-context-packet"] : [],
        sourceMemories: [memory],
        workspaceMismatch: expected === "blocked_workspace_mismatch",
        ambiguousTarget: expected === "blocked_ambiguous_target",
        unsupported: expected === "unsupported",
      });
    });

    expect(projections.map((projection) => projection.contextReadinessStatus)).toEqual(expectedStatuses);
    expect(projections[0].sourceMemoryIds).toEqual(["memory-1"]);
    expect(projections[1].requiredRefreshReads).toContain("refresh required read");
    expect(projections[2].optionalRefreshReads).toContain("refresh optional read");
    expect(projections[3].requiredRefreshReads).toContain("refresh stale fact: stale-context-packet");
    expect(projections[5].missingRequiredFacts).toContain("required-context");
    expect(projections[0].notProvenClaims).toEqual(
      expect.arrayContaining([
        "continuation-ready-is-not-edit-authority",
        "continuation-ready-is-not-verification-success",
      ]),
    );
  });
});

function buildSourceMemory(input: {
  readonly requiredRefreshSuggestions?: readonly string[];
  readonly optionalRefreshSuggestions?: readonly string[];
}): ContextWorkingMemory {
  return {
    memoryId: "memory-1",
    taskFingerprint: "task-1",
    repoSnapshotId: "repo-1",
    selectedTargetPath: "src/a.ts",
    candidateFiles: ["src/a.ts"],
    fileReceipts: [],
    compactSummary: "safe compact summary",
    missingFacts: [],
    planningWarnings: [],
    editTargetRationale: [],
    verificationIntent: [],
    handoffSummary: "mutationAuthority=not-granted",
    invalidation: {
      invalidationId: "invalidation-1",
      policy: "stat-size-mtime",
      staleFiles: [],
      invalidationSignals: [],
      missingFreshnessEvidence: [],
      invalidated: false,
      nextReadSuggestions: [],
      notProvenClaims: [],
    },
    recordFacts: {
      recordId: "record-1",
      memoryId: "memory-1",
      sourceTurnOrLabel: "safe-source",
      sourceCandidateIds: ["candidate-1"],
      sourceContextPacketIds: ["packet-1"],
      sourcePlanningIds: ["plan-1"],
      createdPhase: "context-memory",
      intendedReuseScope: "review-only",
      freshnessEvidence: [],
      stalenessEvidence: [],
      invalidationState: {
        invalidationId: "invalidation-1",
        policy: "stat-size-mtime",
        staleFiles: [],
        invalidationSignals: [],
        missingFreshnessEvidence: [],
        invalidated: false,
        nextReadSuggestions: [],
        notProvenClaims: [],
      },
      redactionState: "report-safe",
      notProvenClaims: [],
    },
    reuseEligibility: {
      eligibilityId: "eligibility-1",
      status: "reusable",
      reason: "test",
      matchingTaskFacts: [],
      matchingTargetFacts: [],
      matchingWorkspaceFacts: [],
      freshnessRequirement: "fresh-receipts-required",
      missingFacts: [],
      requiredRefreshSuggestions: input.requiredRefreshSuggestions ?? [],
      optionalRefreshSuggestions: input.optionalRefreshSuggestions ?? [],
      notProvenClaims: [],
    },
    discoveryHandoff: {
      handoffId: "discovery-1",
      reusedCandidateIds: ["candidate-1"],
      candidateFreshnessState: "reusable",
      reusedContextPacketIds: ["packet-1"],
      contextPacketFreshnessState: "reusable",
      stalePacketsExcluded: [],
      requiredRefreshCandidates: [],
      optionalRefreshCandidates: [],
      discoveryFactsToRerun: [],
      stagedReadsToRerun: [],
      nextReadSuggestions: [],
      notProvenClaims: [],
    },
    planningHandoff: {
      handoffId: "planning-1",
      reusedPlanningQualityIds: ["quality-1"],
      assumptionsRemainValid: [],
      assumptionsRequiringRefresh: [],
      constraintsRemainActive: [],
      replaySafePlanStepIds: [],
      editHandoffFreshnessState: "reusable",
      verificationHandoffFreshnessState: "reusable",
      unsupportedOrStalePlanningReasons: [],
      replaySafePlanningState: {
        replayStateId: "replay-planning-1",
        taskIntentSummary: "safe",
        discoveryHandoffIds: ["discovery-1"],
        stagedContextIds: ["packet-1"],
        contextSufficiencyStatus: "review-only",
        planningQualityIds: ["quality-1"],
        assumptionsAndConstraints: [],
        editHandoffIds: [],
        verificationHandoffIds: [],
        staleInvalidationFacts: [],
        continuationReadiness: "review-only",
        notProvenClaims: [],
      },
      notProvenClaims: [],
    },
    redactionStatus: "redacted-and-budgeted",
    mutationAuthority: "not-granted",
    evidence: [],
  };
}
