import type { LoopContextRebuildInput } from "../../context/rebuildInput.js";
import type { SessionContextRebuildProjection } from "../../context/sessionContextRebuildProjection.js";
import type { ProviderRegistryProjection } from "../../provider/registry/provider.js";
import type { ContinuationReadinessProjection } from "../../session/continuation/readiness.js";
import type { ReplaySafeLoopStateSummary } from "../../session/replay/state.js";
import type { SessionTreeProjection } from "../../session/sessionTreeProjection.js";
import type { AgentLoopContractProjection } from "./contract.js";
import type { FutureFeatureIntegrationContract } from "./feature.js";
import {
  getProductLoopPhaseStatusMap,
  type ProductLoopPhaseStatusEntry,
} from "./phaseStatus.js";
import type { LoopTrajectoryProjection } from "./trajectory.js";

export interface ProductLoopAdapterInput {
  readonly adapterId: string;
  readonly promptSummary?: string;
  readonly loopTrajectory: LoopTrajectoryProjection;
  readonly loop?: AgentLoopContractProjection;
  readonly providerRegistry?: ProviderRegistryProjection;
  readonly sessionProjection?: SessionTreeProjection;
  readonly contextRebuildInput?: LoopContextRebuildInput;
  readonly contextRebuildProjection?: SessionContextRebuildProjection;
  readonly continuationReadiness?: ContinuationReadinessProjection;
  readonly replaySafeLoopStateSummary?: ReplaySafeLoopStateSummary;
  readonly featureContracts?: readonly FutureFeatureIntegrationContract[];
  readonly nextAction?: string;
}

export interface ProductLoopCompletionConsumerProjection {
  readonly observed: boolean;
  readonly viewStatus: "complete_view" | "incomplete_view" | "not_observed";
  readonly packetIds: readonly string[];
  readonly resultOwnedTerminalStatus?: string;
  readonly loopDecision?: string;
  readonly closeoutState?: string;
  readonly packetStatus?: string;
  readonly originalFailureSummary?: string;
  readonly repairChainSummary?: string;
  readonly postRepairVerificationSummary?: string;
  readonly missingProofItems: readonly string[];
  readonly nextAction?: string;
  readonly notProvenClaims: readonly string[];
  readonly terminalSuccessClaim: false;
}

export interface ProductLoopAdapterProjection {
  readonly adapterId: string;
  readonly observationMode: "host-adapter";
  readonly promptSummary: string;
  readonly ownerDomain: "runtime/loop";
  readonly hostConsumers: readonly string[];
  readonly safeReferences: {
    readonly turnSnapshotIds: readonly string[];
    readonly modelResponseBoundaryIds: readonly string[];
    readonly assistantResponseIds: readonly string[];
    readonly toolCallBatchIds: readonly string[];
    readonly toolDispatchPlanIds: readonly string[];
    readonly toolResultMessageIds: readonly string[];
    readonly savePointIds: readonly string[];
    readonly nextTurnBundleIds: readonly string[];
    readonly steeringMessageIds: readonly string[];
    readonly followUpMessageIds: readonly string[];
    readonly deliveryPolicyIds: readonly string[];
    readonly verificationHandoffIds: readonly string[];
    readonly repairHandoffIds: readonly string[];
    readonly sessionActivePathIds: readonly string[];
    readonly contextRebuildInputIds: readonly string[];
    readonly contextRebuildProjectionIds: readonly string[];
    readonly continuationReadinessIds: readonly string[];
    readonly replaySafeLoopStateSummaryIds: readonly string[];
    readonly providerMetadataIds: readonly string[];
    readonly runtimeEventIds: readonly string[];
    readonly jsonStreamIds: readonly string[];
    readonly productSurfaceSectionIds: readonly string[];
    readonly resultFactIds: readonly string[];
    readonly productCompletionPacketIds: readonly string[];
  };
  readonly completionConsumer: ProductLoopCompletionConsumerProjection;
  readonly phaseStatus: readonly ProductLoopPhaseStatusEntry[];
  readonly unsupportedPhaseIds: readonly string[];
  readonly featureContracts: readonly FutureFeatureIntegrationContract[];
  readonly featureContractAvailable: boolean;
  readonly continuationBoundary: {
    readonly readinessReferenced: boolean;
    readonly replaySafeStateReferenced: boolean;
    readonly nextTurnExecuted: false;
    readonly continuationSuccessClaim: false;
  };
  readonly resultTruthfulnessBoundary: {
    readonly ownerDomain: "result";
    readonly adapterObservedIsSuccess: false;
    readonly productIntegratedIsSuccess: false;
    readonly productSurfaceRenderedIsSuccess: false;
    readonly terminalSuccessClaim: false;
  };
  readonly notProvenClaims: readonly string[];
  readonly redaction: {
    readonly status: "report-safe" | "redacted";
    readonly excluded: readonly string[];
  };
  readonly nextAction: string;
  readonly terminalSuccessClaim: false;
}

