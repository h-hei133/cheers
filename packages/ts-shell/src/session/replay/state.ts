import type { LoopContextRebuildInput } from "../../context/rebuildInput.js";
import type { MultiTargetMutationProjection } from "../../edit/multifile/model.js";
import type { ControlledMutationRecoveryProjection } from "../../edit/recovery/model.js";
import type { SessionContextRebuildProjection } from "../../context/sessionContextRebuildProjection.js";
import type { RuntimeEvidenceSavePoint } from "../../evidence/savepoint/model.js";
import type { NextTurnModelRequestPreparation } from "../../provider/request/boundary.js";
import type { ControlledModelInvocationAdapterProjection } from "../../provider/request/attempt.js";
import type { ToolOutcomeBundleProjection } from "../../tools/toolOutcomeBundle.js";
import type { ToolBatchDispatchPlan } from "../../tools/toolBatchDispatch.js";
import type { ReplaySafePlanningStateFacts } from "../../context/memory/model.js";
import type { RepairApplyObservation, RepairProposalObservation, RepairRequiredHandoff } from "../../repair/handoff/boundary.js";
import type { NextTurnBundleProjection } from "../../turn/nextTurnBundle.js";
import type { ToolResultMessageBatch } from "../../turn/toolResultMessage.js";
import type { VerificationLoopIntent, VerificationResultObservation } from "../../verification/result/boundary.js";
import type { ContinuationReadinessProjection } from "../continuation/readiness.js";
import type { SessionTreeProjection } from "../sessionTreeProjection.js";

export interface ReplaySafeLoopStateSummary {
  readonly summaryId: string;
  readonly sourceSessionId: string;
  readonly activePathId: string;
  readonly activeBranchId?: string;
  readonly branchSupport: string;
  readonly branchFactIds: readonly string[];
  readonly branchBlockedReasons: readonly string[];
  readonly compactionStatus: string;
  readonly compactionIds: readonly string[];
  readonly retainedContextFactIds: readonly string[];
  readonly excludedContextFactIds: readonly string[];
  readonly compactionBlockedReasons: readonly string[];
  readonly latestSavePointId?: string;
  readonly nextTurnBundleId?: string;
  readonly requestPreparationId?: string;
  readonly requestReadinessStatus?: string;
  readonly requestBlockedReasons: readonly string[];
  readonly providerRequestFacts?: {
    readonly providerSafeLabel: string;
    readonly modelSafeLabel: string;
    readonly configReadiness: string;
    readonly authReadiness: string;
    readonly compatibilityState: string;
    readonly supportedModes: readonly string[];
    readonly knownUnsupportedStates: readonly string[];
    readonly terminalSuccessClaim: false;
  };
  readonly providerInvocationIds: readonly string[];
  readonly providerInvocationStatus?: {
    readonly gateId: string;
    readonly attemptStatus: string;
    readonly failureClass?: string;
    readonly fallbackEligibility: string;
    readonly fallbackStatus?: string;
    readonly fallbackAttempted: boolean;
    readonly responseHandoffId?: string;
    readonly terminalSuccessClaim: false;
  };
  readonly toolOutcomeBundleId?: string;
  readonly toolOutcomeStatus?: string;
  readonly toolOutcomeNextAction?: string;
  readonly toolSchedulingPlanId?: string;
  readonly toolSchedulingStatus?: string;
  readonly toolSchedulingParallelGroupIds?: readonly string[];
  readonly toolSchedulingSequentialGroupIds?: readonly string[];
  readonly toolSchedulingBlockedCallIds?: readonly string[];
  readonly toolSchedulingDeterministicOrder?: readonly string[];
  readonly toolOutcomeBlockedReasons: readonly string[];
  readonly continuationReadinessStatus?: string;
  readonly steeringMessageIds: readonly string[];
  readonly followUpMessageIds: readonly string[];
  readonly toolResultMessageIds: readonly string[];
  readonly verificationHandoffIds: readonly string[];
  readonly repairHandoffIds: readonly string[];
  readonly mutationRuntimeIds: readonly string[];
  readonly mutationRuntimeStatus?: {
    readonly targetCount: number;
    readonly conflictCount: number;
    readonly eligibleCount: number;
    readonly forcedSequentialCount: number;
    readonly groupCount: number;
    readonly parallelGroupCount: number;
    readonly settlementCount: number;
    readonly readyCount: number;
    readonly appliedCount: number;
    readonly failedCount: number;
    readonly revertedCount: number;
    readonly groupVerification: readonly string[];
    readonly wholeTaskVerification: string;
    readonly verdict: string;
    readonly terminalSuccessClaim: false;
  };
  readonly mutationRecoveryIds: readonly string[];
  readonly mutationRecoveryStatus?: {
    readonly authority: string;
    readonly staleRead: string;
    readonly snapshot: string;
    readonly apply: string;
    readonly recoveryDecision: string;
    readonly rollback: string;
    readonly verdict: string;
    readonly terminalSuccessClaim: false;
  };
  readonly contextRebuildInputId?: string;
  readonly contextRebuildProjectionId: string;
  readonly continuationReadinessId: string;
  readonly replaySafePlanningStateIds: readonly string[];
  readonly planningQualityIds: readonly string[];
  readonly discoveryHandoffIds: readonly string[];
  readonly stagedContextIds: readonly string[];
  readonly terminalResultFacts: {
    readonly status?: string;
    readonly terminalClassification?: string;
    readonly terminalReason?: string;
    readonly terminalSuccessClaim: false;
  };
  readonly productCompletionCarryForwardFacts?: {
    readonly status?: string;
    readonly resultOwnedTerminalStatus?: string;
    readonly loopDecision?: string;
    readonly closeoutState?: string;
    readonly originalFailureSummary?: string;
    readonly repairChainSummary?: string;
    readonly postRepairVerificationSummary?: string;
    readonly missingProofItems: readonly string[];
    readonly nextAction?: string;
    readonly notProvenClaims: readonly string[];
    readonly terminalSuccessClaim: false;
  };
  readonly notProvenClaims: readonly string[];
  readonly redaction: {
    readonly status: "report-safe" | "redacted";
    readonly excluded: readonly string[];
  };
  readonly terminalSuccessClaim: false;
}

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

