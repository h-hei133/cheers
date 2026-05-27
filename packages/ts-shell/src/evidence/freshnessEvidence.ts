import { hasPathLikeReference } from "../planning/promptTargetProjection.js";
import { extractReplaceDirective } from "../edit/mutationInstructionPlanner.js";
import type { ContinuityStateLike } from "../orchestration/runtimeHandoffProjection.js";
import type { WorkflowTaskPlan } from "../orchestration/workflowTaskPlanner.js";

export interface FreshnessObservability {
  readonly notes: readonly string[];
  readonly evidence: readonly string[];
}

export function buildFreshnessObservability(input: {
  prompt: string;
  continuity: ContinuityStateLike;
  plan: WorkflowTaskPlan;
}): FreshnessObservability {
  const hasPathOverride = hasPathLikeReference(input.prompt);
  const hasTransformOverride = Boolean(extractReplaceDirective(input.prompt));
  const retained: string[] = [];
  const pruned: string[] = [];
  const boundary: string[] = [];
  const historyEvidence = input.continuity.lastContinuationEvidence ?? [];
  const hasContinuationHistory =
    (input.continuity.freshnessHistoryCount ?? 0) > 0 ||
    historyEvidence.length > 0 ||
    (input.continuity.recentFailedFiles?.length ?? 0) > 0 ||
    (input.continuity.recentTargetFiles?.length ?? 0) > 0;

  if ((input.plan.previousRemainingTargets?.length ?? 0) > 0) {
    retained.push(
      `freshness-retained:previous-remaining-targets=${input.plan.previousRemainingTargets!.length}`,
    );
  }
  if ((input.plan.previousFailedEntries?.length ?? 0) > 0) {
    retained.push(
      `freshness-retained:previous-failed-entries=${input.plan.previousFailedEntries!.length}`,
    );
  }
  if ((input.plan.degradedReopenCandidates?.length ?? 0) > 0) {
    retained.push(
      `freshness-retained:reopen-candidates=${input.plan.degradedReopenCandidates!.length}`,
    );
  }
  if (input.plan.usedRestoredState) {
    boundary.push("freshness-boundary:restored-session-state-consumed");
  }
  if (input.plan.degradedReopen) {
    boundary.push("freshness-boundary:degraded-reopen");
  }

  if (input.continuity.lastTerminalClassification) {
    boundary.push(
      `freshness-boundary:last-terminal=${input.continuity.lastTerminalClassification}:${input.continuity.lastTerminalReason ?? "unknown"}`,
    );
  }

  if (
    hasContinuationHistory &&
    input.plan.taskKind === "chat" &&
    !input.plan.usedRestoredState
  ) {
    const prunedCount = Math.max(
      historyEvidence.length,
      input.continuity.freshnessHistoryCount ?? 0,
    );
    boundary.push("freshness-reset:new-task");
    pruned.push(
      `freshness-pruned:continuation-history-not-consumed=${Math.min(prunedCount, 16)}`,
    );
  }

  if (
    hasContinuationHistory &&
    !input.plan.usedRestoredState &&
    (hasPathOverride || hasTransformOverride)
  ) {
    boundary.push("freshness-reset:explicit-override");
    if (hasPathOverride) {
      pruned.push("freshness-pruned:override-path-superseded-history");
    }
    if (hasTransformOverride) {
      pruned.push("freshness-pruned:override-transform-superseded-history");
    }
  }

  if (
    historyEvidence.some((entry) =>
      entry.toLowerCase().startsWith("repair-outcome:blocked-disambiguation"),
    )
  ) {
    boundary.push("freshness-boundary:blocked-disambiguation-history");
  }
  if (
    historyEvidence.some((entry) =>
      entry.toLowerCase().startsWith("repair-outcome:degraded-terminal"),
    )
  ) {
    boundary.push("freshness-boundary:degraded-terminal-history");
  }
  if (
    historyEvidence.some((entry) =>
      entry.toLowerCase().includes("replan-skipped:"),
    )
  ) {
    boundary.push("freshness-boundary:replan-skipped-history");
  }

  const notes = [...boundary, ...retained, ...pruned];
  const evidence = [...notes];
  return {
    notes,
    evidence,
  };
}