export function projectProductLoopAdapter(
  input: ProductLoopAdapterInput,
): ProductLoopAdapterProjection {
  const adapterId = sanitizeText(input.adapterId).value;
  const promptSummary = sanitizeText(
    input.promptSummary ?? `loop=${input.loopTrajectory.loopId}`,
  ).value;
  const phaseStatus = getProductLoopPhaseStatusMap();
  const modelResponseBoundaryIds = input.loop?.turns.map((turn) =>
    turn.modelBoundary.responseId
  ) ?? input.loopTrajectory.stages.find((stage) =>
    stage.category === "model-boundary"
  )?.sourceIds ?? [];
  const toolCallBatchIds = input.loop?.turns.flatMap((turn) =>
    turn.normalizedToolCallBatch
      ? [turn.normalizedToolCallBatch.batchId]
      : turn.toolCallBatch
        ? [turn.toolCallBatch.id]
        : []
  ) ?? input.loopTrajectory.stages.find((stage) =>
    stage.category === "tool-call-batch"
  )?.sourceIds ?? [];
  const toolDispatchPlanIds = input.loop?.turns.flatMap((turn) =>
    turn.toolResultBatch?.dispatchPlan ? [turn.toolResultBatch.dispatchPlan.planId] : []
  ) ?? [];
  const resultFactIds = input.loopTrajectory.finalObservedFacts.resultStatus
    ? [`result:${input.loopTrajectory.finalObservedFacts.resultStatus}`]
    : [];
  const completionConsumer = projectCompletionConsumer(input.loopTrajectory);
  const unsupportedPhaseIds = phaseStatus
    .filter((entry) => entry.status === "unsupported")
    .map((entry) => entry.phaseId);
  const featureContracts = input.featureContracts ?? [];
  const phaseClaims = phaseStatus.flatMap((entry) => entry.notProvenClaims);
  const eventClaims = input.loopTrajectory.events.flatMap((event) =>
    event.notProvenClaims
  );
  const notProvenClaims = Object.freeze([
    ...new Set([
      "adapter-observed-is-not-success",
      "phase-product-integrated-is-not-success",
      "feature-contract-valid-is-not-success",
      "replay-safe-summary-is-not-success",
      "continuation-ready-is-not-success",
      "product-surface-rendered-is-not-success",
      "product-consumer-is-not-terminal-truth",
      "complete-product-view-requires-result-owned-verified-status-and-complete-packet",
      "session-carry-forward-is-not-terminal-truth",
      "host-display-is-not-terminal-truth",
      "terminal-success",
      ...input.loopTrajectory.notProvenClaims,
      ...completionConsumer.notProvenClaims,
      ...phaseClaims,
      ...eventClaims,
      ...featureContracts.flatMap((contract) => contract.notProvenClaims),
    ]),
  ]);

  return deepFreeze({
    adapterId,
    observationMode: "host-adapter",
    promptSummary,
    ownerDomain: "runtime/loop",
    hostConsumers: ["core/shell", "presentation", "runtime/events"],
    safeReferences: {
      turnSnapshotIds: input.loopTrajectory.snapshotIds,
      modelResponseBoundaryIds: Object.freeze(modelResponseBoundaryIds.map((id) => sanitizeText(id).value)),
      assistantResponseIds: Object.freeze(modelResponseBoundaryIds.map((id) => `assistant:${sanitizeText(id).value}`)),
      toolCallBatchIds: Object.freeze(toolCallBatchIds.map((id) => sanitizeText(id).value)),
      toolDispatchPlanIds: Object.freeze(toolDispatchPlanIds.map((id) => sanitizeText(id).value)),
      toolResultMessageIds: input.loopTrajectory.toolResultMessageIds,
      savePointIds: input.loopTrajectory.savePointIds,
      nextTurnBundleIds: input.loopTrajectory.nextTurnBundleIds,
      steeringMessageIds: input.loopTrajectory.steeringMessageIds,
      followUpMessageIds: input.loopTrajectory.followUpMessageIds,
      deliveryPolicyIds: input.loopTrajectory.deliveryPolicyIds,
      verificationHandoffIds: input.loopTrajectory.verificationIntentIds,
      repairHandoffIds: input.loopTrajectory.repairHandoffIds,
      sessionActivePathIds: input.loopTrajectory.sessionProjectionIds,
      contextRebuildInputIds: input.contextRebuildInput
        ? [input.contextRebuildInput.rebuildInputId]
        : input.loopTrajectory.contextRebuildInputIds,
      contextRebuildProjectionIds: input.loopTrajectory.contextRebuildProjectionIds,
      continuationReadinessIds: input.continuationReadiness
        ? [input.continuationReadiness.readinessId]
        : input.loopTrajectory.continuationReadinessIds,
      replaySafeLoopStateSummaryIds: input.replaySafeLoopStateSummary
        ? [input.replaySafeLoopStateSummary.summaryId]
        : input.loopTrajectory.replaySafeLoopStateSummaryIds,
      providerMetadataIds: input.providerRegistry
        ? [
          ...input.providerRegistry.providers.map((provider) => provider.providerId),
          ...input.providerRegistry.models.map((model) => model.modelId),
        ]
        : input.loopTrajectory.providerMetadataIds,
      runtimeEventIds: input.loopTrajectory.eventIds,
      jsonStreamIds: input.loopTrajectory.jsonEventStream.map((entry) => entry.eventId),
      productSurfaceSectionIds: input.loopTrajectory.productSurfaceSectionIds,
      resultFactIds: Object.freeze(resultFactIds),
      productCompletionPacketIds: completionConsumer.packetIds,
    },
    completionConsumer,
    phaseStatus,
    unsupportedPhaseIds: Object.freeze(unsupportedPhaseIds),
    featureContracts,
    featureContractAvailable: true,
    continuationBoundary: {
      readinessReferenced:
        input.loopTrajectory.continuationReadinessIds.length > 0 ||
        Boolean(input.continuationReadiness),
      replaySafeStateReferenced:
        input.loopTrajectory.replaySafeLoopStateSummaryIds.length > 0 ||
        Boolean(input.replaySafeLoopStateSummary),
      nextTurnExecuted: false,
      continuationSuccessClaim: false,
    },
    resultTruthfulnessBoundary: {
      ownerDomain: "result",
      adapterObservedIsSuccess: false,
      productIntegratedIsSuccess: false,
      productSurfaceRenderedIsSuccess: false,
      terminalSuccessClaim: false,
    },
    notProvenClaims,
    redaction: {
      status: input.loopTrajectory.redaction.status,
      excluded: input.loopTrajectory.redaction.excluded,
    },
    nextAction: sanitizeText(input.nextAction ??
      "connect future capability blocks through the feature integration contract").value,
    terminalSuccessClaim: false,
  });
}