export function summarizeReplaySafeLoopState(input: {
  readonly sessionProjection: SessionTreeProjection;
  readonly contextRebuildProjection: SessionContextRebuildProjection;
  readonly continuationReadiness: ContinuationReadinessProjection;
  readonly rebuildInput?: LoopContextRebuildInput;
  readonly savePoint?: RuntimeEvidenceSavePoint;
  readonly nextTurnBundle?: NextTurnBundleProjection;
  readonly requestPreparation?: NextTurnModelRequestPreparation;
  readonly toolOutcomeBundle?: ToolOutcomeBundleProjection;
  readonly toolDispatchPlan?: ToolBatchDispatchPlan;
  readonly toolResultMessages?: ToolResultMessageBatch;
  readonly verificationIntents?: readonly VerificationLoopIntent[];
  readonly verificationResults?: readonly VerificationResultObservation[];
  readonly repairRequiredHandoffs?: readonly RepairRequiredHandoff[];
  readonly repairProposals?: readonly RepairProposalObservation[];
  readonly repairApplyObservations?: readonly RepairApplyObservation[];
  readonly multiTargetMutations?: readonly MultiTargetMutationProjection[];
  readonly mutationRecoveries?: readonly ControlledMutationRecoveryProjection[];
  readonly controlledModelInvocations?: readonly ControlledModelInvocationAdapterProjection[];
  readonly replaySafePlanningStates?: readonly ReplaySafePlanningStateFacts[];
  readonly terminalResultFacts?: {
    readonly status?: string;
    readonly terminalClassification?: string;
    readonly terminalReason?: string;
  };
}): ReplaySafeLoopStateSummary {
  const verificationHandoffIds = [
    ...(input.verificationIntents ?? []).map((item) => item.intentId),
    ...(input.verificationResults ?? []).map((item) => item.verificationId),
  ];
  const repairHandoffIds = [
    ...(input.repairRequiredHandoffs ?? []).map((item) => item.handoffId),
    ...(input.repairProposals ?? []).map((item) => item.proposalId),
    ...(input.repairApplyObservations ?? []).map((item) => item.repairApplyId),
  ];
  const mutationRuntimes = input.multiTargetMutations ?? [];
  const latestMutationRuntime = mutationRuntimes.at(-1);
  const mutationRecoveries = input.mutationRecoveries ?? [];
  const latestMutationRecovery = mutationRecoveries.at(-1);
  const controlledInvocations = input.controlledModelInvocations ?? [];
  const latestInvocation = controlledInvocations.at(-1);
  const replaySafePlanningStates = input.replaySafePlanningStates ?? [];
  return deepFreeze({
    summaryId: `replay-safe-loop-state:${input.sessionProjection.sessionIdentity}:${input.sessionProjection.activeLeafId}`,
    sourceSessionId: input.sessionProjection.sessionIdentity,
    activePathId: `${input.sessionProjection.sessionIdentity}:active-path:${input.sessionProjection.activeLeafId}`,
    ...(input.sessionProjection.activeBranchId
      ? { activeBranchId: input.sessionProjection.activeBranchId }
      : {}),
    branchSupport: input.sessionProjection.branchSupport,
    branchFactIds: input.sessionProjection.branchFacts.branchIds,
    branchBlockedReasons: [
      ...input.sessionProjection.branchFacts.missingParentIds.map((id) => `branch-parent-missing:${id}`),
      ...(input.sessionProjection.branchFacts.activeLeafResolution === "missing"
        ? ["active-leaf-missing"]
        : []),
    ],
    compactionStatus: input.sessionProjection.compaction.availability,
    compactionIds: input.sessionProjection.compaction.records.map((record) => record.compactionId),
    retainedContextFactIds: input.sessionProjection.compaction.records.flatMap((record) => record.retainedContextFactIds),
    excludedContextFactIds: input.sessionProjection.compaction.records.flatMap((record) => record.excludedContextFactIds),
    compactionBlockedReasons: [
      ...input.sessionProjection.compaction.records.flatMap((record) => record.staleInputIds.map((id) => `compaction-stale:${id}`)),
      ...input.sessionProjection.compaction.records.flatMap((record) => record.unsafeInputIds.map((id) => `compaction-unsafe:${id}`)),
      ...input.sessionProjection.compaction.records.flatMap((record) => record.missingFactIds.map((id) => `compaction-missing:${id}`)),
      ...input.sessionProjection.compaction.records.flatMap((record) => record.unsupportedFactIds.map((id) => `compaction-unsupported:${id}`)),
    ],
    ...(input.savePoint ? { latestSavePointId: input.savePoint.id } : {}),
    ...(input.nextTurnBundle ? { nextTurnBundleId: input.nextTurnBundle.bundleId } : {}),
    ...(input.requestPreparation
      ? {
          requestPreparationId: input.requestPreparation.requestPreparationId,
          requestReadinessStatus: input.requestPreparation.readinessStatus,
        }
      : {}),
    requestBlockedReasons: input.requestPreparation?.blockedReasons ?? [],
    ...(input.requestPreparation
      ? {
          providerRequestFacts: {
            providerSafeLabel: input.requestPreparation.providerMetadata.providerSafeLabel,
            modelSafeLabel: input.requestPreparation.providerMetadata.modelSafeLabel,
            configReadiness: input.requestPreparation.providerMetadata.configReadiness,
            authReadiness: input.requestPreparation.providerMetadata.authReadiness,
            compatibilityState: input.requestPreparation.providerMetadata.compatibilityState,
            supportedModes: input.requestPreparation.providerMetadata.supportedModes,
            knownUnsupportedStates: input.requestPreparation.providerMetadata.knownUnsupportedStates,
            terminalSuccessClaim: false,
          },
        }
      : {}),
    providerInvocationIds: controlledInvocations.map((item) => item.adapterId),
    ...(latestInvocation
      ? {
          providerInvocationStatus: {
            gateId: latestInvocation.sourceGateId,
            attemptStatus: latestInvocation.outcome.status,
            ...(latestInvocation.outcome.failureClass
              ? { failureClass: latestInvocation.outcome.failureClass }
              : {}),
            fallbackEligibility: latestInvocation.outcome.fallbackEligibility,
            ...(latestInvocation.outcome.fallbackStatus
              ? { fallbackStatus: latestInvocation.outcome.fallbackStatus }
              : {}),
            fallbackAttempted: latestInvocation.outcome.fallbackAttempted,
            ...(latestInvocation.outcome.responseHandoffId
              ? { responseHandoffId: latestInvocation.outcome.responseHandoffId }
              : {}),
            terminalSuccessClaim: false,
          },
        }
      : {}),
    ...(input.toolOutcomeBundle
      ? {
          toolOutcomeBundleId: input.toolOutcomeBundle.bundleId,
          toolOutcomeStatus: input.toolOutcomeBundle.carryForwardFacts.status,
          toolOutcomeNextAction: input.toolOutcomeBundle.carryForwardFacts.nextAction,
        }
      : {}),
    ...(input.toolDispatchPlan
      ? {
          toolSchedulingPlanId: input.toolDispatchPlan.schedulingPlan.scheduleId,
          toolSchedulingStatus: input.toolDispatchPlan.schedulingPlan.executionMode,
          toolSchedulingParallelGroupIds: input.toolDispatchPlan.schedulingPlan.parallelGroupIds,
          toolSchedulingSequentialGroupIds: input.toolDispatchPlan.schedulingPlan.sequentialGroupIds,
          toolSchedulingBlockedCallIds: input.toolDispatchPlan.schedulingPlan.blockedCallIds,
          toolSchedulingDeterministicOrder: input.toolDispatchPlan.schedulingPlan.deterministicOrder,
        }
      : {}),
    toolOutcomeBlockedReasons: input.toolOutcomeBundle?.carryForwardFacts.blockedReasons ?? [],
    ...(input.requestPreparation?.continuationReadinessStatus
      ? { continuationReadinessStatus: input.requestPreparation.continuationReadinessStatus }
      : {}),
    steeringMessageIds: input.nextTurnBundle?.steeringMessageIds ?? [],
    followUpMessageIds: input.nextTurnBundle?.followUpMessageIds ?? [],
    toolResultMessageIds: input.toolResultMessages?.messages.map((message) => message.messageId) ?? [],
    verificationHandoffIds,
    repairHandoffIds,
    mutationRuntimeIds: mutationRuntimes.map((item) => item.laneId),
    ...(latestMutationRuntime
      ? {
          mutationRuntimeStatus: {
            targetCount: latestMutationRuntime.plan.targetCount,
            conflictCount: latestMutationRuntime.conflicts.length,
            eligibleCount: latestMutationRuntime.parallelEligibility.filter((item) => item.status === "eligible").length,
            forcedSequentialCount: latestMutationRuntime.parallelEligibility.filter((item) => item.status === "forced_sequential").length,
            groupCount: latestMutationRuntime.executionGroups.length,
            parallelGroupCount: latestMutationRuntime.executionGroups.filter((item) => item.mode === "parallel").length,
            settlementCount: latestMutationRuntime.settlements.length,
            readyCount: latestMutationRuntime.queue.filter((item) => item.state === "ready").length,
            appliedCount: latestMutationRuntime.queue.filter((item) => item.state === "applied").length,
            failedCount: latestMutationRuntime.queue.filter((item) => item.state === "failed").length,
            revertedCount: latestMutationRuntime.queue.filter((item) => item.state === "reverted").length,
            groupVerification: latestMutationRuntime.groupVerificationResults.map((item) => item.status),
            wholeTaskVerification: latestMutationRuntime.wholeTaskVerificationResult.status,
            verdict: latestMutationRuntime.verdictStatus,
            terminalSuccessClaim: false,
          },
        }
      : {}),
    mutationRecoveryIds: mutationRecoveries.map((item) => item.laneId),
    ...(latestMutationRecovery
      ? {
          mutationRecoveryStatus: {
            authority: latestMutationRecovery.authority.status,
            staleRead: latestMutationRecovery.staleRead.status,
            snapshot: latestMutationRecovery.snapshot.status,
            apply: latestMutationRecovery.apply.status,
            recoveryDecision: latestMutationRecovery.recoveryDecision,
            rollback: latestMutationRecovery.rollback.status,
            verdict: latestMutationRecovery.verdictStatus,
            terminalSuccessClaim: false,
          },
        }
      : {}),
    ...(input.rebuildInput ? { contextRebuildInputId: input.rebuildInput.rebuildInputId } : {}),
    contextRebuildProjectionId: `${input.contextRebuildProjection.rebuildSource.sessionIdentity}:context-rebuild:${input.contextRebuildProjection.rebuildSource.activeLeafId}`,
    continuationReadinessId: input.continuationReadiness.readinessId,
    replaySafePlanningStateIds: replaySafePlanningStates.map((state) => state.replayStateId),
    planningQualityIds: replaySafePlanningStates.flatMap((state) => state.planningQualityIds),
    discoveryHandoffIds: replaySafePlanningStates.flatMap((state) => state.discoveryHandoffIds),
    stagedContextIds: replaySafePlanningStates.flatMap((state) => state.stagedContextIds),
    terminalResultFacts: {
      ...input.terminalResultFacts,
      terminalSuccessClaim: false,
    },
    ...productCompletionCarryForwardFacts(input.savePoint),
    notProvenClaims: [
      "terminal-success",
      "task-success",
      "verification-success",
      "repair-success",
      "replay-safe-summary-is-not-success",
      "replay-state-available-is-not-plan-validity",
      "replayed-edit-handoff-is-not-mutation-authority",
      "replayed-verification-intent-is-not-verification-passed",
      "session-carry-forward-is-not-terminal-truth",
      "branch-facts-are-not-terminal-truth",
      "compaction-facts-are-not-terminal-truth",
      "context-completeness",
      ...replaySafePlanningStates.flatMap((state) => state.notProvenClaims),
      ...input.sessionProjection.terminal.notProvenClaims,
      ...input.contextRebuildProjection.notProvenClaims,
      ...input.continuationReadiness.notProvenClaims,
      ...(input.requestPreparation?.notProvenClaims ?? []),
      ...(input.toolOutcomeBundle?.notProvenClaims ?? []),
      ...(input.toolDispatchPlan?.notProvenClaims ?? []),
      ...mutationRuntimes.flatMap((item) => item.notProvenClaims),
      ...mutationRecoveries.flatMap((item) => item.notProvenClaims),
    ],
    redaction: {
      status:
        input.contextRebuildProjection.redaction.status === "redacted" ||
          input.continuationReadiness.redaction.status === "redacted" ||
          input.rebuildInput?.redaction.status === "redacted"
          ? "redacted"
          : "report-safe",
      excluded: REDACTION_EXCLUSIONS,
    },
    terminalSuccessClaim: false,
  });
}

