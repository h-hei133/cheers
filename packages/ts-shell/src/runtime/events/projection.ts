import type { RuntimeEvidenceSavePoint } from "../../evidence/runtimeSavePoint.js";
import type { LoopContextRebuildInput } from "../../context/rebuildInput.js";
import type {
  RepairApplyObservation,
  RepairProposalObservation,
  RepairRequiredHandoff,
} from "../../repair/loopBoundary.js";
import type { SessionContextRebuildProjection } from "../../context/sessionContextRebuildProjection.js";
import type { ModelResponseBoundary } from "../../provider/response/boundary.js";
import type { ExtensionHookPolicyOutcome } from "../extensions/lifecycle.js";
import type { StaticResourceProjection } from "../resources/projection.js";
import type { PackageInventoryProjection } from "../resources/inventory.js";
import type { SessionTreeProjection } from "../../session/sessionTreeProjection.js";
import type { ContinuationReadinessProjection } from "../../session/continuationReadiness.js";
import type { ReplaySafeLoopStateSummary } from "../../session/replaySafeLoopState.js";
import type { AssistantResponseState } from "../../turn/assistantResponse.js";
import type { NextTurnDeliveryPolicyProjection } from "../../turn/deliveryPolicy.js";
import type { FollowUpQueueProjection } from "../../turn/followUpQueue.js";
import type { NextTurnBundleProjection } from "../../turn/nextTurnBundle.js";
import type { SteeringQueueProjection } from "../../turn/steeringQueue.js";
import type { NormalizedToolCallBatch } from "../../tools/toolCallBatch.js";
import type {
  ToolBatchDispatchPlan,
  ToolResultDetail,
} from "../../tools/toolBatchDispatch.js";
import type { ToolResultMessageBatch } from "../../turn/toolResultMessage.js";
import type { ToolExecutionResult } from "../../tools/types.js";
import type {
  ToolAfterObservationAnnotation,
  ToolBeforePolicyDecision,
} from "../../tools/policy/interception.js";
import type { RuntimeTurnSnapshot } from "../../turn/turnSnapshot.js";
import type { RuntimeExecutionReceiptProjection } from "../execution/receipt.js";
import type {
  VerificationLoopIntent,
  VerificationResultObservation,
} from "../../verification/loopBoundary.js";
import type { ProductLoopAdapterProjection } from "../loop/adapter.js";

export type RuntimeProjectionEventType =
  | "turn-snapshot-observed"
  | "phase-observed"
  | "execution-receipt-observed"
  | "tool-result-observed"
  | "tool-policy-decision-observed"
  | "tool-authority-requested"
  | "tool-call-blocked"
  | "tool-result-annotated"
  | "tool-interception-unsupported"
  | "save-point-observed"
  | "result-facts-observed"
  | "resource-projection-observed"
  | "package-inventory-observed"
  | "package-conflict-observed"
  | "extension-hook-policy-observed"
  | "session-projection-observed"
  | "session-active-path-projected"
  | "session-branch-summary-observed"
  | "session-compaction-observed"
  | "session-context-rebuild-projected"
  | "context-rebuild-input-prepared"
  | "continuation-readiness-evaluated"
  | "replay-safe-loop-state-summarized"
  | "unsafe-context-blocked"
  | "missing-required-facts-blocked"
  | "missing-optional-facts-observed"
  | "branch-unsupported"
  | "compaction-unsupported"
  | "terminal-verdict-observed"
  | "model-response-boundary-observed"
  | "assistant-response-accumulated"
  | "tool-call-batch-extracted"
  | "tool-call-extraction-failed"
  | "tool-batch-dispatch-planned"
  | "before-tool-policy-decided"
  | "tool-call-authority-required"
  | "tool-call-dispatched"
  | "tool-result-message-prepared"
  | "tool-batch-save-point-observed"
  | "post-tool-save-point-observed"
  | "next-turn-bundle-prepared"
  | "steering-queued"
  | "steering-delivered"
  | "follow-up-queued"
  | "follow-up-delivered"
  | "next-turn-delivery-policy-evaluated"
  | "next-turn-waiting"
  | "next-turn-delivery-unsupported"
  | "next-turn-abandoned"
  | "verification-intent-planned"
  | "verification-selected"
  | "verification-dispatched"
  | "verification-result-observed"
  | "verification-relevance-rejected"
  | "repair-required"
  | "repair-proposal-observed"
  | "repair-authority-required"
  | "repair-apply-observed"
  | "post-repair-verification-observed"
  | "original-failure-preserved"
  | "tool-dispatch-not-run"
  | "agent-loop-started"
  | "agent-loop-state-transitioned"
  | "agent-loop-turn-started"
  | "agent-loop-model-boundary-observed"
  | "agent-loop-tool-call-batch-observed"
  | "agent-loop-tool-result-batch-observed"
  | "agent-loop-save-point-requested"
  | "agent-loop-next-turn-prepared"
  | "agent-loop-delivery-queued"
  | "agent-loop-delivery-delivered"
  | "agent-loop-stopped"
  | "agent-loop-aborted"
  | "agent-loop-failed"
  | "loop-input-observed"
  | "loop-turn-snapshot-observed"
  | "loop-provider-boundary-observed"
  | "loop-tool-policy-observed"
  | "loop-tool-result-observed"
  | "loop-execution-receipt-observed"
  | "loop-save-point-observed"
  | "loop-next-turn-prepared"
  | "loop-steering-queue-observed"
  | "loop-follow-up-queue-observed"
  | "loop-next-turn-delivery-policy-observed"
  | "loop-verification-intent-observed"
  | "loop-verification-result-observed"
  | "loop-repair-handoff-observed"
  | "loop-session-context-projected"
  | "loop-product-surface-projected"
  | "product-loop-adapter-observed"
  | "loop-stopped"
  | "loop-waiting";

