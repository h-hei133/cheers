import {
  projectReadMissingTargetStop,
  projectReadOutOfWorkspaceTargetStop,
} from "../orchestration/readInspectModule.js";
import type { WorkflowTaskPlan } from "../orchestration/workflowTaskPlanner.js";

export function buildGroundedReadMissingTargetPlan(input: {
  readonly reason: string;
  readonly stopReason: string;
  readonly doNext: string;
  readonly usedRestoredState?: boolean;
}): WorkflowTaskPlan {
  const targetStop = projectReadMissingTargetStop({
    reason: input.stopReason,
    doNext: input.doNext,
  });
  return {
    taskKind: "read-file",
    reason: input.reason,
    inspectFirst: true,
    verifyAfterEdit: false,
    blockedReason: targetStop.reason,
    targetMissing: true,
    usedRestoredState: input.usedRestoredState,
  };
}

export function buildGroundedReadOutOfWorkspacePlan(input: {
  readonly targetPath: string;
  readonly usedRestoredState?: boolean;
}): WorkflowTaskPlan {
  const targetStop = projectReadOutOfWorkspaceTargetStop({
    targetPath: input.targetPath,
    reason:
      "Grounded read/summarize/explain target is outside current workspace. Attach/switch project or provide an in-workspace path.",
    doNext: "Attach/switch project or provide an in-workspace path.",
  });
  return {
    taskKind: "read-file",
    reason: "grounded read/summarize/explain target resolved outside workspace",
    targetPath: input.targetPath,
    inspectFirst: true,
    verifyAfterEdit: false,
    blockedReason: targetStop.reason,
    targetMissing: true,
    usedRestoredState: input.usedRestoredState,
  };
}
