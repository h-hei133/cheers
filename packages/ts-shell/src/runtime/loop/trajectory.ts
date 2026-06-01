import type { LoopContextRebuildInput } from "../../context/rebuildInput.js";
import type { SessionContextRebuildProjection } from "../../context/sessionContextRebuildProjection.js";
import type { RuntimeResultFactsProjection, RuntimeProjectionEvent } from "../events/projection.js";
import { projectJsonRuntimeEventStream, type JsonRuntimeEventStreamEntry } from "../events/stream.js";
import type { RuntimeExecutionReceiptProjection } from "../execution/receipt.js";
import type { PackageInventoryProjection } from "../resources/inventory.js";
import type { StaticResourceProjection } from "../resources/projection.js";
import type { ProviderRegistryProjection } from "../../provider/registry/provider.js";
import type { ContinuationReadinessProjection } from "../../session/continuation/readiness.js";
import type { ReplaySafeLoopStateSummary } from "../../session/replay/state.js";
import type { SessionTreeProjection } from "../../session/sessionTreeProjection.js";
import type {
  ToolAfterObservationAnnotation,
  ToolBeforePolicyDecision,
} from "../../tools/policy/interception.js";
import type { ToolExecutionResult } from "../../tools/types.js";
import type { AgentLoopContractProjection } from "./contract.js";
import {
  createLoopInfrastructureMap,
  type LoopInfrastructureCategory,
  type LoopInfrastructureConnectionStatus,
} from "./infrastructure.js";

export type LoopTrajectoryStageStatus =
  | "observed"
  | "partial"
  | "unsupported"
  | "not_proven";

export interface LoopTrajectoryStage {
  readonly category: LoopInfrastructureCategory;
  readonly ownerDomain: string;
  readonly connectionStatus: LoopInfrastructureConnectionStatus;
  readonly observationStatus: LoopTrajectoryStageStatus;
  readonly sourceIds: readonly string[];
  readonly eventIds: readonly string[];
  readonly notProvenClaims: readonly string[];
  readonly terminalSuccessClaim: false;
}

export interface LoopTrajectoryProjectionInput {
  readonly loopId: string;
  readonly prompt?: string;
  readonly loop?: AgentLoopContractProjection;
  readonly providerRegistry?: ProviderRegistryProjection;
  readonly toolPolicyDecisions?: readonly ToolBeforePolicyDecision[];
  readonly toolResultAnnotations?: readonly ToolAfterObservationAnnotation[];
  readonly sessionProjection?: SessionTreeProjection;
  readonly contextRebuildProjection?: SessionContextRebuildProjection;
  readonly contextRebuildInput?: LoopContextRebuildInput;
  readonly continuationReadiness?: ContinuationReadinessProjection;
  readonly replaySafeLoopStateSummary?: ReplaySafeLoopStateSummary;
  readonly resourceProjection?: StaticResourceProjection;
  readonly packageInventory?: PackageInventoryProjection;
  readonly resultFacts?: RuntimeResultFactsProjection;
  readonly productSurfaceSectionIds?: readonly string[];
}

export interface LoopTrajectoryProjection {
  readonly loopId: string;
  readonly turnIds: readonly string[];
  readonly snapshotIds: readonly string[];
  readonly eventIds: readonly string[];
  readonly receiptIds: readonly string[];
  readonly toolPolicyIds: readonly string[];
  readonly toolResultMessageIds: readonly string[];
  readonly savePointIds: readonly string[];
  readonly nextTurnBundleIds: readonly string[];
  readonly steeringMessageIds: readonly string[];
  readonly followUpMessageIds: readonly string[];
  readonly deliveryPolicyIds: readonly string[];
  readonly verificationIntentIds: readonly string[];
  readonly verificationResultIds: readonly string[];
  readonly postRepairVerificationRequirementIds: readonly string[];
  readonly postRepairVerificationRequestIds: readonly string[];
  readonly postRepairVerificationResultIds: readonly string[];
  readonly repairVerdictProofInputIds: readonly string[];
  readonly repairVerdictTerminalProjectionIds: readonly string[];
  readonly loopFinalizationDecisionIds: readonly string[];
  readonly productLoopCloseoutIds: readonly string[];
  readonly productCompletionPacketIds: readonly string[];
  readonly repairHandoffIds: readonly string[];
  readonly repairProposalIds: readonly string[];
  readonly repairApplyIds: readonly string[];
  readonly sessionProjectionIds: readonly string[];
  readonly contextRebuildInputIds: readonly string[];
  readonly contextRebuildProjectionIds: readonly string[];
  readonly continuationReadinessIds: readonly string[];
  readonly replaySafeLoopStateSummaryIds: readonly string[];
  readonly providerMetadataIds: readonly string[];
  readonly productSurfaceSectionIds: readonly string[];
  readonly stages: readonly LoopTrajectoryStage[];
  readonly events: readonly RuntimeProjectionEvent[];
  readonly jsonEventStream: readonly JsonRuntimeEventStreamEntry[];
  readonly finalObservedFacts: {
    readonly loopState?: string;
    readonly stopReason?: string;
    readonly failureClass?: string;
    readonly resultStatus?: string;
    readonly terminalClassification?: string;
    readonly terminalReason?: string;
    readonly terminalSuccessClaim: false;
  };
  readonly notProvenClaims: readonly string[];
  readonly redaction: {
    readonly status: "report-safe" | "redacted";
    readonly excluded: readonly string[];
  };
  readonly terminalSuccessClaim: false;
}

const LOOP_PRODUCT_SURFACE_SECTION_IDS = [
  "task",
  "turn",
  "provider",
  "tools",
  "execution",
  "verification",
  "repair",
  "product_closeout",
  "product_completion_packet",
  "save_point",
  "session",
  "context",
  "events",
  "verdict",
  "not_proven",
  "next_action",
] as const;

const REDACTION_EXCLUSIONS = [
  "api-keys",
  "provider.env",
  "auth-headers",
  "raw-provider-output",
  "oldText",
  "newText",
  "unredacted-command-output",
  "hidden-reasoning",
  "transcript-dumps",
  "unsafe-file-contents",
] as const;

