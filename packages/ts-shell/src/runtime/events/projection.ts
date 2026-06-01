import type { RuntimeEvidenceSavePoint } from "../../evidence/savepoint/model.js";
import type { LoopContextRebuildInput } from "../../context/rebuildInput.js";
import type {
  RepairApplyObservation,
  RepairProposalObservation,
  RepairRequiredHandoff,
} from "../../repair/handoff/boundary.js";
import type { SessionContextRebuildProjection } from "../../context/sessionContextRebuildProjection.js";
import type { ModelResponseBoundary } from "../../provider/response/boundary.js";
import type { ProviderResponseStreamProjection } from "../../provider/response/stream.js";
import type {
  ModelRequestBoundary,
  NextTurnModelRequestPreparation,
} from "../../provider/request/boundary.js";
import type {
  ModelInvocationAttemptEnvelope,
  ModelInvocationGateFacts,
} from "../../provider/request/invocation.js";
import type { ControlledModelInvocationAdapterProjection } from "../../provider/request/attempt.js";
import type { ExtensionHookPolicyOutcome } from "../extensions/lifecycle.js";
import type { StaticResourceProjection } from "../resources/projection.js";
import type { PackageInventoryProjection } from "../resources/inventory.js";
import type { SessionTreeProjection } from "../../session/sessionTreeProjection.js";
import type { ContinuationReadinessProjection } from "../../session/continuation/readiness.js";
import type { ReplaySafeLoopStateSummary } from "../../session/replay/state.js";
import type { AssistantResponseState } from "../../turn/assistantResponse.js";
import type { NextTurnDeliveryPolicyProjection } from "../../turn/deliveryPolicy.js";
import type { FollowUpQueueProjection } from "../../turn/followUpQueue.js";
import type { NextTurnBundleProjection } from "../../turn/nextTurnBundle.js";
import type { SteeringQueueProjection } from "../../turn/steeringQueue.js";
import type { NormalizedToolCallBatch } from "../../tools/toolCallBatch.js";
import type { ToolBatchHandoffProjection } from "../../tools/toolHandoff.js";
import type {
  ToolBatchDispatchPlan,
  ToolResultDetail,
} from "../../tools/toolBatchDispatch.js";
import type { ToolOutcomeBundleProjection } from "../../tools/toolOutcomeBundle.js";
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
} from "../../verification/result/boundary.js";
import type { ProductLoopAdapterProjection } from "../loop/adapter.js";
import type { ModelBoundaryPhaseProjection } from "../loop/modelBoundary.js";
import type { ProviderStreamAdapterProjection } from "../loop/providerStreamAdapter.js";
import type { ModelResponseReentryCycleProjection } from "../loop/reentry.js";

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
  | "model-request-prepared"
  | "next-turn-request-preparation-observed"
  | "request-input-message-prepared"
  | "request-blocked"
  | "provider-metadata-observed"
  | "provider-opt-in-required"
  | "redaction-blocked-request"
  | "request-ready-for-explicit-invocation"
  | "model-invocation-gate-observed"
  | "model-invocation-blocked"
  | "model-invocation-explicit-opt-in-required"
  | "model-invocation-auth-readiness-observed"
  | "model-invocation-redaction-blocked"
  | "model-invocation-attempt-prepared"
  | "model-invocation-attempt-observed"
  | "model-invocation-failed-as-provider-fact"
  | "model-invocation-completed-as-provider-fact"
  | "controlled-invocation-adapter-observed"
  | "controlled-invocation-attempt-blocked"
  | "controlled-invocation-attempt-started"
  | "controlled-invocation-attempt-completed-as-provider-fact"
  | "controlled-invocation-attempt-failed-as-provider-fact"
  | "provider-response-handoff-prepared"
  | "provider-retry-eligible-not-attempted"
  | "provider-fallback-eligible-not-attempted"
  | "response-reentry-observed"
  | "model-boundary-processing-observed"
  | "assistant-accumulation-observed"
  | "tool-extraction-observed"
  | "no-tool-response-observed"
  | "loop-cycle-boundary-observed"
  | "loop-cycle-blocked"
  | "loop-cycle-partial"
  | "provider-readiness-observed"
  | "provider-fetch-blocked"
  | "provider-fetch-attempted"
  | "provider-stream-projected"
  | "provider-stream-started"
  | "provider-stream-delta-observed"
  | "provider-stream-cancelled"
  | "provider-stream-failed"
  | "model-boundary-partial"
  | "model-boundary-completed"
  | "model-response-boundary-observed"
  | "assistant-response-accumulated"
  | "tool-call-batch-extracted"
  | "tool-call-extraction-failed"
  | "tool-batch-handoff-observed"
  | "tool-batch-planned"
  | "tool-batch-partial"
  | "tool-call-not-dispatched"
  | "non-executed-result-message-prepared"
  | "tool-batch-observation-completed"
  | "tool-batch-dispatch-planned"
  | "tool-dispatch-eligibility-observed"
  | "before-tool-policy-decided"
  | "tool-call-authority-required"
  | "tool-call-dispatched"
  | "tool-execution-started"
  | "tool-execution-receipt-observed"
  | "tool-execution-failed"
  | "tool-execution-completed"
  | "tool-result-message-prepared"
  | "tool-batch-completed"
  | "tool-outcome-bundle-observed"
  | "tool-batch-save-point-observed"
  | "save-point-input-prepared"
  | "post-tool-save-point-observed"
  | "next-turn-bundle-prepared"
  | "next-turn-bundle-blocked"
  | "steering-queued"
  | "steering-delivered"
  | "follow-up-queued"
  | "follow-up-delivered"
  | "delivery-blocked"
  | "partial-tool-outcome-carried-forward"
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
  readonly toolOutcomeBundles?: readonly ToolOutcomeBundleProjection[];
  readonly nextTurnBundles?: readonly NextTurnBundleProjection[];
  readonly steeringQueues?: readonly SteeringQueueProjection[];
  readonly followUpQueues?: readonly FollowUpQueueProjection[];
  readonly nextTurnDeliveryPolicies?: readonly NextTurnDeliveryPolicyProjection[];
  readonly verificationIntents?: readonly VerificationLoopIntent[];
  readonly verificationResults?: readonly VerificationResultObservation[];
  readonly repairRequiredHandoffs?: readonly RepairRequiredHandoff[];
  readonly repairProposals?: readonly RepairProposalObservation[];
  readonly repairApplyObservations?: readonly RepairApplyObservation[];
  readonly modelRequestBoundaries?: readonly ModelRequestBoundary[];
  readonly nextTurnRequestPreparations?: readonly NextTurnModelRequestPreparation[];
  readonly modelInvocationGates?: readonly ModelInvocationGateFacts[];
  readonly modelInvocationAttempts?: readonly ModelInvocationAttemptEnvelope[];
  readonly controlledModelInvocations?: readonly ControlledModelInvocationAdapterProjection[];
  readonly responseReentryCycles?: readonly ModelResponseReentryCycleProjection[];
  readonly providerResponseStreams?: readonly ProviderResponseStreamProjection[];
  readonly providerStreamAdapters?: readonly ProviderStreamAdapterProjection[];
  readonly modelBoundaryPhases?: readonly ModelBoundaryPhaseProjection[];
  readonly modelResponseBoundaries?: readonly ModelResponseBoundary[];
  readonly assistantResponses?: readonly AssistantResponseState[];
  readonly toolCallBatches?: readonly NormalizedToolCallBatch[];
  readonly toolBatchHandoffs?: readonly ToolBatchHandoffProjection[];
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

  for (const request of input.modelRequestBoundaries ?? []) {
    append(
      "model-request-prepared",
      {
        requestId: request.requestId,
        turnId: request.turnId,
        loopId: request.loopId,
        providerSafeLabel: request.providerSafeLabel,
        modelSafeLabel: request.modelSafeLabel,
        providerMode: request.providerMode,
        readinessStatus: request.readinessStatus,
        providerReadinessStatus: request.providerReadinessStatus,
        providerDefaultEnablement: request.providerDefaultEnablement,
        providerRequiresExplicitOptIn: request.providerRequiresExplicitOptIn,
        contextPlanningSummaryId: request.contextPlanningSummaryId,
        missingRequiredFactCount: request.missingRequiredFacts.length,
        missingOptionalFactCount: request.missingOptionalFacts.length,
        mutationAuthority: request.mutationAuthority,
        redactionStatus: request.redaction.status,
        terminalSuccessClaim: false,
      },
      request.notProvenClaims,
    );
    append(
      "provider-readiness-observed",
      {
        requestId: request.requestId,
        providerReadinessStatus: request.providerReadinessStatus,
        providerDefaultEnablement: request.providerDefaultEnablement,
        providerRequiresExplicitOptIn: request.providerRequiresExplicitOptIn,
        terminalSuccessClaim: false,
      },
      request.notProvenClaims,
    );
  }

  for (const preparation of input.nextTurnRequestPreparations ?? []) {
    append(
      "next-turn-request-preparation-observed",
      {
        requestPreparationId: preparation.requestPreparationId,
        sourceNextTurnBundleId: preparation.sourceNextTurnBundleId,
        modelRequestBoundaryId: preparation.modelRequestBoundaryId,
        readinessStatus: preparation.readinessStatus,
        includedMessageCount: preparation.includedToolResultMessageIds.length,
        excludedMessageCount: preparation.excludedMessageIds.length,
        steeringIds: preparation.steeringIds,
        followUpIds: preparation.followUpIds,
        contextConstraintIds: preparation.contextConstraintIds,
        planningConstraintIds: preparation.planningConstraintIds,
        providerMetadataId: preparation.providerMetadataId,
        modelMetadataId: preparation.modelMetadataId,
        blockedReasons: preparation.blockedReasons,
        redactionStatus: preparation.redaction.status,
        terminalSuccessClaim: preparation.terminalSuccessClaim,
      },
      preparation.notProvenClaims,
    );
    for (const message of preparation.safeRequestMessages) {
      append(
        "request-input-message-prepared",
        {
          requestPreparationId: preparation.requestPreparationId,
          messageId: message.messageId,
          source: message.source,
          safeSummary: message.safeSummary,
          terminalSuccessClaim: message.terminalSuccessClaim,
        },
        preparation.notProvenClaims,
      );
    }
    append(
      "provider-metadata-observed",
      {
        requestPreparationId: preparation.requestPreparationId,
        providerSafeLabel: preparation.providerMetadata.providerSafeLabel,
        modelSafeLabel: preparation.providerMetadata.modelSafeLabel,
        authReadiness: preparation.providerMetadata.authReadiness,
        streamingCapability: preparation.providerMetadata.streamingCapability,
        providerOptInState: preparation.providerMetadata.providerOptInState,
        missingProviderFacts: preparation.providerMetadata.missingProviderFacts,
        terminalSuccessClaim: preparation.providerMetadata.terminalSuccessClaim,
      },
      preparation.providerMetadata.notProvenClaims,
    );
    if (preparation.providerMetadata.providerOptInState === "required") {
      append(
        "provider-opt-in-required",
        {
          requestPreparationId: preparation.requestPreparationId,
          providerSafeLabel: preparation.providerMetadata.providerSafeLabel,
          terminalSuccessClaim: preparation.providerMetadata.terminalSuccessClaim,
        },
        preparation.providerMetadata.notProvenClaims,
      );
    }
    if (preparation.readinessStatus === "ready_for_explicit_model_invocation") {
      append(
        "request-ready-for-explicit-invocation",
        {
          requestPreparationId: preparation.requestPreparationId,
          sourceNextTurnBundleId: preparation.sourceNextTurnBundleId,
          terminalSuccessClaim: preparation.terminalSuccessClaim,
        },
        preparation.notProvenClaims,
      );
    }
    if (preparation.blockedReasons.length > 0 || preparation.readinessStatus.startsWith("blocked")) {
      append(
        "request-blocked",
        {
          requestPreparationId: preparation.requestPreparationId,
          readinessStatus: preparation.readinessStatus,
          blockedReasons: preparation.blockedReasons,
          terminalSuccessClaim: preparation.terminalSuccessClaim,
        },
        preparation.notProvenClaims,
      );
    }
    if (preparation.readinessStatus === "blocked_by_redaction") {
      append(
        "redaction-blocked-request",
        {
          requestPreparationId: preparation.requestPreparationId,
          excludedMessageIds: preparation.excludedMessageIds,
          exclusionReasons: preparation.exclusionReasons,
          terminalSuccessClaim: preparation.terminalSuccessClaim,
        },
        preparation.notProvenClaims,
      );
    }
  }

  for (const gate of input.modelInvocationGates ?? []) {
    append(
      "model-invocation-gate-observed",
      {
        gateId: gate.gateId,
        sourcePreparedRequestId: gate.sourcePreparedRequestId,
        providerMetadataId: gate.providerMetadataId,
        modelMetadataId: gate.modelMetadataId,
        providerSafeLabel: gate.providerSafeLabel,
        modelSafeLabel: gate.modelSafeLabel,
        optInState: gate.optInState,
        authReadiness: gate.authReadinessState,
        redactionStatus: gate.redactionState,
        requestReadinessStatus: gate.requestReadinessState,
        eligibilityStatus: gate.eligibilityStatus,
        blockedReasons: gate.blockedReasons,
        retryEligibility: gate.retryEligibility,
        fallbackEligibility: gate.fallbackEligibility,
        requiredUserAction: gate.requiredUserAction,
        terminalSuccessClaim: gate.terminalSuccessClaim,
      },
      gate.notProvenClaims,
    );
    append(
      "model-invocation-auth-readiness-observed",
      {
        gateId: gate.gateId,
        authReadiness: gate.authReadinessState,
        terminalSuccessClaim: false,
      },
      gate.notProvenClaims,
    );
    if (gate.optInState === "missing" || gate.optInState === "invalid") {
      append(
        "model-invocation-explicit-opt-in-required",
        {
          gateId: gate.gateId,
          optInState: gate.optInState,
          optInSourceSafeLabel: gate.optInSourceSafeLabel,
          requiredUserAction: gate.requiredUserAction,
          terminalSuccessClaim: false,
        },
        gate.notProvenClaims,
      );
    }
    if (gate.eligibilityStatus !== "eligible_for_explicit_invocation") {
      append(
        "model-invocation-blocked",
        {
          gateId: gate.gateId,
          eligibilityStatus: gate.eligibilityStatus,
          blockedReasons: gate.blockedReasons,
          requiredUserAction: gate.requiredUserAction,
          terminalSuccessClaim: false,
        },
        gate.notProvenClaims,
      );
    }
    if (gate.eligibilityStatus === "blocked_by_redaction") {
      append(
        "model-invocation-redaction-blocked",
        {
          gateId: gate.gateId,
          redactionStatus: gate.redactionState,
          requiredUserAction: gate.requiredUserAction,
          terminalSuccessClaim: false,
        },
        gate.notProvenClaims,
      );
    }
  }

  for (const attempt of input.modelInvocationAttempts ?? []) {
    append(
      "model-invocation-attempt-prepared",
      {
        attemptId: attempt.attemptId,
        sourceGateId: attempt.sourceGateId,
        sourcePreparedRequestId: attempt.sourcePreparedRequestId,
        providerSafeLabel: attempt.providerSafeLabel,
        modelSafeLabel: attempt.modelSafeLabel,
        invocationMode: attempt.invocationMode,
        attemptStatus: attempt.attemptStatus,
        failureClass: attempt.failureClass,
        retryEligibility: attempt.retryEligibility,
        fallbackEligibility: attempt.fallbackEligibility,
        redactionStatus: attempt.redactionState,
        terminalSuccessClaim: attempt.terminalSuccessClaim,
      },
      attempt.notProvenClaims,
    );
    if (attempt.attemptStatus !== "not_attempted" && attempt.attemptStatus !== "blocked") {
      append(
        "model-invocation-attempt-observed",
        {
          attemptId: attempt.attemptId,
          attemptStatus: attempt.attemptStatus,
          invocationMode: attempt.invocationMode,
          terminalSuccessClaim: false,
        },
        attempt.notProvenClaims,
      );
    }
    if (attempt.attemptStatus === "failed") {
      append(
        "model-invocation-failed-as-provider-fact",
        {
          attemptId: attempt.attemptId,
          attemptStatus: attempt.attemptStatus,
          failureClass: attempt.failureClass,
          retryEligibility: attempt.retryEligibility,
          fallbackEligibility: attempt.fallbackEligibility,
          terminalSuccessClaim: false,
        },
        attempt.notProvenClaims,
      );
    }
    if (attempt.attemptStatus === "completed") {
      append(
        "model-invocation-completed-as-provider-fact",
        {
          attemptId: attempt.attemptId,
          attemptStatus: attempt.attemptStatus,
          terminalSuccessClaim: false,
        },
        attempt.notProvenClaims,
      );
    }
  }

  for (const adapter of input.controlledModelInvocations ?? []) {
    append(
      "controlled-invocation-adapter-observed",
      {
        adapterId: adapter.adapterId,
        sourceGateId: adapter.sourceGateId,
        sourcePreparedRequestId: adapter.sourcePreparedRequestId,
        providerSafeLabel: adapter.providerSafeLabel,
        modelSafeLabel: adapter.modelSafeLabel,
        invocationMode: adapter.invocationMode,
        controlledOptInState: adapter.controlledOptInState,
        attemptDecision: adapter.attemptDecision,
        attemptId: adapter.attemptId,
        blockedReason: adapter.blockedReason,
        attemptStatus: adapter.outcome.status,
        failureClass: adapter.outcome.failureClass,
        retryEligibility: adapter.outcome.retryEligibility,
        fallbackEligibility: adapter.outcome.fallbackEligibility,
        fallbackAttempted: adapter.outcome.fallbackAttempted,
        responseHandoffId: adapter.outcome.responseHandoffId,
        redactionStatus: adapter.redactionState,
        terminalSuccessClaim: false,
      },
      adapter.notProvenClaims,
    );
    if (adapter.attemptDecision === "blocked" || adapter.outcome.status === "blocked") {
      append(
        "controlled-invocation-attempt-blocked",
        {
          adapterId: adapter.adapterId,
          attemptId: adapter.attemptId,
          blockedReason: adapter.blockedReason,
          failureClass: adapter.outcome.failureClass,
          terminalSuccessClaim: false,
        },
        adapter.notProvenClaims,
      );
    }
    if (adapter.attemptDecision === "execute_via_provider_fetch") {
      append(
        "controlled-invocation-attempt-started",
        {
          adapterId: adapter.adapterId,
          attemptId: adapter.attemptId,
          invocationMode: adapter.invocationMode,
          terminalSuccessClaim: false,
        },
        adapter.notProvenClaims,
      );
    }
    if (adapter.outcome.status === "completed") {
      append(
        "controlled-invocation-attempt-completed-as-provider-fact",
        {
          adapterId: adapter.adapterId,
          attemptId: adapter.attemptId,
          responseHandoffId: adapter.outcome.responseHandoffId,
          terminalSuccessClaim: false,
        },
        adapter.outcome.notProvenClaims,
      );
    }
    if (
      adapter.outcome.status === "failed" ||
      adapter.outcome.status === "cancelled" ||
      adapter.outcome.status === "output_invalid" ||
      adapter.outcome.status === "output_insufficient" ||
      adapter.outcome.status === "redaction_failed" ||
      adapter.outcome.status === "unsupported"
    ) {
      append(
        "controlled-invocation-attempt-failed-as-provider-fact",
        {
          adapterId: adapter.adapterId,
          attemptId: adapter.attemptId,
          attemptStatus: adapter.outcome.status,
          failureClass: adapter.outcome.failureClass,
          terminalSuccessClaim: false,
        },
        adapter.outcome.notProvenClaims,
      );
    }
    if (adapter.responseHandoff) {
      append(
        "provider-response-handoff-prepared",
        {
          responseHandoffId: adapter.responseHandoff.responseHandoffId,
          sourceAttemptId: adapter.responseHandoff.sourceAttemptId,
          responseClassification: adapter.responseHandoff.responseClassification,
          assistantContentAvailability: adapter.responseHandoff.assistantContentAvailability,
          toolCallExtractionReadiness: adapter.responseHandoff.toolCallExtractionReadiness,
          modelResponseBoundaryId: adapter.responseHandoff.modelResponseBoundaryId,
          redactionStatus: adapter.responseHandoff.redactionStatus,
          rawOutputExcluded: adapter.responseHandoff.rawOutputExcluded,
          terminalSuccessClaim: false,
        },
        adapter.responseHandoff.notProvenClaims,
      );
    }
    if (adapter.outcome.retryEligibility === "retry_eligible") {
      append(
        "provider-retry-eligible-not-attempted",
        {
          adapterId: adapter.adapterId,
          attemptId: adapter.attemptId,
          retryEligibility: adapter.outcome.retryEligibility,
          terminalSuccessClaim: false,
        },
        adapter.outcome.notProvenClaims,
      );
    }
    if (adapter.outcome.fallbackEligibility === "fallback_eligible") {
      append(
        "provider-fallback-eligible-not-attempted",
        {
          adapterId: adapter.adapterId,
          attemptId: adapter.attemptId,
          fallbackEligibility: adapter.outcome.fallbackEligibility,
          fallbackAttempted: adapter.outcome.fallbackAttempted,
          terminalSuccessClaim: false,
        },
        adapter.outcome.notProvenClaims,
      );
    }
  }

  for (const cycle of input.responseReentryCycles ?? []) {
    append(
      "response-reentry-observed",
      {
        cycleId: cycle.cycleId,
        reentryId: cycle.responseReentry.reentryId,
        sourceAttemptId: cycle.responseReentry.sourceAttemptId,
        sourceResponseHandoffId: cycle.responseReentry.sourceResponseHandoffId,
        responseClassification: cycle.responseReentry.responseClassification,
        assistantContentAvailability: cycle.responseReentry.assistantContentAvailability,
        toolCallExtractionReadiness: cycle.responseReentry.toolExtractionReadiness,
        reentryStatus: cycle.responseReentry.reentryStatus,
        redactionStatus: cycle.responseReentry.redactionState,
        rawOutputExcluded: cycle.responseReentry.rawOutputExcluded,
        terminalSuccessClaim: false,
      },
      cycle.responseReentry.notProvenClaims,
    );
    if (
      cycle.responseReentry.reentryStatus === "processed" ||
      cycle.responseReentry.reentryStatus === "ready_for_boundary_processing"
    ) {
      append(
        "model-boundary-processing-observed",
        {
          cycleId: cycle.cycleId,
          responseReentryId: cycle.responseReentry.reentryId,
          modelResponseBoundaryId: cycle.responseBoundary.responseId,
          responseStatus: cycle.responseBoundary.status,
          terminalSuccessClaim: false,
        },
        cycle.notProvenClaims,
      );
    }
    if (cycle.assistantAccumulation) {
      append(
        "assistant-accumulation-observed",
        {
          accumulationId: cycle.assistantAccumulation.accumulationId,
          sourceReentryId: cycle.assistantAccumulation.sourceReentryId,
          contentAvailability: cycle.assistantAccumulation.contentAvailability,
          contentSummarySafeLabel: cycle.assistantAccumulation.contentSummarySafeLabel,
          contentRedactionState: cycle.assistantAccumulation.contentRedactionState,
          hiddenChannelExcluded: cycle.assistantAccumulation.hiddenChannelExcluded,
          completionStatus: cycle.assistantAccumulation.completionStatus,
          terminalSuccessClaim: false,
        },
        cycle.assistantAccumulation.notProvenClaims,
      );
    }
    if (cycle.toolExtraction) {
      append(
        "tool-extraction-observed",
        {
          extractionId: cycle.toolExtraction.extractionId,
          sourceAssistantAccumulationId: cycle.toolExtraction.sourceAssistantAccumulationId,
          extractedCallIds: cycle.toolExtraction.extractedCallIds,
          malformedCallIds: cycle.toolExtraction.malformedCallIds,
          unsupportedCallIds: cycle.toolExtraction.unsupportedCallIds,
          unknownToolIds: cycle.toolExtraction.unknownToolIds,
          noToolStatus: cycle.toolExtraction.noToolStatus,
          extractionConfidence: cycle.toolExtraction.extractionConfidence,
          handoffReadiness: cycle.toolExtraction.handoffReadiness,
          terminalSuccessClaim: false,
        },
        cycle.toolExtraction.notProvenClaims,
      );
      if (cycle.toolExtraction.noToolStatus === "observed") {
        append(
          "no-tool-response-observed",
          {
            extractionId: cycle.toolExtraction.extractionId,
            noToolStatus: cycle.toolExtraction.noToolStatus,
            terminalSuccessClaim: false,
          },
          cycle.toolExtraction.notProvenClaims,
        );
      }
    }
    append(
      "loop-cycle-boundary-observed",
      {
        cycleId: cycle.cycleBoundary.cycleId,
        sourceInvocationAttemptId: cycle.cycleBoundary.sourceInvocationAttemptId,
        responseReentryId: cycle.cycleBoundary.responseReentryId,
        assistantAccumulationId: cycle.cycleBoundary.assistantAccumulationId,
        toolExtractionId: cycle.cycleBoundary.toolExtractionId,
        nextHandoffKind: cycle.cycleBoundary.nextHandoffKind,
        cycleStatus: cycle.cycleBoundary.cycleStatus,
        stopReason: cycle.cycleBoundary.stopReason,
        continuationRequirement: cycle.cycleBoundary.continuationRequirement,
        terminalSuccessClaim: false,
      },
      cycle.cycleBoundary.notProvenClaims,
    );
    if (
      cycle.cycleBoundary.cycleStatus === "blocked_response" ||
      cycle.cycleBoundary.cycleStatus === "failed_response" ||
      cycle.cycleBoundary.cycleStatus === "cancelled_response"
    ) {
      append(
        "loop-cycle-blocked",
        {
          cycleId: cycle.cycleBoundary.cycleId,
          cycleStatus: cycle.cycleBoundary.cycleStatus,
          stopReason: cycle.cycleBoundary.stopReason,
          terminalSuccessClaim: false,
        },
        cycle.cycleBoundary.notProvenClaims,
      );
    }
    if (cycle.cycleBoundary.cycleStatus === "partial_response") {
      append(
        "loop-cycle-partial",
        {
          cycleId: cycle.cycleBoundary.cycleId,
          cycleStatus: cycle.cycleBoundary.cycleStatus,
          nextHandoffKind: cycle.cycleBoundary.nextHandoffKind,
          terminalSuccessClaim: false,
        },
        cycle.cycleBoundary.notProvenClaims,
      );
    }
  }

  for (const adapter of input.providerStreamAdapters ?? []) {
    if (!adapter.fetchAttempted) {
      append(
        "provider-fetch-blocked",
        {
          adapterId: adapter.adapterId,
          requestId: adapter.requestId,
          responseId: adapter.responseId,
          explicitOptIn: adapter.explicitOptIn,
          readinessStatus: adapter.readinessStatus,
          failureClass: adapter.failureClass,
          liveClassification: adapter.liveClassification,
          retryEligibility: adapter.retryEligibility,
          fallbackEligibility: adapter.fallbackEligibility,
          fallbackStatus: adapter.fallbackStatus,
          recoveryFacts: adapter.recoveryFacts,
          streamProjected: adapter.streamProjected,
          terminalSuccessClaim: false,
        },
        adapter.notProvenClaims,
      );
      continue;
    }
    append(
      "provider-fetch-attempted",
      {
        adapterId: adapter.adapterId,
        requestId: adapter.requestId,
        responseId: adapter.responseId,
        explicitOptIn: adapter.explicitOptIn,
        readinessStatus: adapter.readinessStatus,
        fetchAttempted: adapter.fetchAttempted,
        liveClassification: adapter.liveClassification,
        retryEligibility: adapter.retryEligibility,
        fallbackEligibility: adapter.fallbackEligibility,
        fallbackStatus: adapter.fallbackStatus,
        terminalSuccessClaim: false,
      },
      adapter.notProvenClaims,
    );
    append(
      "provider-stream-projected",
      {
        adapterId: adapter.adapterId,
        requestId: adapter.requestId,
        responseId: adapter.responseId,
        streamProjected: adapter.streamProjected,
        assistantAccumulationStatus: adapter.assistantAccumulationStatus,
        toolCallExtractionStatus: adapter.toolCallExtractionStatus,
        failureClass: adapter.failureClass,
        liveClassification: adapter.liveClassification,
        retryEligibility: adapter.retryEligibility,
        fallbackEligibility: adapter.fallbackEligibility,
        fallbackStatus: adapter.fallbackStatus,
        recoveryFacts: adapter.recoveryFacts,
        redactionStatus: adapter.redaction.status,
        terminalSuccessClaim: false,
      },
      adapter.notProvenClaims,
    );
  }

  for (const stream of input.providerResponseStreams ?? []) {
    if (stream.eventCount > 0) {
      append(
        "provider-stream-started",
        {
          streamId: stream.streamId,
          requestId: stream.requestId,
          responseId: stream.responseId,
          status: stream.status,
          eventCount: stream.eventCount,
          terminalSuccessClaim: false,
        },
        stream.notProvenClaims,
      );
    }
    if (stream.contentDeltaCount > 0 || stream.toolCallDeltaCount > 0) {
      append(
        "provider-stream-delta-observed",
        {
          streamId: stream.streamId,
          responseId: stream.responseId,
          contentDeltaCount: stream.contentDeltaCount,
          toolCallDeltaCount: stream.toolCallDeltaCount,
          contentSummary: stream.contentSummary,
          terminalSuccessClaim: false,
        },
        stream.notProvenClaims,
      );
    }
    if (stream.status === "cancelled") {
      append(
        "provider-stream-cancelled",
        {
          streamId: stream.streamId,
          responseId: stream.responseId,
          cancellationKind: stream.cancellation?.kind,
          partialResponsePreserved: stream.cancellation?.partialResponsePreserved,
          retryStatus: stream.cancellation?.retryStatus,
          terminalSuccessClaim: false,
        },
        stream.notProvenClaims,
      );
    }
    if (stream.failure) {
      append(
        "provider-stream-failed",
        {
          streamId: stream.streamId,
          responseId: stream.responseId,
          failureClass: stream.failure.class,
          fallbackEligibility: stream.failure.fallbackEligibility,
          fallbackExecuted: stream.failure.fallbackExecuted,
          terminalSuccessClaim: false,
        },
        stream.notProvenClaims,
      );
    }
    append(
      stream.status === "completed" ? "model-boundary-completed" : "model-boundary-partial",
      {
        streamId: stream.streamId,
        responseId: stream.responseId,
        status: stream.status,
        assistantMessageCompleted: stream.assistantMessageCompleted,
        streamCompleted: stream.streamCompleted,
        toolCallCount: stream.completedToolCalls.length,
        terminalSuccessClaim: false,
      },
      stream.notProvenClaims,
    );
  }

  for (const phase of input.modelBoundaryPhases ?? []) {
    append(
      phase.stream.status === "completed" ? "model-boundary-completed" : "model-boundary-partial",
      {
        phaseId: phase.phaseId,
        requestId: phase.requestBoundary.requestId,
        responseId: phase.responseBoundary.responseId,
        streamStatus: phase.stream.status,
        assistantAccumulationStatus: phase.assistantResponse.accumulationStatus,
        toolCallExtractionStatus: phase.toolCallBatch.extractionStatus,
        toolBatchHandoffPrepared: phase.toolBatchHandoffPrepared,
        terminalSuccessClaim: phase.terminalSuccessClaim,
      },
      phase.notProvenClaims,
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

  for (const handoff of input.toolBatchHandoffs ?? []) {
    append(
      "tool-batch-handoff-observed",
      {
        handoffId: handoff.handoffId,
        sourceModelBoundaryId: handoff.sourceModelBoundaryId,
        sourceAssistantResponseId: handoff.sourceAssistantResponseId,
        batchId: handoff.batchId,
        extractionStatus: handoff.extractionStatus,
        normalizedToolCallCount: handoff.normalizedToolCallIds.length,
        malformedCallIds: handoff.malformedCallIds,
        unsupportedCallIds: handoff.unsupportedCallIds,
        unknownToolCallIds: handoff.unknownToolCallIds,
        argumentRedactionStatus: handoff.argumentRedactionStatus,
        dispatchEligibility: handoff.dispatchEligibility,
        policyRequirement: handoff.policyRequirement,
        authorityRequirement: handoff.authorityRequirement,
        executionStatus: handoff.executionStatus,
        savePointInputId: handoff.savePointInputId,
        savePointInputAbsentReason: handoff.savePointInputAbsentReason,
        nextTurnInputId: handoff.nextTurnInputId,
        nextTurnInputAbsentReason: handoff.nextTurnInputAbsentReason,
        terminalSuccessClaim: false,
      },
      handoff.notProvenClaims,
    );
    append(
      "tool-batch-planned",
      {
        handoffId: handoff.handoffId,
        dispatchPlanId: handoff.dispatchPlanId,
        dispatchEligibility: handoff.dispatchEligibility,
        executionStatus: handoff.executionStatus,
        terminalSuccessClaim: false,
      },
      handoff.notProvenClaims,
    );
    if (handoff.extractionStatus === "partial" || handoff.extractionStatus === "failed") {
      append(
        "tool-batch-partial",
        {
          handoffId: handoff.handoffId,
          extractionStatus: handoff.extractionStatus,
          malformedCallIds: handoff.malformedCallIds,
          unsupportedCallIds: handoff.unsupportedCallIds,
          unknownToolCallIds: handoff.unknownToolCallIds,
          terminalSuccessClaim: false,
        },
        handoff.notProvenClaims,
      );
    }
    if (handoff.normalizedToolCallIds.length > 0 && handoff.executionStatus === "not_dispatched") {
      append(
        "tool-call-not-dispatched",
        {
          handoffId: handoff.handoffId,
          toolCallIds: handoff.normalizedToolCallIds,
          executionStatus: handoff.executionStatus,
          terminalSuccessClaim: false,
        },
        handoff.notProvenClaims,
      );
    }
    if (handoff.nonExecutedMessageIds.length > 0) {
      append(
        "non-executed-result-message-prepared",
        {
          handoffId: handoff.handoffId,
          messageIds: handoff.nonExecutedMessageIds,
          terminalSuccessClaim: false,
        },
        handoff.notProvenClaims,
      );
    }
    append(
      "tool-batch-observation-completed",
      {
        handoffId: handoff.handoffId,
        batchId: handoff.batchId,
        executionStatus: handoff.executionStatus,
        terminalSuccessClaim: false,
      },
      handoff.notProvenClaims,
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
        knownToolStatus: call.knownToolStatus,
        supportedStatus: call.supportedStatus,
        dispatchStatus: call.dispatchStatus,
        dispatchEligibility: call.dispatchEligibility,
        authorityGrantStatus: call.authorityGrantStatus,
        notDispatchedReason: call.notDispatchedReason,
        decisionId: call.beforePolicyDecision.decisionId,
        decisionStatus: call.beforePolicyDecision.status,
        authorityRequirement: call.authorityRequirement,
        redactionStatus: call.redactionStatus,
        terminalSuccessClaim: false,
      };
      append("tool-dispatch-eligibility-observed", facts, call.notProvenClaims);
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
    append(
      "tool-execution-receipt-observed",
      {
        receiptId: receipt.receiptId,
        operationKind: receipt.operationKind,
        executionStatus: receipt.executionStatus,
        errorClass: receipt.errorClass,
        exitCode: receipt.exitCode,
        authorityMode: receipt.authorityMode,
        redactionStatus: receipt.redaction.status,
        terminalSuccessClaim: false,
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
    if (detail.systemDetails.executionReceiptId) {
      append(
        "tool-execution-started",
        {
          resultDetailsId: detail.resultDetailsId,
          toolCallId: detail.toolCallId,
          toolName: detail.toolName,
          executionReceiptId: detail.systemDetails.executionReceiptId,
          resultStatus: detail.resultStatus,
          terminalSuccessClaim: false,
        },
        detail.notProvenClaims,
      );
    }
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
    if (detail.resultStatus === "executed_failed") {
      append(
        "tool-execution-failed",
        {
          resultDetailsId: detail.resultDetailsId,
          toolCallId: detail.toolCallId,
          toolName: detail.toolName,
          executionReceiptId: detail.systemDetails.executionReceiptId,
          resultStatus: detail.resultStatus,
          terminalSuccessClaim: false,
        },
        detail.notProvenClaims,
      );
    }
    if (detail.resultStatus === "executed_success") {
      append(
        "tool-execution-completed",
        {
          resultDetailsId: detail.resultDetailsId,
          toolCallId: detail.toolCallId,
          toolName: detail.toolName,
          executionReceiptId: detail.systemDetails.executionReceiptId,
          resultStatus: detail.resultStatus,
          terminalSuccessClaim: false,
        },
        detail.notProvenClaims,
      );
    }
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
    append(
      "tool-batch-completed",
      {
        batchId: batch.batchId,
        dispatchPlanId: batch.dispatchPlanId,
        toolResultMessageCount: batch.messages.length,
        preparedCount: batch.preparedCount,
        blockedCount: batch.blockedCount,
        terminalSuccessClaim: batch.terminalSuccessClaim,
      },
      batch.notProvenClaims,
    );
  }

  for (const bundle of input.toolOutcomeBundles ?? []) {
    append(
      "tool-outcome-bundle-observed",
      {
        bundleId: bundle.bundleId,
        sourceBatchId: bundle.sourceBatchId,
        sourceModelBoundaryId: bundle.sourceModelBoundaryId,
        resultMessageIds: bundle.resultMessageIds,
        receiptIds: bundle.receiptIds,
        executedCount: bundle.executedCount,
        failedCount: bundle.failedCount,
        blockedCount: bundle.blockedCount,
        authorityRequiredCount: bundle.authorityRequiredCount,
        unsupportedCount: bundle.unsupportedCount,
        malformedCount: bundle.malformedCount,
        unknownCount: bundle.unknownCount,
        notDispatchedCount: bundle.notDispatchedCount,
        mixedOutcomeStatus: bundle.mixedOutcomeStatus,
        redactionStatus: bundle.redactionStatus,
        terminalSuccessClaim: bundle.terminalSuccessClaim,
      },
      bundle.notProvenClaims,
    );
    if (bundle.mixedOutcomeStatus === "mixed_success_and_non_success") {
      append(
        "partial-tool-outcome-carried-forward",
        {
          bundleId: bundle.bundleId,
          blockingFacts: bundle.blockingFacts,
          terminalSuccessClaim: bundle.terminalSuccessClaim,
        },
        bundle.notProvenClaims,
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
      if (input.savePoint.toolOutcomeInput) {
        append(
          "save-point-input-prepared",
          {
            savePointInputId: input.savePoint.toolOutcomeInput.inputId,
            sourceBundleId: input.savePoint.toolOutcomeInput.sourceBundleId,
            receiptIds: input.savePoint.toolOutcomeInput.receiptIds,
            resultMessageIds: input.savePoint.toolOutcomeInput.resultMessageIds,
            partialOutcomeFacts: input.savePoint.toolOutcomeInput.partialOutcomeFacts,
            blockedFacts: input.savePoint.toolOutcomeInput.blockedFacts,
            failedFacts: input.savePoint.toolOutcomeInput.failedFacts,
            redactionStatus: input.savePoint.toolOutcomeInput.redactionStatus,
            evidenceOnly: input.savePoint.toolOutcomeInput.evidenceOnly,
            terminalSuccessClaim: input.savePoint.toolOutcomeInput.terminalSuccessClaim,
          },
          input.savePoint.toolOutcomeInput.notProvenClaims,
        );
      }
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
      if (
        item.deliveryStatus === "blocked" ||
        item.deliveryStatus === "unsupported" ||
        item.deliveryStatus === "redacted"
      ) {
        append(
          "delivery-blocked",
          {
            queueId: queue.queueId,
            steeringId: item.steeringId,
            deliveryStatus: item.deliveryStatus,
            redactionStatus: item.redactionStatus,
            terminalSuccessClaim: false,
          },
          item.notProvenClaims,
        );
      }
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
      if (
        item.deliveryStatus === "blocked" ||
        item.deliveryStatus === "unsupported" ||
        item.deliveryStatus === "redacted"
      ) {
        append(
          "delivery-blocked",
          {
            queueId: queue.queueId,
            followUpId: item.followUpId,
            deliveryStatus: item.deliveryStatus,
            redactionStatus: item.redactionStatus,
            terminalSuccessClaim: false,
          },
          item.notProvenClaims,
        );
      }
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
        sourceToolOutcomeBundleId: bundle.sourceToolOutcomeBundleId,
        includedToolResultMessageIds: bundle.includedToolResultMessageIds,
        excludedToolResultMessageIds: bundle.excludedToolResultMessageIds,
        readinessStatus: bundle.readinessStatus,
        blockingFacts: bundle.blockingFacts,
        requiredUserAction: bundle.requiredUserAction,
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
    if (bundle.readinessStatus.startsWith("blocked") || bundle.readinessStatus === "unsupported") {
      append(
        "next-turn-bundle-blocked",
        {
          bundleId: bundle.bundleId,
          readinessStatus: bundle.readinessStatus,
          blockingFacts: bundle.blockingFacts,
          requiredUserAction: bundle.requiredUserAction,
          terminalSuccessClaim: bundle.terminalSuccessClaim,
        },
        bundle.notProvenClaims,
      );
    }
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