function productCompletionCarryForwardFacts(
  savePoint?: RuntimeEvidenceSavePoint,
): { readonly productCompletionCarryForwardFacts?: ReplaySafeLoopStateSummary["productCompletionCarryForwardFacts"] } {
  if (!savePoint) {
    return {};
  }
  const facts = savePoint.pendingNextTurnFacts;
  const status = factValue(facts, "product-completion-packet-status:");
  const resultOwnedTerminalStatus = factValue(facts, "final-observed-result-status:");
  const loopDecision = factValue(facts, "loop-decision:");
  const closeoutState = factValue(facts, "closeout-state:");
  const originalFailureSummary = factValue(facts, "original-failure-summary:");
  const repairChainSummary = factValue(facts, "repair-chain-summary:");
  const postRepairVerificationSummary = factValue(facts, "verification-summary:");
  const missingProofItems = factValue(facts, "missing-proof-items:");
  const nextAction = factValue(facts, "next-action:");
  const notProvenClaims = factValue(facts, "not-proven-claims:");

  if (!status && !resultOwnedTerminalStatus && !loopDecision && !closeoutState) {
    return {};
  }

  return {
    productCompletionCarryForwardFacts: deepFreeze({
      ...(status ? { status } : {}),
      ...(resultOwnedTerminalStatus ? { resultOwnedTerminalStatus } : {}),
      ...(loopDecision ? { loopDecision } : {}),
      ...(closeoutState ? { closeoutState } : {}),
      ...(originalFailureSummary ? { originalFailureSummary } : {}),
      ...(repairChainSummary ? { repairChainSummary } : {}),
      ...(postRepairVerificationSummary ? { postRepairVerificationSummary } : {}),
      missingProofItems: splitFactList(missingProofItems),
      ...(nextAction ? { nextAction } : {}),
      notProvenClaims: splitFactList(notProvenClaims),
      terminalSuccessClaim: false,
    }),
  };
}

function factValue(facts: readonly string[], prefix: string): string | undefined {
  return facts.find((fact) => fact.startsWith(prefix))?.slice(prefix.length);
}

function splitFactList(value: string | undefined): readonly string[] {
  if (!value || value === "none") {
    return [];
  }
  return Object.freeze(value.split(",").filter((item) => item.length > 0));
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
}