function projectCompletionConsumer(
  loopTrajectory: LoopTrajectoryProjection,
): ProductLoopCompletionConsumerProjection {
  const packetEvents = loopTrajectory.events.filter((event) =>
    event.type === "product-completion-packet-observed"
  );
  const packetIds = loopTrajectory.productCompletionPacketIds.length > 0
    ? loopTrajectory.productCompletionPacketIds
    : packetEvents.flatMap((event) =>
      typeof event.facts.packetId === "string" ? [event.facts.packetId] : []
    );
  const latest = packetEvents.at(-1);
  if (!latest) {
    return deepFreeze({
      observed: false,
      viewStatus: "not_observed",
      packetIds: Object.freeze(packetIds.map((id) => sanitizeText(id).value)),
      missingProofItems: Object.freeze([]),
      notProvenClaims: Object.freeze([
        "product-completion-packet-not-observed",
        "product-consumer-is-not-terminal-truth",
        "complete-product-view-requires-result-owned-verified-status-and-complete-packet",
        "terminal-success",
      ]),
      terminalSuccessClaim: false,
    });
  }

  const facts = latest.facts;
  const resultOwnedTerminalStatus = factString(facts.resultOwnedTerminalStatus);
  const loopDecision = factString(facts.loopDecision);
  const closeoutState = factString(facts.closeoutState);
  const packetStatus = factString(facts.status);
  const missingProofItems = factStringArray(facts.missingProofItems);
  const completeProductView = facts.complete === true &&
    packetStatus === "complete" &&
    resultOwnedTerminalStatus === "verified_with_repair" &&
    loopDecision === "stop_complete" &&
    closeoutState === "complete" &&
    missingProofItems.length === 0;
  const originalFailureSummary = factOriginalFailureSummary(facts.originalFailure);
  const repairChainSummary = facts.applyObservationFacts && typeof facts.applyObservationFacts === "object"
    ? `apply=${factString((facts.applyObservationFacts as Record<string, unknown>).repairApplyStatus) ?? "unknown"}; receipts=${factStringArray((facts.applyObservationFacts as Record<string, unknown>).applyReceiptIds).length}`
    : undefined;
  const postRepairVerificationSummary = facts.postRepairVerificationFacts &&
      typeof facts.postRepairVerificationFacts === "object"
    ? `status=${factString((facts.postRepairVerificationFacts as Record<string, unknown>).resultStatus) ?? "unknown"}; required=${factString((facts.postRepairVerificationFacts as Record<string, unknown>).requirementStatus) ?? "unknown"}`
    : undefined;

  return deepFreeze({
    observed: true,
    viewStatus: completeProductView ? "complete_view" : "incomplete_view",
    packetIds: Object.freeze(packetIds.map((id) => sanitizeText(id).value)),
    ...(resultOwnedTerminalStatus ? { resultOwnedTerminalStatus } : {}),
    ...(loopDecision ? { loopDecision } : {}),
    ...(closeoutState ? { closeoutState } : {}),
    ...(packetStatus ? { packetStatus } : {}),
    ...(originalFailureSummary ? { originalFailureSummary } : {}),
    ...(repairChainSummary ? { repairChainSummary } : {}),
    ...(postRepairVerificationSummary ? { postRepairVerificationSummary } : {}),
    missingProofItems: Object.freeze(missingProofItems),
    ...(factString(facts.nextAction)
      ? { nextAction: factString(facts.nextAction) }
      : {}),
    notProvenClaims: Object.freeze([
      ...new Set([
        "product-consumer-is-not-terminal-truth",
        "session-carry-forward-is-not-terminal-truth",
        "host-display-is-not-terminal-truth",
        "event-emission-is-not-terminal-truth",
        "complete-product-view-requires-result-owned-verified-status-and-complete-packet",
        "incomplete-proof-cannot-become-complete",
        "original-failure-must-remain-visible",
        ...(completeProductView ? [] : ["product-completion-consumer-is-not-complete"]),
        ...latest.notProvenClaims,
      ]),
    ]),
    terminalSuccessClaim: false,
  });
}

