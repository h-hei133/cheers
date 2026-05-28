import type { WorkflowTaskPlan } from "../orchestration/workflowTaskPlanner.js";

export function buildPathlessReadContinuationBlockedPlan(input: {
  readonly blockedReason: string;
  readonly rawContinuityTargetPath?: string;
  readonly continuationLineage?: readonly string[];
}): WorkflowTaskPlan {
  return {
    taskKind: "read-file",
    reason: "pathless read follow-up could not recover continuation target",
    inspectFirst: true,
    verifyAfterEdit: false,
    blockedReason: input.blockedReason,
    targetMissing: true,
    usedRestoredState: Boolean(input.rawContinuityTargetPath),
    continuationLineage: input.continuationLineage,
  };
}
