import { describe, expect, it } from "vitest";

import { buildLoopContextRebuildInput } from "../../context/rebuildInput.js";
import { projectSessionContextRebuild } from "../../context/sessionContextRebuildProjection.js";
import { createEvidenceOnlySavePoint } from "../../evidence/savepoint/model.js";
import { createModelRequestBoundary, prepareNextTurnModelRequest } from "../../provider/request/boundary.js";
import { prepareNextTurnBundle } from "../../turn/nextTurnBundle.js";
import { createRuntimeTurnSnapshot } from "../../turn/turnSnapshot.js";
import { PRODUCT_TRUTH_MATRIX, PRODUCT_TRUTH_NEGATIVE_CASES } from "../../runtime/loop/truthMatrix.test.js";
import { evaluateContinuationReadiness } from "../continuation/readiness.js";
import { summarizeReplaySafeLoopState } from "./state.js";
import { projectSessionTree } from "../sessionTreeProjection.js";

describe("replay-safe loop state summary", () => {
  it("contains safe references and excludes raw transcript content", () => {
    const sessionProjection = projectSessionTree({
      session: {
        id: "sess-replay-safe",
        projectRoot: "/workspace",
        createdAt: "2026-05-29T00:00:00.000Z",
        updatedAt: "2026-05-29T00:00:01.000Z",
        status: "active",
        turns: [{
          role: "user",
          content:
            "raw provider output: hidden reasoning token=secret oldText=before newText=after",
        }],
      },
    });
    const contextRebuildProjection = projectSessionContextRebuild({ sessionProjection });
    const rebuildInput = buildLoopContextRebuildInput({
      sessionProjection,
      contextRebuildProjection,
    });
    const continuationReadiness = evaluateContinuationReadiness({
      sessionProjection,
      contextRebuildProjection,
      rebuildInput,
    });
    const summary = summarizeReplaySafeLoopState({
      sessionProjection,
      contextRebuildProjection,
      continuationReadiness,
      rebuildInput,
      replaySafePlanningStates: [{
        replayStateId: "replay-planning-state-1",
        taskIntentSummary: "safe planning continuation",
        discoveryHandoffIds: ["discovery-handoff-1"],
        stagedContextIds: ["packet-1"],
        contextSufficiencyStatus: "sufficient_for_review_only_plan",
        planningQualityIds: ["quality-1"],
        assumptionsAndConstraints: ["mutationAuthority=not-granted"],
        editHandoffIds: ["edit-handoff-safe-id"],
        verificationHandoffIds: ["verification-handoff-safe-id"],
        staleInvalidationFacts: ["missingFreshnessEvidence"],
        continuationReadiness: "requires-refresh",
        notProvenClaims: [
          "replay-state-available-is-not-plan-validity",
          "replayed-edit-handoff-is-not-mutation-authority",
          "replayed-verification-intent-is-not-verification-passed",
        ],
      }],
      terminalResultFacts: {
        status: "stopped",
        terminalClassification: "stopped",
        terminalReason: "waiting_for_input",
      },
    });
    const serialized = JSON.stringify(summary);

    expect(summary.contextRebuildInputId).toBe(rebuildInput.rebuildInputId);
    expect(summary.replaySafePlanningStateIds).toEqual(["replay-planning-state-1"]);
    expect(summary.discoveryHandoffIds).toEqual(["discovery-handoff-1"]);
    expect(summary.stagedContextIds).toEqual(["packet-1"]);
    expect(summary.planningQualityIds).toEqual(["quality-1"]);
    expect(summary.terminalResultFacts.terminalSuccessClaim).toBe(false);
    expect(summary.terminalSuccessClaim).toBe(false);
    expect(serialized).not.toMatch(
      /raw provider output|hidden reasoning|token=secret|oldText=before|newText=after/i,
    );
    expect(summary.notProvenClaims).toContain("replay-safe-summary-is-not-success");
    expect(summary.notProvenClaims).toContain("replay-state-available-is-not-plan-validity");
    expect(summary.notProvenClaims).toContain("replayed-verification-intent-is-not-verification-passed");
  });

  it("carries request preparation blockers as replay-safe facts only", () => {
    const sessionProjection = projectSessionTree({
      session: {
        id: "sess-replay-request",
        projectRoot: "/workspace",
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:01.000Z",
        status: "active",
        turns: [{ role: "user", content: "continue" }],
      },
    });
    const contextRebuildProjection = projectSessionContextRebuild({
      sessionProjection,
      requiredFacts: ["latest-save-point"],
    });
    const rebuildInput = buildLoopContextRebuildInput({
      sessionProjection,
      contextRebuildProjection,
    });
    const continuationReadiness = evaluateContinuationReadiness({
      sessionProjection,
      contextRebuildProjection,
      rebuildInput,
      requiredFacts: ["latest-save-point"],
    });
    const nextTurnBundle = prepareNextTurnBundle({
      bundleId: "bundle-replay-request",
      turnId: "turn-replay-request",
      deliveryStatus: "waiting",
    });
    const requestPreparation = prepareNextTurnModelRequest({
      nextTurnBundle,
      modelRequestBoundary: createModelRequestBoundary({
        requestId: "request-replay",
        providerReadinessStatus: "ready",
        continuationReadiness,
      }),
      continuationReadiness,
    });
    const toolOutcomeBundle = {
      bundleId: "tool-outcome-bundle:replay",
      sourceBatchId: "tool-result-batch:replay",
      resultMessageIds: ["tool-result-message:call-read"],
      receiptIds: [],
      executedCount: 0,
      failedCount: 1,
      blockedCount: 0,
      authorityRequiredCount: 0,
      unsupportedCount: 0,
      malformedCount: 0,
      unknownCount: 0,
      notDispatchedCount: 0,
      mixedOutcomeStatus: "single_non_success" as const,
      nextAction: "review_failed_result" as const,
      nextActionReason: "failed tool needs review",
      redactionStatus: "report-safe" as const,
      detailStatuses: [{
        toolCallId: "call-read",
        toolName: "read",
        resultStatus: "executed_failed" as const,
        terminalSuccessClaim: false as const,
      }],
      carryForwardFacts: {
        status: "single_non_success" as const,
        nextAction: "review_failed_result" as const,
        resultMessageIds: ["tool-result-message:call-read"],
        blockedReasons: ["call-read:executed_failed"],
        terminalSuccessClaim: false as const,
      },
      blockingFacts: ["call-read:executed_failed"],
      notProvenClaims: ["tool-outcome-bundle-is-not-task-success"],
      terminalSuccessClaim: false as const,
    };
    const summary = summarizeReplaySafeLoopState({
      sessionProjection,
      contextRebuildProjection,
      continuationReadiness,
      rebuildInput,
      nextTurnBundle,
      requestPreparation,
      toolOutcomeBundle,
    });

    expect(summary.requestPreparationId).toBe(requestPreparation.requestPreparationId);
    expect(summary.requestReadinessStatus).toBe("blocked_by_missing_context");
    expect(summary.requestBlockedReasons).toEqual(
      expect.arrayContaining(["continuation:blocked_missing_required_facts"]),
    );
    expect(summary.continuationReadinessStatus).toBe("blocked_missing_required_facts");
    expect(summary.toolOutcomeStatus).toBe("single_non_success");
    expect(summary.toolOutcomeNextAction).toBe("review_failed_result");
    expect(summary.toolOutcomeBlockedReasons).toEqual(["call-read:executed_failed"]);
    expect(summary.terminalSuccessClaim).toBe(false);
    expect(summary.notProvenClaims).toContain("request-prepared-is-not-provider-call");
    expect(summary.notProvenClaims).toContain("tool-outcome-bundle-is-not-task-success");
  });

  it("carries product completion packet facts without terminal truth", () => {
    const sessionProjection = projectSessionTree({
      session: {
        id: "sess-replay-packet",
        projectRoot: "/workspace",
        createdAt: "2026-05-29T00:00:00.000Z",
        updatedAt: "2026-05-29T00:00:01.000Z",
        status: "active",
        turns: [{ role: "user", content: "continue packet facts" }],
      },
    });
    const contextRebuildProjection = projectSessionContextRebuild({ sessionProjection });
    const rebuildInput = buildLoopContextRebuildInput({
      sessionProjection,
      contextRebuildProjection,
    });
    const continuationReadiness = evaluateContinuationReadiness({
      sessionProjection,
      contextRebuildProjection,
      rebuildInput,
    });
    const savePoint = createEvidenceOnlySavePoint({
      turnSnapshot: createRuntimeTurnSnapshot({
        sessionId: "sess-replay-packet",
        turn: 1,
        phase: "turn",
        workspaceRoot: "/workspace",
        providerOptIn: false,
      }),
      phase: "save_point",
      pendingNextTurnFacts: [
        "product-completion-packet-status:complete",
        "final-observed-result-status:verified_with_repair",
        "loop-decision:stop_complete",
        "closeout-state:complete",
        "original-failure-summary:id=verification:failed; class=test-failed; status=failed",
        "repair-chain-summary:proposal=repair:proposal; authority=granted; apply=applied; receipts=1",
        "verification-summary:postRepair=passed",
        "missing-proof-items:none",
        "next-action:stop loop after result-owned verified repair projection",
        "not-proven-claims:product-consumer-is-not-terminal-truth,session-carry-forward-is-not-terminal-truth",
        "product-completion-packet-terminal-success:false",
      ],
    });

    const summary = summarizeReplaySafeLoopState({
      sessionProjection,
      contextRebuildProjection,
      continuationReadiness,
      rebuildInput,
      savePoint,
    });

    expect(summary.productCompletionCarryForwardFacts).toMatchObject({
      status: "complete",
      resultOwnedTerminalStatus: "verified_with_repair",
      loopDecision: "stop_complete",
      closeoutState: "complete",
      missingProofItems: [],
      terminalSuccessClaim: false,
    });
    expect(summary.productCompletionCarryForwardFacts?.originalFailureSummary)
      .toContain("class=test-failed");
    expect(summary.productCompletionCarryForwardFacts?.notProvenClaims).toEqual(
      expect.arrayContaining([
        "product-consumer-is-not-terminal-truth",
        "session-carry-forward-is-not-terminal-truth",
      ]),
    );
    expect(summary.notProvenClaims).toContain(
      "session-carry-forward-is-not-terminal-truth",
    );
    expect(summary.terminalSuccessClaim).toBe(false);
  });

  it.each(PRODUCT_TRUTH_MATRIX)(
    "summarizes shared product truth matrix replay facts safely for $name",
    (item) => {
      const serialized = JSON.stringify(item.replaySafeLoopStateSummary);

      expect(item.replaySafeLoopStateSummary.productCompletionCarryForwardFacts)
        .toMatchObject({
          status: item.expected.completionStatus,
          resultOwnedTerminalStatus: item.expected.resultStatus,
          loopDecision: item.expected.loopDecision,
          terminalSuccessClaim: false,
        });
      expect(item.replaySafeLoopStateSummary.terminalSuccessClaim).toBe(false);
      expect(serialized).not.toMatch(
        /raw provider output|hidden reasoning|token=secret|oldText=before|newText=after/i,
      );
    },
  );

  it.each(PRODUCT_TRUTH_NEGATIVE_CASES)(
    "keeps shared non-success matrix replay facts non-success for $name",
    (item) => {
      expect(item.replaySafeLoopStateSummary.productCompletionCarryForwardFacts?.status)
        .not.toBe("complete");
      expect(item.replaySafeLoopStateSummary.terminalResultFacts).toMatchObject({
        status: item.expected.resultStatus,
        terminalClassification: item.expected.resultClassification,
        terminalSuccessClaim: false,
      });
      expect(item.replaySafeLoopStateSummary.notProvenClaims).toContain(
        "replay-safe-summary-is-not-success",
      );
    },
  );
});
