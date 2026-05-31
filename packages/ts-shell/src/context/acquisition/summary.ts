import type { ContextEngineResult } from "./engine.js";
import { projectContextAcquisition } from "./projection.js";
import type { PlanningMutationHandoffProjection } from "../../planning/handoff/mutation.js";
import type { PlanningRuntimeResult } from "../../planning/runtime/engine.js";
import type { ContinuationReadinessProjection } from "../../session/continuation/readiness.js";
import type { ReplaySafeLoopStateSummary } from "../../session/replay/state.js";

export type ContextPlanningBlockStatus =
  | "product_surface_ready"
  | "review_only_ready"
  | "partial_required_facts_missing"
  | "blocked_stale_context"
  | "blocked_ambiguous_target"
  | "blocked_missing_required_context"
  | "unsupported"
  | "not_proven";

export interface ContextPlanningBlockSummary {
  readonly summaryId: string;
  readonly status: ContextPlanningBlockStatus;
  readonly discovery: {
    readonly scanProfileId: string;
    readonly selectedCandidateIds: readonly string[];
    readonly competingCandidateIds: readonly string[];
    readonly ambiguityState: string;
    readonly omittedCandidateCount: number;
    readonly missingDiscoveryFacts: readonly string[];
  };
  readonly acquisition: {
    readonly mode: string;
    readonly stagedReadStatus: string;
    readonly readBudgetStatus: string;
    readonly packetProvenanceCount: number;
    readonly graphConfidence: string;
    readonly unavailableGraphComponents: readonly string[];
    readonly staleFacts: readonly string[];
    readonly requiredMissingFacts: readonly string[];
    readonly optionalMissingFacts: readonly string[];
    readonly nextReadSuggestions: readonly string[];
    readonly contextSufficiencyStatus: string;
  };
  readonly planning: {
    readonly qualityStatus: string;
    readonly planConfidence: string;
    readonly assumptions: readonly string[];
    readonly constraints: readonly string[];
    readonly nextAction: string;
  };
  readonly handoff: {
    readonly editHandoffStatus: string;
    readonly editNoWriteStatus: string;
    readonly mutationAuthority: "not-granted";
    readonly exactProposalReadiness: string;
    readonly verificationIntentStatus: string;
    readonly verificationSelectedNotRunStatus: string;
  };
  readonly continuation: {
    readonly memoryReuseStatus: string;
    readonly memoryFreshnessRequirement: string;
    readonly requiredRefreshReads: readonly string[];
    readonly optionalRefreshReads: readonly string[];
    readonly continuationReadinessStatus: string;
    readonly replaySafePlanningStateIds: readonly string[];
  };
  readonly notProvenClaims: readonly string[];
  readonly nextAction: string;
  readonly redaction: {
    readonly status: "report-safe";
    readonly excluded: readonly string[];
  };
  readonly evidence: readonly string[];
  readonly terminalSuccessClaim: false;
}

const REDACTION_EXCLUSIONS = [
  "api-keys",
  "provider.env",
  "raw-provider-output",
  "oldText",
  "newText",
  "unredacted-command-output",
  "hidden-reasoning",
  "transcript-dumps",
  "unsafe-file-contents",
] as const;