export function projectLoopTrajectory(
  input: LoopTrajectoryProjectionInput,
): LoopTrajectoryProjection {
  const infrastructureMap = createLoopInfrastructureMap();
  const events: RuntimeProjectionEvent[] = [];
  const observed = new Map<LoopInfrastructureCategory, {
    readonly sourceIds: readonly string[];
    readonly eventIds: readonly string[];
    readonly notProvenClaims: readonly string[];
  }>();
  let redacted = false;
  const loopId = sanitizeText(input.loopId);
  redacted ||= loopId.redacted;
  const prompt = sanitizeText(input.prompt ?? "");
  redacted ||= prompt.redacted;

  const append = (
    category: LoopInfrastructureCategory,
    type: RuntimeProjectionEvent["type"],
    facts: Record<string, unknown>,
    notProvenClaims: readonly string[] = ["terminal-success"],
    sourceIds: readonly string[] = [],
  ) => {
    const sequence = events.length + 1;
    const sanitized = sanitizeValue(facts) as Record<string, unknown>;
    redacted ||= JSON.stringify(facts) !== JSON.stringify(sanitized);
    const redactionStatus: "report-safe" | "redacted" =
      JSON.stringify(facts) === JSON.stringify(sanitized)
        ? "report-safe"
        : "redacted";
    const event: RuntimeProjectionEvent = deepFreeze({
      id: `loop-trajectory-event-${sequence}`,
      sequence,
      type,
      facts: {
        ...sanitized,
        terminalSuccessClaim: false,
      },
      notProvenClaims: Object.freeze([
        ...new Set(["terminal-success", ...notProvenClaims]),
      ]),
      redaction: {
        status: redactionStatus,
        excluded: REDACTION_EXCLUSIONS,
      },
    });
    events.push(event);
    const previous = observed.get(category);
    observed.set(category, {
      sourceIds: Object.freeze([
        ...new Set([...(previous?.sourceIds ?? []), ...sourceIds.map((id) => sanitizeText(id).value)]),
      ]),
      eventIds: Object.freeze([
        ...new Set([...(previous?.eventIds ?? []), event.id]),
      ]),
      notProvenClaims: Object.freeze([
        ...new Set([...(previous?.notProvenClaims ?? []), ...event.notProvenClaims]),
      ]),
    });
  };

  append(
    "prompt-input",
    "loop-input-observed",
    {
      loopId: loopId.value,
      promptSummary: prompt.value ? summarizeText(prompt.value) : "not-provided",
    },
    ["terminal-success", "prompt-input-is-not-task-success"],
  );

  const turns = input.loop?.turns ?? [];
  for (const turn of turns) {
    append(
      "turn-snapshot",
      "loop-turn-snapshot-observed",
      {
        turn: turn.turn,
        snapshotId: turn.snapshot.id,
        sessionId: turn.snapshot.sessionId,
        phase: turn.snapshot.phase,
      },
      turn.snapshot.redaction.excluded,
      [turn.snapshot.id],
    );
    append(
      "runtime-phase",
      "loop-turn-snapshot-observed",
      {
        turn: turn.turn,
        snapshotId: turn.snapshot.id,
        phase: turn.snapshot.phase,
      },
      ["terminal-success"],
      [turn.snapshot.id],
    );
    append(
      "model-boundary",
      "loop-provider-boundary-observed",
      {
        turn: turn.turn,
        responseId: turn.modelBoundary.responseId,
        stopReason: turn.modelBoundary.stopReason,
        responseSource: turn.modelBoundary.responseSource,
        responseStatus: turn.modelBoundary.responseStatus,
        assistantAccumulationStatus: turn.modelBoundary.assistantAccumulationStatus,
        toolCallCount: turn.modelBoundary.toolCallCount,
      },
      turn.notProvenClaims,
      [turn.modelBoundary.responseId],
    );
    if (turn.normalizedToolCallBatch) {
      append(
        "tool-call-batch",
        turn.normalizedToolCallBatch.extractionStatus === "failed"
          ? "tool-call-extraction-failed"
          : "tool-call-batch-extracted",
        {
          turn: turn.turn,
          batchId: turn.normalizedToolCallBatch.batchId,
          extractionStatus: turn.normalizedToolCallBatch.extractionStatus,
          dispatchStatus: turn.normalizedToolCallBatch.dispatchStatus,
          callCount: turn.normalizedToolCallBatch.calls.length,
          malformedCallCount: turn.normalizedToolCallBatch.malformedCallCount,
          unsupportedCallCount: turn.normalizedToolCallBatch.unsupportedCallCount,
          toolNames: turn.normalizedToolCallBatch.calls.map((call) => call.name),
        },
        turn.normalizedToolCallBatch.notProvenClaims,
        [turn.normalizedToolCallBatch.batchId],
      );
      append(
        "before-tool-policy",
        "tool-dispatch-not-run",
        {
          turn: turn.turn,
          batchId: turn.normalizedToolCallBatch.batchId,
          dispatchStatus: turn.normalizedToolCallBatch.dispatchStatus,
          terminalSuccessClaim: false,
        },
        turn.normalizedToolCallBatch.notProvenClaims,
        [turn.normalizedToolCallBatch.batchId],
      );
    } else if (turn.toolCallBatch) {
      append(
        "tool-call-batch",
        "loop-tool-policy-observed",
        {
          turn: turn.turn,
          batchId: turn.toolCallBatch.id,
          policy: turn.toolCallBatch.policy,
          callCount: turn.toolCallBatch.calls.length,
          toolNames: turn.toolCallBatch.calls.map((call) => call.name),
        },
        ["terminal-success", "tool-success"],
        [turn.toolCallBatch.id],
      );
    }
    if (turn.toolResultBatch) {
      if (turn.toolResultBatch.dispatchPlan) {
        append(
          "before-tool-policy",
          "tool-batch-dispatch-planned",
          {
            turn: turn.turn,
            planId: turn.toolResultBatch.dispatchPlan.planId,
            batchId: turn.toolResultBatch.dispatchPlan.batchId,
            dispatchStatus: turn.toolResultBatch.dispatchPlan.dispatchStatus,
            dispatchPolicy: turn.toolResultBatch.dispatchPlan.dispatchPolicy,
            authorityRequiredCallIds: turn.toolResultBatch.dispatchPlan.authorityRequiredCallIds,
            blockedCallIds: turn.toolResultBatch.dispatchPlan.blockedCallIds,
            unsupportedCallIds: turn.toolResultBatch.dispatchPlan.unsupportedCallIds,
            dispatchedCallIds: turn.toolResultBatch.dispatchPlan.dispatchedCallIds,
          },
          turn.toolResultBatch.dispatchPlan.notProvenClaims,
          [turn.toolResultBatch.dispatchPlan.planId],
        );
        for (const planned of turn.toolResultBatch.dispatchPlan.calls) {
          append(
            "before-tool-policy",
            "before-tool-policy-decided",
            {
              turn: turn.turn,
              planId: turn.toolResultBatch.dispatchPlan.planId,
              toolCallId: planned.toolCallId,
              toolName: planned.toolName,
              dispatchStatus: planned.dispatchStatus,
              decisionId: planned.beforePolicyDecision.decisionId,
              decisionStatus: planned.beforePolicyDecision.status,
            },
            planned.notProvenClaims,
            [planned.beforePolicyDecision.decisionId],
          );
        }
      }
      for (const result of turn.toolResultBatch.results) {
        append(
          "tool-result-details",
          "loop-tool-result-observed",
          {
            batchId: turn.toolResultBatch.id,
            successObserved: result.success,
            reportSafe: result.reportSafe,
          },
          ["terminal-success", "tool-success", ...(result.reportSafe?.notProvenClaims ?? [])],
          [turn.toolResultBatch.id],
        );
      }
      for (const receipt of turn.toolResultBatch.executionReceipts) {
        appendReceipt(receipt);
      }
      for (const detail of turn.toolResultBatch.resultDetails ?? []) {
        append(
          "tool-result-details",
          "loop-tool-result-observed",
          {
            turn: turn.turn,
            batchId: turn.toolResultBatch.id,
            resultDetailsId: detail.resultDetailsId,
            toolCallId: detail.toolCallId,
            resultStatus: detail.resultStatus,
            dispatchStatus: detail.systemDetails.dispatchStatus,
            executionReceiptId: detail.systemDetails.executionReceiptId,
          },
          detail.notProvenClaims,
          [detail.resultDetailsId],
        );
      }
      if (turn.toolResultBatch.resultMessages) {
        for (const message of turn.toolResultBatch.resultMessages.messages) {
          append(
            "tool-result-messages",
            "tool-result-message-prepared",
            {
              turn: turn.turn,
              batchId: turn.toolResultBatch.resultMessages.batchId,
              messageId: message.messageId,
              toolCallId: message.toolCallId,
              deliveryStatus: message.deliveryStatus,
              redactionStatus: message.redactionStatus,
            },
            message.notProvenClaims,
            [message.messageId],
          );
        }
      }
      for (const annotation of turn.toolResultBatch.afterAnnotations ?? []) {
        append(
          "after-tool-annotation",
          "loop-tool-result-observed",
          {
            annotationId: annotation.annotationId,
            decisionId: annotation.decisionId,
            toolId: annotation.toolId,
            resultStatus: annotation.resultStatus,
            blockedFollowUp: annotation.blockedFollowUp,
          },
          annotation.notProvenClaims,
          [annotation.annotationId],
        );
      }
    }
    append(
      "save-point",
      "loop-save-point-observed",
      {
        turn: turn.turn,
        savePointId: turn.savePoint.id,
        phase: turn.savePoint.phase,
        resultProjectionStatus: turn.savePoint.resultProjectionStatus,
        sessionPersistenceStatus: turn.savePoint.sessionPersistenceStatus,
      },
      turn.savePoint.notProvenClaims,
      [turn.savePoint.id],
    );
    append(
      "next-turn-preparation",
      "loop-next-turn-prepared",
      {
        turn: turn.turn,
        prepared: turn.nextTurn.prepared,
        bundleId: turn.nextTurn.bundle?.bundleId,
        pendingFactCount: turn.nextTurn.pendingFacts.length,
        deliveryStatus: turn.nextTurn.bundle?.deliveryStatus ?? "not_prepared",
        nextTurnExecuted: turn.nextTurn.executed,
      },
      turn.nextTurn.bundle?.notProvenClaims ?? ["terminal-success", "next-turn-success"],
      turn.nextTurn.bundle ? [turn.nextTurn.bundle.bundleId] : [`turn:${turn.turn}`],
    );
    append(
      "steering-queue",
      "loop-steering-queue-observed",
      {
        turn: turn.turn,
        queueId: turn.nextTurn.steeringQueue.queueId,
        queuedCount: turn.nextTurn.steeringQueue.queuedCount,
        deliveredCount: turn.nextTurn.steeringQueue.deliveredCount,
        blockedCount: turn.nextTurn.steeringQueue.blockedCount,
        terminalSuccessClaim: false,
      },
      turn.nextTurn.steeringQueue.notProvenClaims,
      [turn.nextTurn.steeringQueue.queueId],
    );
    append(
      "follow-up-queue",
      "loop-follow-up-queue-observed",
      {
        turn: turn.turn,
        queueId: turn.nextTurn.followUpQueue.queueId,
        queuedCount: turn.nextTurn.followUpQueue.queuedCount,
        deliveredCount: turn.nextTurn.followUpQueue.deliveredCount,
        blockedCount: turn.nextTurn.followUpQueue.blockedCount,
        terminalSuccessClaim: false,
      },
      turn.nextTurn.followUpQueue.notProvenClaims,
      [turn.nextTurn.followUpQueue.queueId],
    );
    append(
      "next-turn-delivery-policy",
      "loop-next-turn-delivery-policy-observed",
      {
        turn: turn.turn,
        policyId: turn.nextTurn.deliveryPolicy.policyId,
        deliveryStatus: turn.nextTurn.deliveryPolicy.deliveryStatus,
        entryCount: turn.nextTurn.deliveryPolicy.entries.length,
        providerCalled: turn.nextTurn.deliveryPolicy.providerCalled,
        nextTurnExecuted: turn.nextTurn.deliveryPolicy.nextTurnExecuted,
        terminalSuccessClaim: false,
      },
      turn.nextTurn.deliveryPolicy.notProvenClaims,
      [turn.nextTurn.deliveryPolicy.policyId],
    );
    append(
      "verification-intent",
      "loop-verification-intent-observed",
      {
        turn: turn.turn,
        intentId: turn.verification.intent.intentId,
        dispatchStatus: turn.verification.intent.dispatchStatus,
        relevanceStatus: turn.verification.intent.relevanceStatus,
        coverageStatus: turn.verification.intent.coverageStatus,
        authorityRequirement: turn.verification.intent.authorityRequirement,
        selectedNotRun: turn.verification.intent.selectedNotRun,
        terminalSuccessClaim: false,
      },
      turn.verification.intent.notProvenClaims,
      [turn.verification.intent.intentId],
    );
    append(
      "verification-result",
      "loop-verification-result-observed",
      {
        turn: turn.turn,
        verificationId: turn.verification.result.verificationId,
        status: turn.verification.result.status,
        relevanceStatus: turn.verification.result.relevanceStatus,
        coverageStatus: turn.verification.result.coverageStatus,
        authorityRequirement: turn.verification.result.authorityRequirement,
        runtimeReceiptIds: turn.verification.result.runtimeReceiptIds,
        failureClass: turn.verification.result.failureClass,
        repairEligible: turn.verification.result.repairEligible,
        selectedNotRun: turn.verification.result.selectedNotRun,
        verdictStatus: turn.verification.result.verdictStatus,
        terminalSuccessClaim: false,
      },
      turn.verification.result.notProvenClaims,
      [turn.verification.result.verificationId],
    );
    if (turn.verification.repairRequired) {
      append(
        "repair-handoff",
        "loop-repair-handoff-observed",
        {
          turn: turn.turn,
          handoffId: turn.verification.repairRequired.handoffId,
          sourceVerificationId: turn.verification.repairRequired.sourceVerificationId,
          failureClass: turn.verification.repairRequired.failureClass,
          originalFailureSummary:
            turn.verification.repairRequired.originalFailureSummary,
          taskRelevanceStatus:
            turn.verification.repairRequired.taskRelevanceStatus,
          coverageStatus: turn.verification.repairRequired.coverageStatus,
          authorityState: turn.verification.repairRequired.authorityState,
          runtimeReceiptIds: turn.verification.repairRequired.runtimeReceiptIds,
          repairEligible: turn.verification.repairRequired.repairEligible,
          repairabilityStatus: turn.verification.repairRequired.repairabilityStatus,
          repairBlocker: turn.verification.repairRequired.repairBlocker,
          repairRisk: turn.verification.repairRequired.repairRisk,
          originalFailurePreserved:
            turn.verification.repairRequired.originalFailurePreserved,
          terminalSuccessClaim: false,
        },
        turn.verification.repairRequired.notProvenClaims,
        [turn.verification.repairRequired.handoffId],
      );
    }
    if (turn.verification.repairProposal) {
      append(
        "repair-proposal",
        "loop-repair-handoff-observed",
        {
          turn: turn.turn,
          proposalId: turn.verification.repairProposal.proposalId,
          sourceFailureId: turn.verification.repairProposal.sourceFailureId,
          sourceVerificationId: turn.verification.repairProposal.sourceVerificationId,
          proposalSource: turn.verification.repairProposal.proposalSource,
          originalFailureClass:
            turn.verification.repairProposal.originalFailureClass,
          originalFailureSummary:
            turn.verification.repairProposal.originalFailureSummary,
          taskRelevanceStatus:
            turn.verification.repairProposal.taskRelevanceStatus,
          coverageStatus: turn.verification.repairProposal.coverageStatus,
          runtimeReceiptIds: turn.verification.repairProposal.runtimeReceiptIds,
          readinessStatus: turn.verification.repairProposal.readinessStatus,
          proposalRisk: turn.verification.repairProposal.proposalRisk,
          authorityRequirement:
            turn.verification.repairProposal.authorityRequirement,
          applyStatus: turn.verification.repairProposal.applyStatus,
          postRepairVerificationStatus:
            turn.verification.repairProposal.postRepairVerificationStatus,
          terminalSuccessClaim: false,
        },
        turn.verification.repairProposal.notProvenClaims,
        [turn.verification.repairProposal.proposalId],
      );
    }
    if (turn.verification.repairAuthority) {
      append(
        "repair-authority",
        "loop-repair-handoff-observed",
        {
          turn: turn.turn,
          authorityId: turn.verification.repairAuthority.authorityId,
          proposalId: turn.verification.repairAuthority.proposalId,
          sourceVerificationId:
            turn.verification.repairAuthority.sourceVerificationId,
          authorityRequired: turn.verification.repairAuthority.authorityRequired,
          authorityDecision: turn.verification.repairAuthority.authorityDecision,
          authoritySource: turn.verification.repairAuthority.authoritySource,
          authorityMissingReason:
            turn.verification.repairAuthority.authorityMissingReason,
          originalFailureClass:
            turn.verification.repairAuthority.originalFailureClass,
          terminalSuccessClaim: false,
        },
        turn.verification.repairAuthority.notProvenClaims,
        [turn.verification.repairAuthority.authorityId],
      );
    }
    if (turn.verification.repairApplyRequest) {
      append(
        "repair-apply-request",
        "loop-repair-handoff-observed",
        {
          turn: turn.turn,
          requestId: turn.verification.repairApplyRequest.requestId,
          proposalId: turn.verification.repairApplyRequest.proposalId,
          expectedEditOperationKind:
            turn.verification.repairApplyRequest.expectedEditOperationKind,
          authorityState: turn.verification.repairApplyRequest.authorityState,
          applyReadiness: turn.verification.repairApplyRequest.applyReadiness,
          applyBlocker: turn.verification.repairApplyRequest.applyBlocker,
          postRepairVerificationStatus:
            turn.verification.repairApplyRequest.postRepairVerificationStatus,
          terminalSuccessClaim: false,
        },
        turn.verification.repairApplyRequest.notProvenClaims,
        [turn.verification.repairApplyRequest.requestId],
      );
    }
    if (turn.verification.repairApply) {
      append(
        "repair-apply",
        "loop-repair-handoff-observed",
        {
          turn: turn.turn,
          repairApplyId: turn.verification.repairApply.repairApplyId,
          proposalId: turn.verification.repairApply.proposalId,
          sourceVerificationId: turn.verification.repairApply.sourceVerificationId,
          authorityState: turn.verification.repairApply.authorityState,
          authoritySource: turn.verification.repairApply.authoritySource,
          applyReadiness: turn.verification.repairApply.applyReadiness,
          applyBlocker: turn.verification.repairApply.applyBlocker,
          applyAttempted: turn.verification.repairApply.applyAttempted,
          repairApplyStatus: turn.verification.repairApply.repairApplyStatus,
          repairAuthorityStatus: turn.verification.repairApply.repairAuthorityStatus,
          applyReceiptIds: turn.verification.repairApply.applyReceiptIds,
          touchedTargetSummaries:
            turn.verification.repairApply.touchedTargetSummaries,
          originalFailureClass: turn.verification.repairApply.originalFailureClass,
          originalFailurePreserved:
            turn.verification.repairApply.originalFailurePreserved,
          terminalSuccessClaim: false,
        },
        turn.verification.repairApply.notProvenClaims,
        [turn.verification.repairApply.repairApplyId],
      );
      append(
        "post-repair-verification",
        "loop-verification-result-observed",
        {
          turn: turn.turn,
          repairApplyId: turn.verification.repairApply.repairApplyId,
          postRepairVerificationStatus:
            turn.verification.repairApply.postRepairVerificationStatus,
          terminalSuccessClaim: false,
        },
        turn.verification.repairApply.notProvenClaims,
        [turn.verification.repairApply.repairApplyId],
      );
    }
    if (turn.verification.postRepairVerificationRequirement) {
      append(
        "post-repair-verification",
        "loop-verification-result-observed",
        {
          turn: turn.turn,
          requirementId: turn.verification.postRepairVerificationRequirement.requirementId,
          sourceRepairApplyId:
            turn.verification.postRepairVerificationRequirement.sourceRepairApplyId,
          requirementStatus:
            turn.verification.postRepairVerificationRequirement.requirementStatus,
          verificationRequired:
            turn.verification.postRepairVerificationRequirement.verificationRequired,
          verificationBlocker:
            turn.verification.postRepairVerificationRequirement.verificationBlocker,
          originalFailureClass:
            turn.verification.postRepairVerificationRequirement.originalFailureClass,
          repairApplyState:
            turn.verification.postRepairVerificationRequirement.repairApplyState,
          originalFailurePreserved:
            turn.verification.postRepairVerificationRequirement.originalFailurePreserved,
          repairApplyPreserved:
            turn.verification.postRepairVerificationRequirement.repairApplyPreserved,
          terminalSuccessClaim: false,
        },
        turn.verification.postRepairVerificationRequirement.notProvenClaims,
        [turn.verification.postRepairVerificationRequirement.requirementId],
      );
    }
    if (turn.verification.postRepairVerificationRequest) {
      append(
        "post-repair-verification",
        "loop-verification-result-observed",
        {
          turn: turn.turn,
          requestId: turn.verification.postRepairVerificationRequest.requestId,
          requirementId: turn.verification.postRepairVerificationRequest.requirementId,
          dispatchStatus: turn.verification.postRepairVerificationRequest.dispatchStatus,
          selectedNotRun: turn.verification.postRepairVerificationRequest.selectedNotRun,
          receiptIds: turn.verification.postRepairVerificationRequest.receiptIds,
          terminalSuccessClaim: false,
        },
        turn.verification.postRepairVerificationRequest.notProvenClaims,
        [turn.verification.postRepairVerificationRequest.requestId],
      );
    }
    if (turn.verification.postRepairVerificationResult) {
      append(
        "post-repair-verification",
        "loop-verification-result-observed",
        {
          turn: turn.turn,
          resultId: turn.verification.postRepairVerificationResult.resultId,
          requestId: turn.verification.postRepairVerificationResult.requestId,
          requirementId: turn.verification.postRepairVerificationResult.requirementId,
          status: turn.verification.postRepairVerificationResult.status,
          failureClass: turn.verification.postRepairVerificationResult.failureClass,
          taskRelevanceStatus:
            turn.verification.postRepairVerificationResult.taskRelevanceStatus,
          coverageStatus: turn.verification.postRepairVerificationResult.coverageStatus,
          verdictCandidateAvailable:
            turn.verification.postRepairVerificationResult.verdictCandidateInput !== undefined,
          originalFailurePreserved:
            turn.verification.postRepairVerificationResult.originalFailurePreserved,
          repairApplyPreserved:
            turn.verification.postRepairVerificationResult.repairApplyPreserved,
          terminalSuccessClaim: false,
        },
        turn.verification.postRepairVerificationResult.notProvenClaims,
        [turn.verification.postRepairVerificationResult.resultId],
      );
    }
    if (turn.verification.repairVerdictProofInput) {
      append(
        "evidence-proof-input",
        "loop-evidence-proof-input-observed",
        {
          turn: turn.turn,
          proofInputId: turn.verification.repairVerdictProofInput.proofInputId,
          verdictCandidateId:
            turn.verification.repairVerdictProofInput.verdictCandidateId,
          proofStatus: turn.verification.repairVerdictProofInput.proofStatus,
          missingProofItems:
            turn.verification.repairVerdictProofInput.missingProofItems,
          originalVerificationFailureId:
            turn.verification.repairVerdictProofInput.originalVerificationFailureId,
          repairProposalId:
            turn.verification.repairVerdictProofInput.repairProposalId,
          repairApplyState:
            turn.verification.repairVerdictProofInput.repairApplyState,
          postRepairVerificationState:
            turn.verification.repairVerdictProofInput.postRepairVerificationState,
          evidenceInputOnly:
            turn.verification.repairVerdictProofInput.evidenceInputOnly,
          terminalSuccessClaim: false,
        },
        turn.verification.repairVerdictProofInput.notProvenClaims,
        [turn.verification.repairVerdictProofInput.proofInputId],
      );
    }
    if (turn.verification.repairVerdictTerminalProjection) {
      append(
        "result-terminal-projection",
        "loop-result-terminal-projection-observed",
        {
          turn: turn.turn,
          projectionId:
            turn.verification.repairVerdictTerminalProjection.projectionId,
          sourceProofInputId:
            turn.verification.repairVerdictTerminalProjection.sourceProofInputId,
          status: turn.verification.repairVerdictTerminalProjection.status,
          terminalClassification:
            turn.verification.repairVerdictTerminalProjection.terminalClassification,
          productVerdictStatus:
            turn.verification.repairVerdictTerminalProjection.productVerdict.status,
          originalVerificationFailureId:
            turn.verification.repairVerdictTerminalProjection.originalVerificationFailureId,
          originalFailureClass:
            turn.verification.repairVerdictTerminalProjection.originalFailureClass,
          repairApplyState:
            turn.verification.repairVerdictTerminalProjection.repairApplyState,
          postRepairVerificationState:
            turn.verification.repairVerdictTerminalProjection.postRepairVerificationState,
          missingProofItems:
            turn.verification.repairVerdictTerminalProjection.missingProofItems,
          terminalSuccessClaim: false,
        },
        turn.verification.repairVerdictTerminalProjection.notProvenClaims,
        [turn.verification.repairVerdictTerminalProjection.projectionId],
      );
    }
    if (turn.finalization) {
      append(
        "loop-finalization",
        "loop-finalization-observed",
        {
          turn: turn.turn,
          inputId: turn.finalization.input.inputId,
          resultProjectionId: turn.finalization.input.resultProjectionId,
          resultTerminalStatus: turn.finalization.input.resultTerminalStatus,
          proofComplete: turn.finalization.input.proofComplete,
          decisionId: turn.finalization.decision.decisionId,
          decision: turn.finalization.decision.decision,
          nextAction: turn.finalization.decision.nextAction,
          pendingUserAuthority: turn.finalization.decision.pendingUserAuthority,
          pendingVerification: turn.finalization.decision.pendingVerification,
          pendingRepair: turn.finalization.decision.pendingRepair,
          originalVerificationFailureId:
            turn.finalization.decision.originalVerificationFailureId,
          originalFailureClass: turn.finalization.decision.originalFailureClass,
          missingProofItems: turn.finalization.decision.missingProofItems,
          terminalSuccessClaim: false,
        },
        turn.finalization.decision.notProvenClaims,
        [turn.finalization.decision.decisionId],
      );
      append(
        "product-loop-closeout",
        "product-loop-closeout-projected",
        {
          turn: turn.turn,
          closeoutId: turn.finalization.closeout.closeoutId,
          sourceInputId: turn.finalization.closeout.sourceInputId,
          status: turn.finalization.closeout.status,
          resultOwnedTerminalStatus:
            turn.finalization.closeout.resultOwnedTerminalStatus,
          resultOwnedTerminalClassification:
            turn.finalization.closeout.resultOwnedTerminalClassification,
          loopOwnedControlDecision:
            turn.finalization.closeout.loopOwnedControlDecision,
          complete: turn.finalization.closeout.complete,
          nextAction: turn.finalization.closeout.nextAction,
          pendingHandoff: turn.finalization.closeout.pendingHandoff,
          sessionCarryForwardFacts:
            turn.finalization.closeout.sessionCarryForwardFacts,
          originalFailureSummary:
            turn.finalization.closeout.originalFailureSummary,
          repairChainSummary: turn.finalization.closeout.repairChainSummary,
          verificationSummary: turn.finalization.closeout.verificationSummary,
          missingProofItems: turn.finalization.closeout.missingProofItems,
          terminalSuccessClaim: false,
        },
        turn.finalization.closeout.notProvenClaims,
        [turn.finalization.closeout.closeoutId],
      );
      append(
        "product-completion-packet",
        "product-completion-packet-observed",
        {
          turn: turn.turn,
          packetId: turn.finalization.completionPacket.packetId,
          resultProjectionId:
            turn.finalization.completionPacket.resultProjectionId,
          resultOwnedTerminalStatus:
            turn.finalization.completionPacket.resultOwnedTerminalStatus,
          loopDecision: turn.finalization.completionPacket.loopDecision,
          closeoutState: turn.finalization.completionPacket.closeoutState,
          status: turn.finalization.completionPacket.status,
          complete: turn.finalization.completionPacket.complete,
          originalFailure: turn.finalization.completionPacket.originalFailure,
          repairRequiredFacts:
            turn.finalization.completionPacket.repairRequiredFacts,
          proposalFacts: turn.finalization.completionPacket.proposalFacts,
          authorityFacts: turn.finalization.completionPacket.authorityFacts,
          applyObservationFacts:
            turn.finalization.completionPacket.applyObservationFacts,
          postRepairVerificationFacts:
            turn.finalization.completionPacket.postRepairVerificationFacts,
          missingProofItems:
            turn.finalization.completionPacket.missingProofItems,
          nextAction: turn.finalization.completionPacket.nextAction,
          terminalSuccessClaim: false,
        },
        turn.finalization.completionPacket.notProvenClaims,
        [turn.finalization.completionPacket.packetId],
      );
    }
  }

  if (input.providerRegistry) {
    append(
      "provider-metadata",
      "loop-provider-boundary-observed",
      {
        registryMode: input.providerRegistry.registryMode,
        providerCount: input.providerRegistry.providers.length,
        modelCount: input.providerRegistry.models.length,
        providerDefaultEnablement: input.providerRegistry.providerDefaultEnablement,
      },
      input.providerRegistry.notProvenClaims,
      [
        ...input.providerRegistry.providers.map((provider) => provider.providerId),
        ...input.providerRegistry.models.map((model) => model.modelId),
      ],
    );
  }

  for (const decision of input.toolPolicyDecisions ?? []) {
    append(
      "before-tool-policy",
      "loop-tool-policy-observed",
      {
        decisionId: decision.decisionId,
        toolId: decision.intent.toolId,
        status: decision.status,
        authorityRequirement: decision.authorityRequirement,
        policySource: decision.policySource,
      },
      decision.notProvenClaims,
      [decision.decisionId],
    );
  }

  for (const annotation of input.toolResultAnnotations ?? []) {
    append(
      "after-tool-annotation",
      "loop-tool-result-observed",
      {
        annotationId: annotation.annotationId,
        decisionId: annotation.decisionId,
        toolId: annotation.toolId,
        resultStatus: annotation.resultStatus,
        blockedFollowUp: annotation.blockedFollowUp,
      },
      annotation.notProvenClaims,
      [annotation.annotationId],
    );
  }

  if (input.sessionProjection) {
    append(
      "session-active-path",
      "loop-session-context-projected",
      {
        sessionIdentity: input.sessionProjection.sessionIdentity,
        activeLeafId: input.sessionProjection.activeLeafId,
        pathLength: input.sessionProjection.activePathProjection.pathLength,
        contextRebuildReadiness:
          input.sessionProjection.activePathProjection.contextRebuildReadiness,
      },
      [
        "terminal-success",
        ...input.sessionProjection.activePathProjection.unsupportedClaims,
      ],
      [input.sessionProjection.activeLeafId],
    );
  }

  if (input.contextRebuildProjection) {
    append(
      "context-rebuild-projection",
      "loop-session-context-projected",
      {
        sessionIdentity: input.contextRebuildProjection.rebuildSource.sessionIdentity,
        activeLeafId: input.contextRebuildProjection.rebuildSource.activeLeafId,
        activePathEntriesConsidered:
          input.contextRebuildProjection.activePathEntriesConsidered.length,
        missingFacts: input.contextRebuildProjection.missingFacts,
        missingRequiredFacts: input.contextRebuildProjection.missingRequiredFacts,
        missingOptionalFacts: input.contextRebuildProjection.missingOptionalFacts,
        excludedUnsafeFacts: input.contextRebuildProjection.excludedUnsafeFacts,
        staleFacts: input.contextRebuildProjection.staleFacts,
        unsupportedBranchFacts: input.contextRebuildProjection.unsupportedBranchFacts,
        unsupportedCompactionFacts: input.contextRebuildProjection.unsupportedCompactionFacts,
      },
      input.contextRebuildProjection.notProvenClaims,
      [input.contextRebuildProjection.rebuildSource.activeLeafId],
    );
  }

  if (input.contextRebuildInput) {
    append(
      "context-rebuild-input",
      "context-rebuild-input-prepared",
      {
        rebuildInputId: input.contextRebuildInput.rebuildInputId,
        sourceSessionId: input.contextRebuildInput.sourceSessionId,
        activePathProjectionId: input.contextRebuildInput.activePathProjectionId,
        nextTurnBundleId: input.contextRebuildInput.nextTurnBundleId,
        savePointId: input.contextRebuildInput.savePointId,
        missingFacts: input.contextRebuildInput.missingFacts,
        terminalSuccessClaim: false,
      },
      input.contextRebuildInput.notProvenClaims,
      [input.contextRebuildInput.rebuildInputId],
    );
  }

  if (input.continuationReadiness) {
    append(
      "continuation-readiness",
      "continuation-readiness-evaluated",
      {
        readinessId: input.continuationReadiness.readinessId,
        status: input.continuationReadiness.status,
        requiredMissingFacts: input.continuationReadiness.requiredMissingFacts,
        optionalMissingFacts: input.continuationReadiness.optionalMissingFacts,
        staleFacts: input.continuationReadiness.staleFacts,
        nextTurnExecuted: input.continuationReadiness.nextTurnExecuted,
        terminalSuccessClaim: false,
      },
      input.continuationReadiness.notProvenClaims,
      [input.continuationReadiness.readinessId],
    );
    append(
      "branch-gap",
      "branch-unsupported",
      {
        readinessId: input.continuationReadiness.readinessId,
        branchGapStatus: input.continuationReadiness.branchGapStatus,
        terminalSuccessClaim: false,
      },
      input.continuationReadiness.notProvenClaims,
      [input.continuationReadiness.readinessId],
    );
    append(
      "compaction-gap",
      "compaction-unsupported",
      {
        readinessId: input.continuationReadiness.readinessId,
        compactionGapStatus: input.continuationReadiness.compactionGapStatus,
        terminalSuccessClaim: false,
      },
      input.continuationReadiness.notProvenClaims,
      [input.continuationReadiness.readinessId],
    );
  }

  if (input.replaySafeLoopStateSummary) {
    append(
      "replay-safe-loop-state",
      "replay-safe-loop-state-summarized",
      {
        summaryId: input.replaySafeLoopStateSummary.summaryId,
        sourceSessionId: input.replaySafeLoopStateSummary.sourceSessionId,
        activePathId: input.replaySafeLoopStateSummary.activePathId,
        latestSavePointId: input.replaySafeLoopStateSummary.latestSavePointId,
        nextTurnBundleId: input.replaySafeLoopStateSummary.nextTurnBundleId,
        contextRebuildProjectionId:
          input.replaySafeLoopStateSummary.contextRebuildProjectionId,
        continuationReadinessId:
          input.replaySafeLoopStateSummary.continuationReadinessId,
        terminalSuccessClaim: false,
      },
      input.replaySafeLoopStateSummary.notProvenClaims,
      [input.replaySafeLoopStateSummary.summaryId],
    );
  }

  if (input.resourceProjection || input.packageInventory) {
    append(
      "package-resource-inventory",
      "loop-session-context-projected",
      {
        resourceCount: input.resourceProjection?.resources.length ?? 0,
        packageCount: input.packageInventory?.packages.length ?? 0,
        dynamicDiscovery:
          input.resourceProjection?.dynamicDiscovery ??
            input.packageInventory?.dynamicDiscovery,
        packageLoading:
          input.resourceProjection?.packageLoading ??
            input.packageInventory?.packageLoading,
      },
      [
        "terminal-success",
        ...(input.resourceProjection?.notProvenClaims ?? []),
        ...(input.packageInventory?.notProvenClaims ?? []),
      ],
    );
  }

  append(
    "runtime-events",
    input.loop?.state === "stopped" || input.loop?.state === "failed" ||
        input.loop?.state === "aborted"
      ? "loop-stopped"
      : "loop-waiting",
    {
      loopState: input.loop?.state ?? "not-observed",
      eventCount: events.length,
      terminalSuccessClaim: false,
    },
    ["terminal-success"],
  );

  if (input.resultFacts) {
    append(
      "result-facts",
      "loop-stopped",
      {
        status: input.resultFacts.status,
        terminalClassification: input.resultFacts.terminalClassification,
        terminalReason: input.resultFacts.terminalReason,
        verdictSource: input.resultFacts.verdictSource ?? "unknown",
      },
      ["terminal-success"],
    );
  }

  const productSurfaceSectionIds = Object.freeze([
    ...new Set([
      ...LOOP_PRODUCT_SURFACE_SECTION_IDS,
      ...(input.productSurfaceSectionIds ?? []),
    ].map((id) => sanitizeText(id).value)),
  ]);
  append(
    "product-surface",
    "loop-product-surface-projected",
    {
      sectionIds: productSurfaceSectionIds,
      terminalSuccessClaim: false,
    },
    ["terminal-success", "product-surface-rendered-is-not-success"],
    productSurfaceSectionIds,
  );

  append(
    "not-proven-claims",
    "loop-stopped",
    {
      claimCount: Array.from(observed.values()).flatMap((item) => item.notProvenClaims).length,
      terminalSuccessClaim: false,
    },
    ["terminal-success"],
  );

  const jsonEventStream = projectJsonRuntimeEventStream({
    streamId: `loop-trajectory:${loopId.value}`,
    events,
  });
  observed.set("json-event-stream", {
    sourceIds: Object.freeze([`loop-trajectory:${loopId.value}`]),
    eventIds: Object.freeze(jsonEventStream.map((entry) => entry.eventId)),
    notProvenClaims: Object.freeze(["terminal-success"]),
  });

  const stages = infrastructureMap.entries.map((mapEntry): LoopTrajectoryStage => {
    const match = observed.get(mapEntry.category);
    const observationStatus: LoopTrajectoryStageStatus = match
      ? mapEntry.connectionStatus === "partial" ? "partial" : "observed"
      : mapEntry.connectionStatus === "unsupported"
        ? "unsupported"
        : "not_proven";
    return {
      category: mapEntry.category,
      ownerDomain: mapEntry.ownerDomain,
      connectionStatus: mapEntry.connectionStatus,
      observationStatus,
      sourceIds: match?.sourceIds ?? [],
      eventIds: match?.eventIds ?? [],
      notProvenClaims: Object.freeze([
        ...new Set([
          ...mapEntry.notProvenClaims,
          ...(match?.notProvenClaims ?? [`${mapEntry.category}-not-observed`]),
        ]),
      ]),
      terminalSuccessClaim: false,
    };
  });

  const turnIds = turns.map((turn) => `turn:${turn.turn}`);
  const receiptIds = turns.flatMap((turn) =>
    turn.toolResultBatch?.executionReceipts.map((receipt) => receipt.receiptId) ?? []
  );
  const toolPolicyIds = [
    ...(input.toolPolicyDecisions ?? []).map((item) => item.decisionId),
    ...turns.flatMap((turn) =>
      turn.toolResultBatch?.dispatchPlan?.calls.map((item) =>
        item.beforePolicyDecision.decisionId
      ) ?? []
    ),
  ];
  const toolResultMessageIds = turns.flatMap((turn) =>
    turn.toolResultBatch?.resultMessages?.messages.map((message) => message.messageId) ?? []
  );
  const nextTurnBundleIds = turns.flatMap((turn) =>
    turn.nextTurn.bundle ? [turn.nextTurn.bundle.bundleId] : []
  );
  const steeringMessageIds = turns.flatMap((turn) =>
    turn.nextTurn.steeringQueue.items.map((item) => item.steeringId)
  );
  const followUpMessageIds = turns.flatMap((turn) =>
    turn.nextTurn.followUpQueue.items.map((item) => item.followUpId)
  );
  const deliveryPolicyIds = turns.map((turn) => turn.nextTurn.deliveryPolicy.policyId);
  const verificationIntentIds = turns.map((turn) => turn.verification.intent.intentId);
  const verificationResultIds = turns.map((turn) => turn.verification.result.verificationId);
  const postRepairVerificationRequirementIds = turns.flatMap((turn) =>
    turn.verification.postRepairVerificationRequirement
      ? [turn.verification.postRepairVerificationRequirement.requirementId]
      : []
  );
  const postRepairVerificationRequestIds = turns.flatMap((turn) =>
    turn.verification.postRepairVerificationRequest
      ? [turn.verification.postRepairVerificationRequest.requestId]
      : []
  );
  const postRepairVerificationResultIds = turns.flatMap((turn) =>
    turn.verification.postRepairVerificationResult
      ? [turn.verification.postRepairVerificationResult.resultId]
      : []
  );
  const repairVerdictProofInputIds = turns.flatMap((turn) =>
    turn.verification.repairVerdictProofInput
      ? [turn.verification.repairVerdictProofInput.proofInputId]
      : []
  );
  const repairVerdictTerminalProjectionIds = turns.flatMap((turn) =>
    turn.verification.repairVerdictTerminalProjection
      ? [turn.verification.repairVerdictTerminalProjection.projectionId]
      : []
  );
  const loopFinalizationDecisionIds = turns.flatMap((turn) =>
    turn.finalization ? [turn.finalization.decision.decisionId] : []
  );
  const productLoopCloseoutIds = turns.flatMap((turn) =>
    turn.finalization ? [turn.finalization.closeout.closeoutId] : []
  );
  const productCompletionPacketIds = turns.flatMap((turn) =>
    turn.finalization ? [turn.finalization.completionPacket.packetId] : []
  );
  const repairHandoffIds = turns.flatMap((turn) =>
    turn.verification.repairRequired ? [turn.verification.repairRequired.handoffId] : []
  );
  const repairProposalIds = turns.flatMap((turn) =>
    turn.verification.repairProposal ? [turn.verification.repairProposal.proposalId] : []
  );
  const repairApplyIds = turns.flatMap((turn) =>
    turn.verification.repairApply ? [turn.verification.repairApply.repairApplyId] : []
  );

  return deepFreeze({
    loopId: loopId.value,
    turnIds: Object.freeze(turnIds),
    snapshotIds: Object.freeze(turns.map((turn) => turn.snapshot.id)),
    eventIds: Object.freeze(events.map((event) => event.id)),
    receiptIds: Object.freeze(receiptIds),
    toolPolicyIds: Object.freeze(Array.from(new Set(toolPolicyIds))),
    toolResultMessageIds: Object.freeze(Array.from(new Set(toolResultMessageIds))),
    savePointIds: Object.freeze(turns.map((turn) => turn.savePoint.id)),
    nextTurnBundleIds: Object.freeze(Array.from(new Set(nextTurnBundleIds))),
    steeringMessageIds: Object.freeze(Array.from(new Set(steeringMessageIds))),
    followUpMessageIds: Object.freeze(Array.from(new Set(followUpMessageIds))),
    deliveryPolicyIds: Object.freeze(Array.from(new Set(deliveryPolicyIds))),
    verificationIntentIds: Object.freeze(Array.from(new Set(verificationIntentIds))),
    verificationResultIds: Object.freeze(Array.from(new Set(verificationResultIds))),
    postRepairVerificationRequirementIds: Object.freeze(
      Array.from(new Set(postRepairVerificationRequirementIds)),
    ),
    postRepairVerificationRequestIds: Object.freeze(
      Array.from(new Set(postRepairVerificationRequestIds)),
    ),
    postRepairVerificationResultIds: Object.freeze(
      Array.from(new Set(postRepairVerificationResultIds)),
    ),
    repairVerdictProofInputIds: Object.freeze(Array.from(new Set(repairVerdictProofInputIds))),
    repairVerdictTerminalProjectionIds: Object.freeze(
      Array.from(new Set(repairVerdictTerminalProjectionIds)),
    ),
    loopFinalizationDecisionIds: Object.freeze(
      Array.from(new Set(loopFinalizationDecisionIds)),
    ),
    productLoopCloseoutIds: Object.freeze(
      Array.from(new Set(productLoopCloseoutIds)),
    ),
    productCompletionPacketIds: Object.freeze(
      Array.from(new Set(productCompletionPacketIds)),
    ),
    repairHandoffIds: Object.freeze(Array.from(new Set(repairHandoffIds))),
    repairProposalIds: Object.freeze(Array.from(new Set(repairProposalIds))),
    repairApplyIds: Object.freeze(Array.from(new Set(repairApplyIds))),
    sessionProjectionIds: Object.freeze(input.sessionProjection ? [
      input.sessionProjection.sessionIdentity,
      input.sessionProjection.activeLeafId,
    ] : []),
    contextRebuildInputIds: Object.freeze(input.contextRebuildInput ? [
      input.contextRebuildInput.rebuildInputId,
    ] : []),
    contextRebuildProjectionIds: Object.freeze(input.contextRebuildProjection ? [
      input.contextRebuildProjection.rebuildSource.activeLeafId,
    ] : []),
    continuationReadinessIds: Object.freeze(input.continuationReadiness ? [
      input.continuationReadiness.readinessId,
    ] : []),
    replaySafeLoopStateSummaryIds: Object.freeze(input.replaySafeLoopStateSummary ? [
      input.replaySafeLoopStateSummary.summaryId,
    ] : []),
    providerMetadataIds: Object.freeze(input.providerRegistry ? [
      ...input.providerRegistry.providers.map((provider) => provider.providerId),
      ...input.providerRegistry.models.map((model) => model.modelId),
    ] : []),
    productSurfaceSectionIds,
    stages: Object.freeze(stages),
    events: Object.freeze(events),
    jsonEventStream,
    finalObservedFacts: {
      loopState: input.loop?.state,
      stopReason: input.loop?.stopReason,
      failureClass: input.loop?.failureClass,
      resultStatus: input.resultFacts?.status,
      terminalClassification: input.resultFacts?.terminalClassification,
      terminalReason: input.resultFacts?.terminalReason,
      terminalSuccessClaim: false,
    },
    notProvenClaims: Object.freeze([
      ...new Set(stages.flatMap((stage) => stage.notProvenClaims)),
    ]),
    redaction: {
      status: redacted || events.some((event) => event.redaction.status === "redacted")
        ? "redacted"
        : "report-safe",
      excluded: REDACTION_EXCLUSIONS,
    },
    terminalSuccessClaim: false,
  });

  function appendReceipt(receipt: RuntimeExecutionReceiptProjection) {
    append(
      "execution-receipt",
      "loop-execution-receipt-observed",
      {
        receiptId: receipt.receiptId,
        turnSnapshotId: receipt.turnSnapshotId,
        savePointId: receipt.savePointId,
        operationKind: receipt.operationKind,
        executionStatus: receipt.executionStatus,
        exitCode: receipt.exitCode,
        errorClass: receipt.errorClass,
      },
      receipt.notProvenClaims,
      [receipt.receiptId],
    );
  }
}