function factString(value: unknown): string | undefined {
  return typeof value === "string" ? sanitizeText(value).value : undefined;
}

function factStringArray(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? Object.freeze(value.flatMap((item) =>
      typeof item === "string" ? [sanitizeText(item).value] : []
    ))
    : Object.freeze([]);
}

function factOriginalFailureSummary(value: unknown): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const facts = value as Record<string, unknown>;
  const verificationFailureId = factString(facts.verificationFailureId) ?? "unknown";
  const failureClass = factString(facts.failureClass) ?? "unknown";
  const status = factString(facts.status) ?? "unknown";
  const summary = factString(facts.summary) ?? "not-recorded";
  return `id=${verificationFailureId}; class=${failureClass}; status=${status}; summary=${summary}`;
}
export interface RuntimeProductLoopAdapterObservationEvent {
  readonly id: string;
  readonly sequence: number;
  readonly type: "product-loop-adapter-observed";
  readonly facts: {
    readonly adapterId: string;
    readonly observationMode: string;
    readonly phaseStatusCount: number;
    readonly unsupportedPhaseIds: readonly string[];
    readonly featureContractAvailable: boolean;
    readonly notProvenClaims: readonly string[];
    readonly terminalSuccessClaim: false;
  };
  readonly notProvenClaims: readonly string[];
  readonly redaction: {
    readonly status: "report-safe" | "redacted";
    readonly excluded: readonly string[];
  };
}

export function projectProductLoopAdapterObservationEvent(
  adapter: ProductLoopAdapterProjection,
  sequence: number,
): RuntimeProductLoopAdapterObservationEvent {
  return deepFreeze({
    id: `product-loop-adapter-observed-${sequence}`,
    sequence,
    type: "product-loop-adapter-observed",
    facts: {
      adapterId: adapter.adapterId,
      observationMode: adapter.observationMode,
      phaseStatusCount: adapter.phaseStatus.length,
      unsupportedPhaseIds: adapter.unsupportedPhaseIds,
      featureContractAvailable: adapter.featureContractAvailable,
      notProvenClaims: adapter.notProvenClaims.slice(0, 20),
      terminalSuccessClaim: false,
    },
    notProvenClaims: adapter.notProvenClaims,
    redaction: adapter.redaction,
  });
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
    .replace(/\bhidden reasoning[:=]?[^\n\r]*/gi, "hidden-reasoning=[raw-content-excluded]");
  return { value: sanitized, redacted: sanitized !== before };
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