export function buildContextPlanningBlockSummary(input: {
  readonly context: ContextEngineResult;
  readonly planning?: PlanningRuntimeResult;
  readonly mutationHandoff?: PlanningMutationHandoffProjection;
  readonly continuationReadiness?: ContinuationReadinessProjection;
  readonly replaySafeLoopStateSummary?: ReplaySafeLoopStateSummary;
}): ContextPlanningBlockSummary {
  const acquisition = projectContextAcquisition(input.context);
  const stagedAcquisition = input.context.contextAcquisitionHandoff;
  const planning = input.planning;
  const handoff = input.mutationHandoff ?? planning?.mutationHandoff;
  const memory = input.context.memory;
  const requiredMissingFacts = unique([
    ...input.context.missingFacts,
    ...(stagedAcquisition?.requiredMissingFacts ?? []),
    ...(planning?.planQualityFacts.requiredMissingFacts ?? []),
  ]);
  const optionalMissingFacts = unique([
    ...(stagedAcquisition?.optionalMissingFacts ?? []),
    ...(planning?.planQualityFacts.optionalMissingFacts ?? []),
    ...memory.planningWarnings,
  ]);
  const staleFacts = unique([
    ...(stagedAcquisition?.staleContext.staleLabels ?? []),
    ...(stagedAcquisition?.staleContext.warnings ?? []),
    ...memory.invalidation.staleFiles,
    ...memory.invalidation.invalidationSignals,
    ...(input.continuationReadiness?.staleFacts ?? []),
  ]);
  const nextReadSuggestions = unique([
    ...input.context.nextReadSuggestions,
    ...(stagedAcquisition?.nextReadSuggestions.map((item) => item.target) ?? []),
    ...memory.discoveryHandoff.nextReadSuggestions,
    ...(input.continuationReadiness?.requiredRefreshReads ?? []),
  ]);
  const notProvenClaims = unique([
    "context-planning-summary-is-not-task-success",
    "product-surface-rendered-is-not-success",
    "discovery-found-is-not-correct-target",
    "context-read-is-not-repository-understanding",
    "context-sufficient-for-review-only-is-not-edit-authority",
    "plan-generated-is-not-executable-work",
    "edit-handoff-ready-is-not-mutation-authority",
    "verification-intent-selected-is-not-verification-passed",
    "memory-reused-is-not-fresh-enough-context",
    "continuation-ready-is-not-task-success",
    "loop-observation-is-not-terminal-success",
    ...input.context.discoveryHandoff.notProvenClaims,
    ...(stagedAcquisition?.notProvenClaims ?? []),
    ...memory.reuseEligibility.notProvenClaims,
    ...memory.discoveryHandoff.notProvenClaims,
    ...memory.planningHandoff.notProvenClaims,
    ...(planning?.planQualityFacts.notProvenClaims ?? []),
    ...(planning?.editHandoff.notProvenClaims ?? []),
    ...(planning?.verificationHandoff.notProvenClaims ?? []),
    ...(handoff?.notProvenClaims ?? []),
    ...(input.continuationReadiness?.notProvenClaims ?? []),
    ...(input.replaySafeLoopStateSummary?.notProvenClaims ?? []),
  ]);
  const status = selectBlockStatus({
    contextStatus: input.context.status,
    ambiguityState: input.context.discoveryHandoff.ambiguityState,
    requiredMissingFacts,
    staleFacts,
    planningQualityStatus: planning?.planQualityFacts.planConfidence,
    handoffReadiness: handoff?.readiness,
  });
  const nextAction = selectNextAction({
    status,
    contextNextReads: nextReadSuggestions,
    planningNextAction: planning?.planQualityFacts.nextAction,
    handoffNextAction: handoff?.nextAction,
    memoryRefresh: memory.reuseEligibility.requiredRefreshSuggestions,
  });

  return {
    summaryId: `context-planning-summary:${input.context.engineId}`,
    status,
    discovery: {
      scanProfileId: input.context.discoveryHandoff.scanProfileId,
      selectedCandidateIds: input.context.discoveryHandoff.selectedCandidateIds,
      competingCandidateIds: input.context.discoveryHandoff.competingCandidateIds,
      ambiguityState: input.context.discoveryHandoff.ambiguityState,
      omittedCandidateCount: input.context.discoveryHandoff.omittedCandidateFacts.length,
      missingDiscoveryFacts: input.context.discoveryHandoff.missingDiscoveryFacts,
    },
    acquisition: {
      mode: acquisition.mode,
      stagedReadStatus: acquisition.enoughContext,
      readBudgetStatus:
        stagedAcquisition?.readBudget.budgetExhausted === true
          ? "budget-exhausted"
          : `filesRead=${acquisition.budget.filesRead}; bytes=${acquisition.budget.bytesUsed}`,
      packetProvenanceCount: stagedAcquisition?.packetProvenance.length ?? acquisition.reads.length,
      graphConfidence: stagedAcquisition
        ? `components=${Object.keys(stagedAcquisition.graphScoring.components).length}; unavailable=${stagedAcquisition.graphScoring.unavailableComponents.length}`
        : "not-proven",
      unavailableGraphComponents: stagedAcquisition?.graphScoring.unavailableComponents ?? [],
      staleFacts,
      requiredMissingFacts,
      optionalMissingFacts,
      nextReadSuggestions,
      contextSufficiencyStatus: stagedAcquisition?.sufficiencyDecision.status ??
        acquisition.sufficiencyState ??
        acquisition.enoughContext,
    },
    planning: {
      qualityStatus: planning?.planQualityFacts.planConfidence ?? memory.planQualityLevel ?? "not-proven",
      planConfidence: planning?.planQualityFacts.planConfidence ?? "not-proven",
      assumptions: planning?.assumptions ?? memory.planningHandoff.assumptionsRemainValid,
      constraints: planning?.constraints ?? memory.planningHandoff.constraintsRemainActive,
      nextAction: planning?.planQualityFacts.nextAction ?? memory.handoffSummary,
    },
    handoff: {
      editHandoffStatus: handoff?.readiness ?? planning?.editHandoff.exactProposalReadiness ?? "not-proven",
      editNoWriteStatus: handoff?.noWriteStatus ?? planning?.editHandoff.noWriteStatus ?? "no-write-authority-granted",
      mutationAuthority: "not-granted",
      exactProposalReadiness: handoff?.exactProposalReadiness ?? planning?.editHandoff.exactProposalReadiness ?? "missing",
      verificationIntentStatus: handoff?.verificationIntent.available === true ||
        planning?.verificationHandoff.taskRelevanceStatus === "candidate-relevant"
        ? "selected-not-run"
        : "not-selected",
      verificationSelectedNotRunStatus: planning?.verificationHandoff.selectedNotRunStatus ?? "selected-not-run",
    },
    continuation: {
      memoryReuseStatus: memory.reuseEligibility.status,
      memoryFreshnessRequirement: memory.reuseEligibility.freshnessRequirement,
      requiredRefreshReads: unique([
        ...memory.reuseEligibility.requiredRefreshSuggestions,
        ...(input.continuationReadiness?.requiredRefreshReads ?? []),
      ]),
      optionalRefreshReads: unique([
        ...memory.reuseEligibility.optionalRefreshSuggestions,
        ...(input.continuationReadiness?.optionalRefreshReads ?? []),
      ]),
      continuationReadinessStatus: input.continuationReadiness?.contextReadinessStatus ?? "not-proven",
      replaySafePlanningStateIds: unique([
        memory.planningHandoff.replaySafePlanningState.replayStateId,
        ...(input.replaySafeLoopStateSummary?.replaySafePlanningStateIds ?? []),
      ]),
    },
    notProvenClaims,
    nextAction,
    redaction: {
      status: "report-safe",
      excluded: REDACTION_EXCLUSIONS,
    },
    evidence: unique([
      `context-planning-summary:context-engine:${input.context.engineId}`,
      `context-planning-summary:scan-profile:${input.context.discoveryHandoff.scanProfileId}`,
      `context-planning-summary:memory:${memory.memoryId}`,
      ...(planning ? [`context-planning-summary:planning:${planning.runtimeId}`] : []),
      ...(handoff ? [`context-planning-summary:handoff:${handoff.handoffId}`] : []),
      ...(input.continuationReadiness ? [`context-planning-summary:continuation:${input.continuationReadiness.readinessId}`] : []),
      "context-planning-summary:terminal-success:false",
      "context-planning-summary:raw-content-excluded",
    ]),
    terminalSuccessClaim: false,
  };
}