export interface RuntimeProjectionEvent {
  readonly id: string;
  readonly sequence: number;
  readonly type: RuntimeProjectionEventType;
  readonly facts: Record<string, unknown>;
  readonly notProvenClaims: readonly string[];
  readonly redaction: {
    readonly status: "report-safe" | "redacted";
    readonly excluded: readonly string[];
  };
}

export interface RuntimeResultFactsProjection {
  readonly status?: string;
  readonly terminalClassification?: string;
  readonly terminalReason?: string;
  readonly verdictSource?: "result" | "evidence" | "unknown";
}

export function projectRuntimeEvents(input: {
  readonly turnSnapshot?: RuntimeTurnSnapshot;
  readonly executionReceipts?: readonly RuntimeExecutionReceiptProjection[];
  readonly toolResults?: readonly ToolExecutionResult[];
  readonly toolPolicyDecisions?: readonly ToolBeforePolicyDecision[];
  readonly toolResultAnnotations?: readonly ToolAfterObservationAnnotation[];
  readonly toolDispatchPlans?: readonly ToolBatchDispatchPlan[];
  readonly toolResultDetails?: readonly ToolResultDetail[];
  readonly toolResultMessages?: readonly ToolResultMessageBatch[];
  readonly nextTurnBundles?: readonly NextTurnBundleProjection[];
  readonly steeringQueues?: readonly SteeringQueueProjection[];
  readonly followUpQueues?: readonly FollowUpQueueProjection[];
  readonly nextTurnDeliveryPolicies?: readonly NextTurnDeliveryPolicyProjection[];
  readonly verificationIntents?: readonly VerificationLoopIntent[];
  readonly verificationResults?: readonly VerificationResultObservation[];
  readonly repairRequiredHandoffs?: readonly RepairRequiredHandoff[];
  readonly repairProposals?: readonly RepairProposalObservation[];
  readonly repairApplyObservations?: readonly RepairApplyObservation[];
  readonly modelResponseBoundaries?: readonly ModelResponseBoundary[];
  readonly assistantResponses?: readonly AssistantResponseState[];
  readonly toolCallBatches?: readonly NormalizedToolCallBatch[];
  readonly savePoint?: RuntimeEvidenceSavePoint;
  readonly resultFacts?: RuntimeResultFactsProjection;
  readonly resourceProjection?: StaticResourceProjection;
  readonly packageInventory?: PackageInventoryProjection;
  readonly hookPolicyOutcomes?: readonly ExtensionHookPolicyOutcome[];
  readonly sessionProjection?: SessionTreeProjection;
  readonly contextRebuildProjection?: SessionContextRebuildProjection;
  readonly contextRebuildInputs?: readonly LoopContextRebuildInput[];
  readonly continuationReadiness?: readonly ContinuationReadinessProjection[];
  readonly replaySafeLoopStateSummaries?: readonly ReplaySafeLoopStateSummary[];
  readonly productLoopAdapters?: readonly ProductLoopAdapterProjection[];
}): readonly RuntimeProjectionEvent[] {
  const events: RuntimeProjectionEvent[] = [];
  const append = (
    type: RuntimeProjectionEventType,
    facts: Record<string, unknown>,
    notProvenClaims: readonly string[],
  ) => {
    const sequence = events.length + 1;
    const sanitized = sanitizeRecord(facts);
    events.push(
      deepFreeze({
        id: `runtime-event-${sequence}`,
        sequence,
        type,
        facts: sanitized.value,
        notProvenClaims,
        redaction: {
          status: sanitized.redacted ? "redacted" : "report-safe",
          excluded: REDACTION_EXCLUSIONS,
        },
      }),
    );
  };
  const appendToolPolicyDecision = (decision: ToolBeforePolicyDecision) => {
    const facts = {
      decisionId: decision.decisionId,
      interceptionId: decision.intent.interceptionId,
      toolId: decision.intent.toolId,
      toolKind: decision.intent.toolKind,
      caller: decision.intent.caller,
      operationKind: decision.intent.operationKind,
      decisionStatus: decision.status,
      policySource: decision.policySource,
      authorityMode: decision.intent.authorityMode,
      authorityRequirement: decision.authorityRequirement,
      riskLevel: decision.intent.riskLevel,
      redactionStatus: decision.redactionStatus,
      hookPolicyOutcomeCount: decision.hookPolicyOutcomes.length,
      forbiddenOutcomeCount: decision.forbiddenOutcomes.length,
      terminalSuccessClaim: false,
    };
    append("tool-policy-decision-observed", facts, decision.notProvenClaims);

    if (decision.status === "request_authority") {
      append(
        "tool-authority-requested",
        facts,
        decision.notProvenClaims,
      );
    }
    if (decision.status === "block" || decision.status === "rejected") {
      append("tool-call-blocked", facts, decision.notProvenClaims);
    }
    if (decision.status === "unsupported") {
      append(
        "tool-interception-unsupported",
        facts,
        decision.notProvenClaims,
      );
    }
  };

  if (input.turnSnapshot) {
    append(
      "turn-snapshot-observed",
      {
        snapshotId: input.turnSnapshot.id,
        sessionId: input.turnSnapshot.sessionId,
        turn: input.turnSnapshot.turn,
        phase: input.turnSnapshot.phase,
        providerMode: input.turnSnapshot.provider.mode,
        providerOptIn: input.turnSnapshot.provider.optIn,
        executionBoundaryMode: input.turnSnapshot.executionBoundaryMode,
      },
      ["terminal-success"],
    );
    append(
      "phase-observed",
      {
        snapshotId: input.turnSnapshot.id,
        phase: input.turnSnapshot.phase,
      },
      ["terminal-success"],
    );
  }

  for (const boundary of input.modelResponseBoundaries ?? []) {
    append(
      "model-response-boundary-observed",
      {
        responseId: boundary.responseId,
        turnId: boundary.turnId,
        providerMode: boundary.providerMode,
        providerSafeLabel: boundary.providerSafeLabel,
        modelSafeLabel: boundary.modelSafeLabel,
        responseSource: boundary.source,
        responseStatus: boundary.status,
        assistantContentSummary: boundary.assistantContentSummary,
        toolCallCount: boundary.toolCallCount,
        redactionStatus: boundary.redaction.status,
        terminalSuccessClaim: false,
      },
      boundary.notProvenClaims,
    );
  }

  for (const response of input.assistantResponses ?? []) {
    append(
      "assistant-response-accumulated",
      {
        responseId: response.responseId,
        turnId: response.turnId,
        chunkCount: response.chunkCount,
        textDeltaCount: response.textDeltaCount,
        contentSummary: response.contentSummary,
        toolCallCandidateCount: response.toolCallCandidates.length,
        accumulationStatus: response.accumulationStatus,
        redactionStatus: response.redaction.status,
        terminalSuccessClaim: false,
      },
      response.notProvenClaims,
    );
  }

  for (const batch of input.toolCallBatches ?? []) {
    append(
      batch.extractionStatus === "failed"
        ? "tool-call-extraction-failed"
        : "tool-call-batch-extracted",
      {
        batchId: batch.batchId,
        responseId: batch.responseId,
        turnId: batch.turnId,
        extractionStatus: batch.extractionStatus,
        dispatchStatus: batch.dispatchStatus,
        toolCallCount: batch.calls.length,
        malformedCallCount: batch.malformedCallCount,
        unsupportedCallCount: batch.unsupportedCallCount,
        toolNames: batch.calls.map((call) => call.name),
        redactionStatus: batch.redaction.status,
        terminalSuccessClaim: false,
      },
      batch.notProvenClaims,
    );
    append(
      "tool-dispatch-not-run",
      {
        batchId: batch.batchId,
        responseId: batch.responseId,
        dispatchStatus: batch.dispatchStatus,
        toolCallCount: batch.calls.length,
        terminalSuccessClaim: false,
      },
      batch.notProvenClaims,
    );
  }

  for (const plan of input.toolDispatchPlans ?? []) {
    append(
      "tool-batch-dispatch-planned",
      {
        planId: plan.planId,
        batchId: plan.batchId,
        responseId: plan.responseId,
        turnId: plan.turnId,
        dispatchPolicy: plan.dispatchPolicy,
        dispatchStatus: plan.dispatchStatus,
        callCount: plan.calls.length,
        blockedCallIds: plan.blockedCallIds,
        authorityRequiredCallIds: plan.authorityRequiredCallIds,
        unsupportedCallIds: plan.unsupportedCallIds,
        dispatchedCallIds: plan.dispatchedCallIds,
        redactionStatus: plan.redactionStatus,
        terminalSuccessClaim: false,
      },
      plan.notProvenClaims,
    );
    for (const call of plan.calls) {
      const facts = {
        planId: plan.planId,
        batchId: plan.batchId,
        toolCallId: call.toolCallId,
        toolName: call.toolName,
        callStatus: call.callStatus,
        dispatchStatus: call.dispatchStatus,
        decisionId: call.beforePolicyDecision.decisionId,
        decisionStatus: call.beforePolicyDecision.status,
        authorityRequirement: call.authorityRequirement,
        redactionStatus: call.redactionStatus,
        terminalSuccessClaim: false,
      };
      append("before-tool-policy-decided", facts, call.notProvenClaims);
      if (call.dispatchStatus === "authority_required") {
        append("tool-call-authority-required", facts, call.notProvenClaims);
      }
      if (call.dispatchStatus === "blocked") {
        append("tool-call-blocked", facts, call.notProvenClaims);
      }
      if (call.dispatchStatus === "dispatched") {
        append("tool-call-dispatched", facts, call.notProvenClaims);
      }
      if (call.dispatchStatus === "not_dispatched") {
        append("tool-dispatch-not-run", facts, call.notProvenClaims);
      }
    }
  }

  for (const receipt of input.executionReceipts ?? []) {
    append(
      "execution-receipt-observed",
      {
        receiptId: receipt.receiptId,
        turnSnapshotId: receipt.turnSnapshotId,
        savePointId: receipt.savePointId,
        operationKind: receipt.operationKind,
        executionStatus: receipt.executionStatus,
        errorClass: receipt.errorClass,
        exitCode: receipt.exitCode,
        evidenceCorrelationId: receipt.evidenceCorrelationId,
        redactionStatus: receipt.redaction.status,
      },
      receipt.notProvenClaims,
    );
  }

  for (const result of input.toolResults ?? []) {
    append(
      "tool-result-observed",
      {
        resultStatus: result.success
          ? "tool-success-observed"
          : "tool-failure-observed",
        reportSafe: result.reportSafe,
      },
      [
        "terminal-success",
        ...(result.reportSafe?.notProvenClaims ?? []),
      ],
    );
  }

  for (const detail of input.toolResultDetails ?? []) {
    append(
      "tool-result-observed",
      {
        resultDetailsId: detail.resultDetailsId,
        toolCallId: detail.toolCallId,
        toolName: detail.toolName,
        resultStatus: detail.resultStatus,
        contentSummary: detail.contentSummary,
        systemDetails: detail.systemDetails,
        reportSafe: detail.reportSafe,
        redactionStatus: detail.redactionStatus,
        terminalSuccessClaim: false,
      },
      detail.notProvenClaims,
    );
  }

  for (const batch of input.toolResultMessages ?? []) {
    for (const message of batch.messages) {
      append(
        "tool-result-message-prepared",
        {
          batchId: batch.batchId,
          dispatchPlanId: batch.dispatchPlanId,
          messageId: message.messageId,
          role: message.role,
          toolCallId: message.toolCallId,
          toolName: message.toolName,
          deliveryStatus: message.deliveryStatus,
          redactionStatus: message.redactionStatus,
          terminalSuccessClaim: false,
        },
        message.notProvenClaims,
      );
    }
  }

  for (const decision of input.toolPolicyDecisions ?? []) {
    appendToolPolicyDecision(decision);
  }

  for (const annotation of input.toolResultAnnotations ?? []) {
    append(
      "tool-result-annotated",
      {
        annotationId: annotation.annotationId,
        decisionId: annotation.decisionId,
        toolId: annotation.toolId,
        resultStatus: annotation.resultStatus,
        executionReceiptId: annotation.executionReceiptId,
        resultDetailsId: annotation.resultDetailsId,
        redactionStatus: annotation.redactionStatus,
        annotationCount: annotation.annotations.length,
        nextActionSuggestionCount: annotation.nextActionSuggestions.length,
        blockedFollowUp: annotation.blockedFollowUp,
        terminalSuccessClaim: false,
      },
      annotation.notProvenClaims,
    );
  }

  if (input.savePoint) {
    append(
      "save-point-observed",
      {
        savePointId: input.savePoint.id,
        turnSnapshotId: input.savePoint.turnSnapshotId,
        phase: input.savePoint.phase,
        sessionPersistenceStatus: input.savePoint.sessionPersistenceStatus,
        resultProjectionStatus: input.savePoint.resultProjectionStatus,
        terminalSuccessClaim: input.savePoint.terminalSuccessClaim,
        executionReceiptCount: input.savePoint.executionReceipts.length,
      },
      input.savePoint.notProvenClaims,
    );
    if (input.savePoint.safeEvidenceIds.some((id) => id.includes("tool-result-batch"))) {
      append(
        "tool-batch-save-point-observed",
        {
          savePointId: input.savePoint.id,
          turnSnapshotId: input.savePoint.turnSnapshotId,
          safeEvidenceIds: input.savePoint.safeEvidenceIds,
          executionReceiptCount: input.savePoint.executionReceipts.length,
          pendingNextTurnFactCount: input.savePoint.pendingNextTurnFacts.length,
          terminalSuccessClaim: input.savePoint.terminalSuccessClaim,
        },
        input.savePoint.notProvenClaims,
      );
      append(
        "post-tool-save-point-observed",
        {
          savePointId: input.savePoint.id,
          turnSnapshotId: input.savePoint.turnSnapshotId,
          toolResultMessageIds: input.savePoint.toolResultMessageIds,
          toolResultDetailIds: input.savePoint.toolResultDetailIds,
          beforeToolDecisionIds: input.savePoint.beforeToolDecisionIds,
          afterToolAnnotationIds: input.savePoint.afterToolAnnotationIds,
          nextTurnBundleId: input.savePoint.nextTurnBundleId,
          terminalSuccessClaim: input.savePoint.terminalSuccessClaim,
        },
        input.savePoint.notProvenClaims,
      );
    }
  }

  for (const queue of input.steeringQueues ?? []) {
    for (const item of queue.items) {
      append(
        item.deliveryStatus === "delivered" ? "steering-delivered" : "steering-queued",
        {
          queueId: queue.queueId,
          steeringId: item.steeringId,
          source: item.source,
          priority: item.priority,
          safeSummary: item.safeSummary,
          deliveryStatus: item.deliveryStatus,
          redactionStatus: item.redactionStatus,
          terminalSuccessClaim: false,
        },
        item.notProvenClaims,
      );
    }
  }

  for (const queue of input.followUpQueues ?? []) {
    for (const item of queue.items) {
      append(
        item.deliveryStatus === "delivered" ? "follow-up-delivered" : "follow-up-queued",
        {
          queueId: queue.queueId,
          followUpId: item.followUpId,
          source: item.source,
          targetTurnId: item.targetTurnId,
          safeSummary: item.safeSummary,
          deliveryStatus: item.deliveryStatus,
          redactionStatus: item.redactionStatus,
          terminalSuccessClaim: false,
        },
        item.notProvenClaims,
      );
    }
  }

  for (const policy of input.nextTurnDeliveryPolicies ?? []) {
    append(
      "next-turn-delivery-policy-evaluated",
      {
        policyId: policy.policyId,
        bundleId: policy.bundleId,
        deliveryStatus: policy.deliveryStatus,
        entryCount: policy.entries.length,
        providerCalled: policy.providerCalled,
        nextTurnExecuted: policy.nextTurnExecuted,
        terminalSuccessClaim: policy.terminalSuccessClaim,
      },
      policy.notProvenClaims,
    );
    if (policy.deliveryStatus === "waiting") {
      append(
        "next-turn-waiting",
        {
          policyId: policy.policyId,
          bundleId: policy.bundleId,
          terminalSuccessClaim: policy.terminalSuccessClaim,
        },
        policy.notProvenClaims,
      );
    }
    if (policy.deliveryStatus === "unsupported") {
      append(
        "next-turn-delivery-unsupported",
        {
          policyId: policy.policyId,
          bundleId: policy.bundleId,
          terminalSuccessClaim: policy.terminalSuccessClaim,
        },
        policy.notProvenClaims,
      );
    }
    if (policy.deliveryStatus === "abandoned") {
      append(
        "next-turn-abandoned",
        {
          policyId: policy.policyId,
          bundleId: policy.bundleId,
          terminalSuccessClaim: policy.terminalSuccessClaim,
        },
        policy.notProvenClaims,
      );
    }
  }

  for (const bundle of input.nextTurnBundles ?? []) {
    append(
      "next-turn-bundle-prepared",
      {
        bundleId: bundle.bundleId,
        turnId: bundle.turnId,
        sourceToolResultMessageIds: bundle.sourceToolResultMessageIds,
        steeringMessageIds: bundle.steeringMessageIds,
        followUpMessageIds: bundle.followUpMessageIds,
        contextRebuildProjectionId: bundle.contextRebuildProjectionId,
        sessionActivePathId: bundle.sessionActivePathId,
        providerMetadataIds: bundle.providerMetadataIds,
        deliveryPolicyId: bundle.deliveryPolicyId,
        deliveryStatus: bundle.deliveryStatus,
        terminalSuccessClaim: bundle.terminalSuccessClaim,
      },
      bundle.notProvenClaims,
    );
  }

  for (const intent of input.verificationIntents ?? []) {
    append(
      intent.dispatchStatus === "selected"
        ? "verification-selected"
        : intent.dispatchStatus === "dispatched" ||
            intent.dispatchStatus === "passed" ||
            intent.dispatchStatus === "failed"
          ? "verification-dispatched"
          : "verification-intent-planned",
      {
        intentId: intent.intentId,
        sourceTurnId: intent.sourceTurnId,
        targetSummary: intent.targetSummary,
        verificationKind: intent.verificationKind,
        commandCandidateSummary: intent.commandCandidateSummary,
        authorityRequirement: intent.authorityRequirement,
        dispatchStatus: intent.dispatchStatus,
        relevanceStatus: intent.relevanceStatus,
        redactionStatus: intent.redactionStatus,
        terminalSuccessClaim: intent.terminalSuccessClaim,
      },
      intent.notProvenClaims,
    );
  }

  for (const result of input.verificationResults ?? []) {
    append(
      result.status === "relevance_rejected"
        ? "verification-relevance-rejected"
        : "verification-result-observed",
      {
        verificationId: result.verificationId,
        intentId: result.intentId,
        executionReceiptId: result.executionReceiptId,
        status: result.status,
        relevanceStatus: result.relevanceStatus,
        failureClass: result.failureClass,
        safeSummary: result.safeSummary,
        redactionStatus: result.redactionStatus,
        terminalSuccessClaim: result.terminalSuccessClaim,
      },
      result.notProvenClaims,
    );
  }

  for (const handoff of input.repairRequiredHandoffs ?? []) {
    append(
      "repair-required",
      {
        handoffId: handoff.handoffId,
        sourceVerificationId: handoff.sourceVerificationId,
        failureClass: handoff.failureClass,
        repairabilityStatus: handoff.repairabilityStatus,
        suggestedRepairMode: handoff.suggestedRepairMode,
        authorityRequirement: handoff.authorityRequirement,
        redactionStatus: handoff.redactionStatus,
        terminalSuccessClaim: handoff.terminalSuccessClaim,
      },
      handoff.notProvenClaims,
    );
    append(
      "original-failure-preserved",
      {
        handoffId: handoff.handoffId,
        sourceVerificationId: handoff.sourceVerificationId,
        originalFailurePreserved: handoff.originalFailurePreserved,
        terminalSuccessClaim: handoff.terminalSuccessClaim,
      },
      handoff.notProvenClaims,
    );
  }

  for (const proposal of input.repairProposals ?? []) {
    append(
      "repair-proposal-observed",
      {
        proposalId: proposal.proposalId,
        sourceFailureId: proposal.sourceFailureId,
        proposalSource: proposal.proposalSource,
        targetSummary: proposal.targetSummary,
        readinessStatus: proposal.readinessStatus,
        authorityRequirement: proposal.authorityRequirement,
        applyStatus: proposal.applyStatus,
        redactionStatus: proposal.redactionStatus,
        terminalSuccessClaim: proposal.terminalSuccessClaim,
      },
      proposal.notProvenClaims,
    );
    if (proposal.authorityRequirement === "required") {
      append(
        "repair-authority-required",
        {
          proposalId: proposal.proposalId,
          authorityRequirement: proposal.authorityRequirement,
          terminalSuccessClaim: proposal.terminalSuccessClaim,
        },
        proposal.notProvenClaims,
      );
    }
  }

  for (const apply of input.repairApplyObservations ?? []) {
    append(
      "repair-apply-observed",
      {
        repairApplyId: apply.repairApplyId,
        proposalId: apply.proposalId,
        repairApplyStatus: apply.repairApplyStatus,
        repairAuthorityStatus: apply.repairAuthorityStatus,
        originalFailurePreserved: apply.originalFailurePreserved,
        redactionStatus: apply.redactionStatus,
        terminalSuccessClaim: apply.terminalSuccessClaim,
      },
      apply.notProvenClaims,
    );
    append(
      "post-repair-verification-observed",
      {
        repairApplyId: apply.repairApplyId,
        postRepairVerificationStatus: apply.postRepairVerificationStatus,
        terminalSuccessClaim: apply.terminalSuccessClaim,
      },
      apply.notProvenClaims,
    );
  }

  if (input.resultFacts) {
    append(
      "result-facts-observed",
      {
        status: input.resultFacts.status,
        terminalClassification: input.resultFacts.terminalClassification,
        terminalReason: input.resultFacts.terminalReason,
        verdictSource: input.resultFacts.verdictSource ?? "unknown",
        terminalSuccessClaim: false,
      },
      ["terminal-success"],
    );
    append(
      "terminal-verdict-observed",
      {
        terminalClassification: input.resultFacts.terminalClassification,
        terminalReason: input.resultFacts.terminalReason,
        verdictSource: input.resultFacts.verdictSource ?? "unknown",
        terminalSuccessClaim: false,
      },
      ["terminal-success"],
    );
  }

  if (input.resourceProjection) {
    append(
      "resource-projection-observed",
      {
        registryMode: input.resourceProjection.registryMode,
        dynamicDiscovery: input.resourceProjection.dynamicDiscovery,
        packageLoading: input.resourceProjection.packageLoading,
        pluginExecution: input.resourceProjection.pluginExecution,
        providerDefaultEnablement: input.resourceProjection.providerDefaultEnablement,
        resourceCount: input.resourceProjection.resources.length,
        rejectedResourceCount: input.resourceProjection.rejectedResourceCount,
        resourceKinds: input.resourceProjection.resources.map((resource) => resource.kind),
        providerResourceCount: input.resourceProjection.resources.filter(
          (resource) => resource.kind === "provider-metadata",
        ).length,
        extensionManifestCount: input.resourceProjection.resources.filter(
          (resource) => resource.kind === "extension-manifest",
        ).length,
        terminalSuccessClaim: false,
      },
      input.resourceProjection.notProvenClaims,
    );
  }

  if (input.packageInventory) {
    append(
      "package-inventory-observed",
      {
        inventoryMode: input.packageInventory.inventoryMode,
        packageInstallation: input.packageInventory.packageInstallation,
        packageLoading: input.packageInventory.packageLoading,
        dynamicDiscovery: input.packageInventory.dynamicDiscovery,
        pluginExecution: input.packageInventory.pluginExecution,
        scriptExecution: input.packageInventory.scriptExecution,
        networkLookup: input.packageInventory.networkLookup,
        providerDefaultEnablement:
          input.packageInventory.providerDefaultEnablement,
        packageCount: input.packageInventory.packages.length,
        rejectedPackageCount: input.packageInventory.rejectedPackageCount,
        conflictCount: input.packageInventory.conflicts.length,
        enabledPackageCount: input.packageInventory.packages.filter(
          (manifest) => manifest.enabledState === "enabled",
        ).length,
        blockedPackageCount: input.packageInventory.packages.filter(
          (manifest) => manifest.enabledState === "blocked",
        ).length,
        terminalSuccessClaim: false,
      },
      input.packageInventory.notProvenClaims,
    );
    for (const conflict of input.packageInventory.conflicts) {
      append(
        "package-conflict-observed",
        {
          conflictId: conflict.conflictId,
          kind: conflict.kind,
          packageCount: conflict.packageIds.length,
          resourceCount: conflict.resourceIds.length,
          capability: conflict.capability,
          precedenceCount: conflict.precedence.length,
          terminalSuccessClaim: false,
        },
        conflict.notProvenClaims,
      );
    }
  }

  for (const outcome of input.hookPolicyOutcomes ?? []) {
    append(
      "extension-hook-policy-observed",
      {
        hookId: outcome.hookId,
        extensionId: outcome.extensionId,
        eventKind: outcome.eventKind,
        requestedEffect: outcome.requestedEffect,
        acceptedEffect: outcome.acceptedEffect,
        policyStatus: outcome.status,
        reason: outcome.reason,
        redactionStatus: outcome.redaction.status,
        evidenceAnnotationCount: outcome.evidenceAnnotations.length,
        terminalSuccessClaim: outcome.terminalSuccessClaim,
      },
      outcome.notProvenClaims,
    );
  }

  if (input.sessionProjection) {
    append(
      "session-projection-observed",
      {
        sessionIdentity: input.sessionProjection.sessionIdentity,
        activeLeafId: input.sessionProjection.activeLeafId,
        activePathLength: input.sessionProjection.activePath.length,
        treeSupport: input.sessionProjection.treeSupport,
        branchSupport: input.sessionProjection.branchSupport,
        continuationState: input.sessionProjection.continuation.state,
        terminalSuccessClaim: input.sessionProjection.terminal.terminalSuccessClaim,
      },
      input.sessionProjection.terminal.notProvenClaims,
    );
    append(
      "session-active-path-projected",
      {
        sessionIdentity: input.sessionProjection.sessionIdentity,
        activeLeafId: input.sessionProjection.activePathProjection.activeLeafId,
        pathLength: input.sessionProjection.activePathProjection.pathLength,
        entryKinds: input.sessionProjection.activePathProjection.entryKinds,
        redactionStatus: input.sessionProjection.activePathProjection.redactionStatus,
        contextRebuildReadiness:
          input.sessionProjection.activePathProjection.contextRebuildReadiness,
        terminalSuccessClaim: false,
      },
      [
        "terminal-success",
        ...input.sessionProjection.activePathProjection.unsupportedClaims,
      ],
    );
    if (input.sessionProjection.branchSummary.records.length > 0) {
      for (const record of input.sessionProjection.branchSummary.records) {
        append(
          "session-branch-summary-observed",
          {
            branchSummaryId: record.branchSummaryId,
            sourceBranchIdentity: record.sourceBranchIdentity,
            targetLocation: record.targetLocation,
            summaryAvailability: record.summaryAvailability,
            redactionStatus: record.redaction.status,
            terminalSuccessClaim: record.terminalSuccessClaim,
          },
          record.notProvenClaims,
        );
      }
    } else {
      append(
        "branch-unsupported",
        {
          sessionIdentity: input.sessionProjection.sessionIdentity,
          branchSupport: input.sessionProjection.branchSupport,
          availability: input.sessionProjection.branchSummary.availability,
          terminalSuccessClaim: false,
        },
        input.sessionProjection.branchSummary.notProvenClaims,
      );
    }
    if (input.sessionProjection.compaction.records.length > 0) {
      for (const record of input.sessionProjection.compaction.records) {
        append(
          "session-compaction-observed",
          {
            compactionId: record.compactionId,
            sourceActivePathLength: record.sourceActivePath.length,
            firstKeptEntryId: record.firstKeptEntryId,
            summaryAvailability: record.summaryAvailability,
            evidence: record.evidence,
            redactionStatus: record.redaction.status,
            terminalSuccessClaim: record.terminalSuccessClaim,
          },
          record.notProvenClaims,
        );
      }
    } else {
      append(
        "compaction-unsupported",
        {
          sessionIdentity: input.sessionProjection.sessionIdentity,
          availability: input.sessionProjection.compaction.availability,
          terminalSuccessClaim: false,
        },
        input.sessionProjection.compaction.notProvenClaims,
      );
    }
  }

  if (input.contextRebuildProjection) {
    append(
      "session-context-rebuild-projected",
      {
        sessionIdentity:
          input.contextRebuildProjection.rebuildSource.sessionIdentity,
        activeLeafId: input.contextRebuildProjection.rebuildSource.activeLeafId,
        activePathEntriesConsidered:
          input.contextRebuildProjection.activePathEntriesConsidered.length,
        compactionSummariesConsidered:
          input.contextRebuildProjection.compactionSummariesConsidered.length,
        branchSummariesConsidered:
          input.contextRebuildProjection.branchSummariesConsidered.length,
        missingFacts: input.contextRebuildProjection.missingFacts,
        availableContext: input.contextRebuildProjection.availableContext,
        missingRequiredFacts: input.contextRebuildProjection.missingRequiredFacts,
        missingOptionalFacts: input.contextRebuildProjection.missingOptionalFacts,
        excludedUnsafeFacts: input.contextRebuildProjection.excludedUnsafeFacts,
        staleFacts: input.contextRebuildProjection.staleFacts,
        unsupportedBranchFacts: input.contextRebuildProjection.unsupportedBranchFacts,
        unsupportedCompactionFacts: input.contextRebuildProjection.unsupportedCompactionFacts,
        redactionStatus: input.contextRebuildProjection.redaction.status,
        terminalSuccessClaim:
          input.contextRebuildProjection.terminalSuccessClaim,
      },
      input.contextRebuildProjection.notProvenClaims,
    );
  }

  for (const rebuildInput of input.contextRebuildInputs ?? []) {
    append(
      "context-rebuild-input-prepared",
      {
        rebuildInputId: rebuildInput.rebuildInputId,
        sourceSessionId: rebuildInput.sourceSessionId,
        activePathProjectionId: rebuildInput.activePathProjectionId,
        nextTurnBundleId: rebuildInput.nextTurnBundleId,
        savePointId: rebuildInput.savePointId,
        toolResultMessageCount: rebuildInput.toolResultMessageIds.length,
        verificationHandoffCount: rebuildInput.verificationHandoffIds.length,
        repairHandoffCount: rebuildInput.repairHandoffIds.length,
        includedFactsSummary: rebuildInput.includedFactsSummary,
        excludedFactsSummary: rebuildInput.excludedFactsSummary,
        missingFacts: rebuildInput.missingFacts,
        redactionStatus: rebuildInput.redaction.status,
        terminalSuccessClaim: rebuildInput.terminalSuccessClaim,
      },
      rebuildInput.notProvenClaims,
    );
  }

  for (const readiness of input.continuationReadiness ?? []) {
    append(
      "continuation-readiness-evaluated",
      {
        readinessId: readiness.readinessId,
        sourceSessionId: readiness.sourceSessionId,
        status: readiness.status,
        requiredMissingFacts: readiness.requiredMissingFacts,
        optionalMissingFacts: readiness.optionalMissingFacts,
        staleFacts: readiness.staleFacts,
        branchGapStatus: readiness.branchGapStatus,
        compactionGapStatus: readiness.compactionGapStatus,
        nextTurnExecuted: readiness.nextTurnExecuted,
        terminalSuccessClaim: readiness.terminalSuccessClaim,
      },
      readiness.notProvenClaims,
    );
    if (readiness.status === "blocked_unsafe_context") {
      append(
        "unsafe-context-blocked",
        {
          readinessId: readiness.readinessId,
          unsafeFactsExcluded: readiness.unsafeFactsExcluded,
          terminalSuccessClaim: readiness.terminalSuccessClaim,
        },
        readiness.notProvenClaims,
      );
    }
    if (readiness.status === "blocked_missing_required_facts") {
      append(
        "missing-required-facts-blocked",
        {
          readinessId: readiness.readinessId,
          requiredMissingFacts: readiness.requiredMissingFacts,
          terminalSuccessClaim: readiness.terminalSuccessClaim,
        },
        readiness.notProvenClaims,
      );
    }
    if (readiness.optionalMissingFacts.length > 0) {
      append(
        "missing-optional-facts-observed",
        {
          readinessId: readiness.readinessId,
          optionalMissingFacts: readiness.optionalMissingFacts,
          terminalSuccessClaim: readiness.terminalSuccessClaim,
        },
        readiness.notProvenClaims,
      );
    }
  }

  for (const summary of input.replaySafeLoopStateSummaries ?? []) {
    append(
      "replay-safe-loop-state-summarized",
      {
        summaryId: summary.summaryId,
        sourceSessionId: summary.sourceSessionId,
        activePathId: summary.activePathId,
        latestSavePointId: summary.latestSavePointId,
        nextTurnBundleId: summary.nextTurnBundleId,
        contextRebuildInputId: summary.contextRebuildInputId,
        contextRebuildProjectionId: summary.contextRebuildProjectionId,
        continuationReadinessId: summary.continuationReadinessId,
        terminalResultFacts: summary.terminalResultFacts,
        redactionStatus: summary.redaction.status,
        terminalSuccessClaim: summary.terminalSuccessClaim,
      },
      summary.notProvenClaims,
    );
  }

  for (const adapter of input.productLoopAdapters ?? []) {
    append(
      "product-loop-adapter-observed",
      {
        adapterId: adapter.adapterId,
        observationMode: adapter.observationMode,
        phaseStatusCount: adapter.phaseStatus.length,
        unsupportedPhaseIds: adapter.unsupportedPhaseIds,
        featureContractAvailable: adapter.featureContractAvailable,
        featureContractCount: adapter.featureContracts.length,
        continuationReadinessReferenced:
          adapter.continuationBoundary.readinessReferenced,
        replaySafeStateReferenced:
          adapter.continuationBoundary.replaySafeStateReferenced,
        nextTurnExecuted: adapter.continuationBoundary.nextTurnExecuted,
        terminalSuccessClaim: false,
      },
      adapter.notProvenClaims,
    );
  }

  return deepFreeze(events);
}

