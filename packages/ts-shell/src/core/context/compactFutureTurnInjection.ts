import { adaptCompactCheckpointForFutureTurn } from "./compactFutureTurnAdapter.js";
import { evaluateCompactContinuityQuality } from "./compactContinuityQuality.js";
import { applyCompactInjectedContextBudget } from "./compactInjectedContextBudget.js";
import { formatCompactInjectedContext } from "./compactInjectedContextFormatter.js";
import type { CompactInjectionState } from "./compactInjectionState.js";
import {
  mergeWarningsIntoCandidate,
  planCompactInjectionMerge,
} from "./compactInjectionMergePolicy.js";
import type { CompactLiveCheckpoint } from "./compactLiveCheckpoint.js";

export interface CompactFutureTurnInjectionPlan {
  readonly shouldInject: boolean;
  readonly injectedContext?: string;
  readonly updatedInjectionState: CompactInjectionState;
  readonly warnings: readonly {
    readonly id: string;
    readonly message: string;
  }[];
  readonly evidence: readonly string[];
}

export interface PlanCompactFutureTurnInjectionInput {
  readonly checkpoint?: CompactLiveCheckpoint;
  readonly previousCheckpoint?: CompactLiveCheckpoint;
  readonly injectionState: CompactInjectionState;
  readonly maxInjectedContextChars?: number;
  readonly markInjected?: (input: {
    readonly sessionScopeId: string;
    readonly checkpointId: string;
  }) => CompactInjectionState;
  readonly markConsumed: (input: {
    readonly sessionScopeId: string;
    readonly checkpointId: string;
  }) => CompactInjectionState;
  readonly markInvalid?: (input: {
    readonly sessionScopeId: string;
    readonly checkpointId?: string;
    readonly reason: string;
  }) => CompactInjectionState;
}

