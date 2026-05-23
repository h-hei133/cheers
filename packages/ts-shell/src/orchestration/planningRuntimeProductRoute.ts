import type { WorkflowTaskPlan } from "./workflowTaskPlanner.js";

export function shouldRunPlanningRuntimeForBlockedVagueTask(
  plan: WorkflowTaskPlan,
): plan is WorkflowTaskPlan & {
  readonly taskKind: "edit-file";
  readonly blockedReason: string;
} {
  return plan.taskKind === "edit-file" &&
    plan.targetMissing === true &&
    !plan.targetPath &&
    Boolean(plan.blockedReason);
}