function summarizeText(value: string): string {
  return value.length > 120 ? `${value.slice(0, 120)}...` : value;
}

function sanitizeText(value: string): { readonly value: string; readonly redacted: boolean } {
  const before = value;
  const sanitized = value
    .replace(/\/home\/wang\/\.private-agents-real[^\s"'`]*/g, "[redacted-real-provider-home]")
    .replace(/\b(Bearer)\s+[A-Za-z0-9._~+/=-]+/gi, "$1 [redacted]")
    .replace(/\b(api[_-]?key|token|secret|cookie|authorization|password)\b\s*[:=]\s*\S+/gi, "$1=[redacted]")
    .replace(/\b(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, "[secret-redacted]")
    .replace(/\bprovider\.env\b[^\n\r]*/gi, "provider.env=[redacted]")
    .replace(/\boldText[:=][\s\S]*?(?=\snewText[:=]|$)/gi, "oldText=[raw-content-excluded]")
    .replace(/\bnewText[:=][^\n\r]*/gi, "newText=[raw-content-excluded]")
    .replace(/\braw provider output[:=][^\n\r]*/gi, "raw-provider-output=[raw-content-excluded]")
    .replace(/\bhidden reasoning[:=]?[^\n\r]*/gi, "hidden-reasoning=[raw-content-excluded]")
    .replace(/<html[\s\S]*?<\/html>/gi, "[raw-content-excluded]");
  return { value: sanitized, redacted: sanitized !== before };
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") {
    return sanitizeText(value).value;
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      if (nested !== undefined && typeof nested !== "function") {
        output[key] = sanitizeValue(nested);
      }
    }
    return output;
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    return null;
  }
  return value;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
  }
  return value;
}