export function planCompactFutureTurnInjection(
  input: PlanCompactFutureTurnInjectionInput,
): CompactFutureTurnInjectionPlan {
  const baseEvidence = [
    "compact-future-turn-injection:planner",
    "compact-future-turn-injection:no-persistence",
    "compact-future-turn-injection:no-provider-call",
    "compact-future-turn-injection:no-edit-mutation",
    "compact-future-turn-injection:no-memory-write",
  ];
  if (!input.checkpoint) {
    return skip(input.injectionState, "no-checkpoint", "No compact checkpoint exists.", baseEvidence);
  }
  if (input.checkpoint.status !== "created") {
    const updated =
      input.markInvalid?.({
        sessionScopeId: input.injectionState.sessionScopeId,
        checkpointId: input.checkpoint.checkpointId,
        reason: `Checkpoint status is ${input.checkpoint.status}.`,
      }) ?? input.injectionState;
    return skip(updated, "checkpoint-not-created", "Compact checkpoint is not active.", baseEvidence);
  }
  if (
    input.injectionState.injectionStatus !== "pending" ||
    input.injectionState.checkpointId !== input.checkpoint.checkpointId
  ) {
    return skip(
      input.injectionState,
      "checkpoint-not-pending",
      "Compact checkpoint is not pending injection.",
      baseEvidence,
    );
  }

  const candidate = adaptCompactCheckpointForFutureTurn(input.checkpoint);
  const merge = planCompactInjectionMerge({
    checkpoint: input.checkpoint,
    previousCheckpoint: input.previousCheckpoint,
    injectionState: input.injectionState,
  });
  if (merge.mergeStatus === "fail") {
    const updated =
      input.markInvalid?.({
        sessionScopeId: input.injectionState.sessionScopeId,
        checkpointId: input.checkpoint.checkpointId,
        reason: merge.blockers.map((blocker) => blocker.message).join("; "),
      }) ?? input.injectionState;
    return skip(
      updated,
      "compact-merge-quality-failed",
      "Compact checkpoint merge policy rejected injection.",
      [...baseEvidence, ...merge.evidence],
      [...merge.warnings, ...merge.blockers],
    );
  }
  const mergedCandidate = mergeWarningsIntoCandidate(candidate, merge);
  const formattedContext = formatCompactInjectedContext(mergedCandidate, {
    mergedCompactSurvivorFacts: merge.mergedCompactSurvivorFacts,
  });
  const quality = evaluateCompactContinuityQuality({
    candidate: mergedCandidate,
    injectedContext: formattedContext,
    maxInjectedContextChars: input.maxInjectedContextChars,
    expectMutationEvidence: hasMutationEvidence(input.checkpoint),
    expectRecoverySummary: hasRecoverySummary(input.checkpoint),
  });
  if (quality.qualityStatus === "fail") {
    const updated =
      input.markInvalid?.({
        sessionScopeId: input.injectionState.sessionScopeId,
        checkpointId: input.checkpoint.checkpointId,
        reason: quality.blockers.map((blocker) => blocker.message).join("; "),
      }) ?? input.injectionState;
    return skip(
      updated,
      "compact-continuity-quality-failed",
      "Compact continuity quality checks rejected injection.",
      [...baseEvidence, ...merge.evidence, ...quality.evidence],
      [...mergedCandidate.warnings, ...quality.warnings, ...quality.blockers],
    );
  }
  const budget = applyCompactInjectedContextBudget(formattedContext, {
    maxChars: input.maxInjectedContextChars,
  });
  if (containsUnsafeContent(budget.context)) {
    const updated =
      input.markInvalid?.({
        sessionScopeId: input.injectionState.sessionScopeId,
        checkpointId: input.checkpoint.checkpointId,
        reason: "Budgeted injected context contained unsafe raw-looking content.",
      }) ?? input.injectionState;
    return skip(
      updated,
      "unsafe-budgeted-context",
      "Budgeted injected context was rejected.",
      [...baseEvidence, ...merge.evidence, ...quality.evidence, ...budget.evidence],
      [...mergedCandidate.warnings, ...quality.warnings, ...budget.warnings],
    );
  }
  input.markInjected?.({
    sessionScopeId: input.injectionState.sessionScopeId,
    checkpointId: input.checkpoint.checkpointId,
  });
  const updatedInjectionState = input.markConsumed({
    sessionScopeId: input.injectionState.sessionScopeId,
    checkpointId: input.checkpoint.checkpointId,
  });

  return {
    shouldInject: true,
    injectedContext: budget.context,
    updatedInjectionState,
    warnings: [
      ...mergedCandidate.warnings,
      ...quality.warnings,
      ...budget.warnings,
    ],
    evidence: [
      ...baseEvidence,
      ...mergedCandidate.evidence,
      ...merge.evidence,
      ...quality.evidence,
      ...budget.evidence,
      "compact-future-turn-injection:injected-once",
      "compact-future-turn-injection:consumed",
    ],
  };
}

function skip(
  state: CompactInjectionState,
  id: string,
  message: string,
  evidence: readonly string[],
  extraWarnings: readonly { readonly id: string; readonly message: string }[] = [],
): CompactFutureTurnInjectionPlan {
  return {
    shouldInject: false,
    updatedInjectionState: state,
    warnings: [{ id, message }, ...extraWarnings],
    evidence: [...evidence, `compact-future-turn-injection:skip:${id}`],
  };
}

function containsUnsafeContent(serialized: string): boolean {
  return /\bRAW_[A-Z0-9_]+\b/.test(serialized) || /\bsk-[A-Za-z0-9_-]{8,}\b/.test(serialized);
}

function hasMutationEvidence(checkpoint: CompactLiveCheckpoint): boolean {
  return (
    checkpoint.packet.mutationEvidence.plannedFiles.length > 0 ||
    checkpoint.packet.mutationEvidence.changedFiles.length > 0 ||
    checkpoint.packet.mutationEvidence.failedFiles.length > 0
  );
}

function hasRecoverySummary(checkpoint: CompactLiveCheckpoint): boolean {
  return (
    checkpoint.packet.recovery.restoreAvailable ||
    checkpoint.packet.recovery.recoveryAuthorityReferences.length > 0 ||
    checkpoint.packet.recovery.restorableFiles.length > 0 ||
    checkpoint.packet.recovery.blockedFiles.length > 0
  );
}