const REDACTION_EXCLUSIONS = [
  "api-keys",
  "provider-env",
  "provider-output",
  "oldText",
  "newText",
  "unredacted-command-output",
  "hidden-reasoning",
  "full-transcript",
  "unsafe-file-contents",
  "executable-plugin-code",
] as const;

function sanitizeRecord(input: Record<string, unknown>): {
  readonly value: Record<string, unknown>;
  readonly redacted: boolean;
} {
  let redacted = false;
  const value: Record<string, unknown> = {};
  for (const [key, rawValue] of Object.entries(input)) {
    const sanitized = sanitizeValue(rawValue);
    value[key] = sanitized.value;
    redacted = redacted || sanitized.redacted;
  }
  return { value, redacted };
}

function sanitizeValue(input: unknown): { readonly value: unknown; readonly redacted: boolean } {
  if (typeof input === "string") {
    return sanitizeText(input);
  }
  if (Array.isArray(input)) {
    let redacted = false;
    const value = input.map((item) => {
      const sanitized = sanitizeValue(item);
      redacted = redacted || sanitized.redacted;
      return sanitized.value;
    });
    return { value, redacted };
  }
  if (input && typeof input === "object") {
    let redacted = false;
    const value: Record<string, unknown> = {};
    for (const [key, valueInput] of Object.entries(input)) {
      const sanitized = sanitizeValue(valueInput);
      value[key] = sanitized.value;
      redacted = redacted || sanitized.redacted;
    }
    return { value, redacted };
  }
  return { value: input, redacted: false };
}