function selectBlockStatus(input: {
  readonly contextStatus: ContextEngineResult["status"];
  readonly ambiguityState: string;
  readonly requiredMissingFacts: readonly string[];
  readonly staleFacts: readonly string[];
  readonly planningQualityStatus?: string;
  readonly handoffReadiness?: string;
}): ContextPlanningBlockStatus {
  if (input.ambiguityState === "no-candidate" || input.ambiguityState === "multiple-plausible-candidates") {
    return "blocked_ambiguous_target";
  }
  if (input.contextStatus === "insufficient-context") return "unsupported";
  if (input.staleFacts.length > 0) return "blocked_stale_context";
  if (input.requiredMissingFacts.length > 0) return "blocked_missing_required_context";
  if (input.ambiguityState === "weak-signal-candidate") return "partial_required_facts_missing";
  if (input.handoffReadiness === "ready" || input.handoffReadiness === "review-ready") {
    return "review_only_ready";
  }
  if (input.planningQualityStatus && input.planningQualityStatus !== "not-proven") {
    return "review_only_ready";
  }
  return "product_surface_ready";
}

function selectNextAction(input: {
  readonly status: ContextPlanningBlockStatus;
  readonly contextNextReads: readonly string[];
  readonly planningNextAction?: string;
  readonly handoffNextAction?: string;
  readonly memoryRefresh: readonly string[];
}): string {
  if (input.status === "blocked_stale_context" || input.status === "blocked_missing_required_context") {
    return input.contextNextReads[0]
      ? `refresh required context: ${input.contextNextReads[0]}`
      : input.memoryRefresh[0] ?? "refresh required context before planning handoff";
  }
  if (input.status === "blocked_ambiguous_target") {
    return "resolve target ambiguity before edit or verification handoff";
  }
  return input.handoffNextAction ?? input.planningNextAction ?? input.contextNextReads[0] ?? "review context planning facts; terminalSuccessClaim=false";
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}
