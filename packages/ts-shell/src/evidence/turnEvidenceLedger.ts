import type { WorkflowTaskPlan } from "../orchestration/workflowTaskPlanner.js";

export function appendSingleFileEditRepairObservability(
  evidence: string[],
  plan: WorkflowTaskPlan,
): void {
  if (plan.repairContextAbandoned) {
    evidence.push("repairContextUsed:false");
    evidence.push("repairContextAbandoned:true");
    if (plan.repairContextAbandonedReason) {
      evidence.push(
        `repairContextAbandonedReason:${plan.repairContextAbandonedReason}`,
      );
    }
    if (plan.repairContextAbandonedFailureReason) {
      evidence.push(
        `repairContextAbandonedFailureReason:${plan.repairContextAbandonedFailureReason}`,
      );
    }
    if (plan.repairContextAbandonedTargetCount !== undefined) {
      evidence.push(
        `repairContextAbandonedTargetCount:${plan.repairContextAbandonedTargetCount}`,
      );
    }
  }

  if (!plan.repairContextUsed) {
    return;
  }
  evidence.push("repairContextUsed:true");
  if (plan.repairedFailureReason) {
    evidence.push(`repairedFailureReason:${plan.repairedFailureReason}`);
  }
  if (plan.repairedTargetFile) {
    evidence.push(`repairedTargetFile:${plan.repairedTargetFile}`);
  }
  if (plan.repairPayloadKind) {
    evidence.push(`repairPayloadKind:${plan.repairPayloadKind}`);
  }
}