function sanitizeText(input: string): { readonly value: string; readonly redacted: boolean } {
  let value = input;
  const before = value;
  value = value.replace(/\/home\/wang\/\.private-agents-real[^\s"']*/g, "[redacted-real-provider-home]");
  value = value.replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[secret-redacted]");
  value = value.replace(/\bBearer\s+[A-Za-z0-9._-]+/gi, "Bearer [secret-redacted]");
  value = value.replace(/\btoken=[^\s;,)]+/gi, "token=[secret-redacted]");
  value = value.replace(/\bauthorization[:=][^\s;,)]+/gi, "authorization=[secret-redacted]");
  value = value.replace(/\bapi[_-]?key[:=][^\s;,)]+/gi, "apiKey=[secret-redacted]");
  value = value.replace(/\bauth(?:orization)?[_-]?header[:=][^\n\r]*/gi, "authHeader=[secret-redacted]");
  value = value.replace(/\bprovider\.env\b[^\n\r]*/gi, "provider-env=[redacted]");
  value = value.replace(/\boldText[:=][\s\S]*?(?=\snewText[:=]|$)/gi, "oldText=[raw-content-excluded]");
  value = value.replace(/\bnewText[:=][^\n\r]*/gi, "newText=[raw-content-excluded]");
  value = value.replace(/\braw provider output[:=][^\n\r]*/gi, "provider-output=[raw-content-excluded]");
  value = value.replace(/\bhidden reasoning[:=]?[^\n\r]*/gi, "hidden-reasoning=[raw-content-excluded]");
  value = value.replace(/<html[\s\S]*?<\/html>/gi, "[raw-content-excluded]");
  return { value, redacted: value !== before };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
}
