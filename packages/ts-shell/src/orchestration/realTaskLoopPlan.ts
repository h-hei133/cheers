import { hashContent } from "./patchRecovery/recoveryAuthorityStore.js";

export type RealTaskLoopPlanState =
  | "ready-for-provider-proposal"
  | "provider-skipped"
  | "proposal-created"
  | "anchored-exact-ready"
  | "review-required"
  | "confirmation-required"
  | "confirmed-for-apply"
  | "apply-ready"
  | "apply-stopped"
  | "apply-succeeded"
  | "verification-succeeded"
  | "verification-failed"
  | "repair-eligible"
  | "stopped";

export interface RealTaskLoopPlan {
  readonly taskLoopId: string;
  readonly fixtureId: string;
  readonly lifecycleId?: string;
  readonly analysisBriefId?: string;
  readonly planQualityId?: string;
  readonly providerKind: "fake-provider" | "openai-compatible" | "none";
  readonly dryRunId?: string;
  readonly anchoredProposalId?: string;
  readonly confirmationState:
    | "not-requested"
    | "required"
    | "trusted-confirmed"
    | "confirmed"
    | "invalid";
  readonly applyPlanId?: string;
  readonly verificationPlanId: string;
  readonly repairEligibility: "not-needed" | "eligible" | "not-eligible";
  readonly mutationAuthority: "not-granted";
  readonly redactionStatus: "redacted-and-budgeted" | "raw-content-excluded";
  readonly state: RealTaskLoopPlanState;
  readonly evidence: readonly string[];
}

export function buildRealTaskLoopPlan(input: {
  readonly fixtureId: string;
  readonly lifecycleId?: string;
  readonly analysisBriefId?: string;
  readonly planQualityId?: string;
  readonly providerKind: RealTaskLoopPlan["providerKind"];
  readonly dryRunId?: string;
  readonly anchoredProposalId?: string;
  readonly confirmationState?: RealTaskLoopPlan["confirmationState"];
  readonly applyPlanId?: string;
  readonly repairEligibility?: RealTaskLoopPlan["repairEligibility"];
  readonly state?: RealTaskLoopPlanState;
}): RealTaskLoopPlan {
  const taskLoopId = buildTaskLoopId(input);
  const state = input.state ?? inferState(input);
  const verificationPlanId = `real_task_loop_verification_${hashContent(JSON.stringify({
    taskLoopId,
    fixtureId: input.fixtureId,
    anchoredProposalId: input.anchoredProposalId,
  })).slice(0, 12)}`;
  return {
    taskLoopId,
    fixtureId: input.fixtureId,
    ...(input.lifecycleId ? { lifecycleId: input.lifecycleId } : {}),
    ...(input.analysisBriefId ? { analysisBriefId: input.analysisBriefId } : {}),
    ...(input.planQualityId ? { planQualityId: input.planQualityId } : {}),
    providerKind: input.providerKind,
    ...(input.dryRunId ? { dryRunId: input.dryRunId } : {}),
    ...(input.anchoredProposalId ? { anchoredProposalId: input.anchoredProposalId } : {}),
    confirmationState: input.confirmationState ?? "not-requested",
    ...(input.applyPlanId ? { applyPlanId: input.applyPlanId } : {}),
    verificationPlanId,
    repairEligibility: input.repairEligibility ?? "not-eligible",
    mutationAuthority: "not-granted",
    redactionStatus: "redacted-and-budgeted",
    state,
    evidence: [
      `real-task-loop-plan:id:${taskLoopId}`,
      `real-task-loop-plan:fixture:${input.fixtureId}`,
      `real-task-loop-plan:state:${state}`,
      `real-task-loop-plan:provider:${input.providerKind}`,
      ...(input.lifecycleId ? [`real-task-loop-plan:lifecycle:${input.lifecycleId}`] : []),
      ...(input.analysisBriefId ? [`real-task-loop-plan:analysis:${input.analysisBriefId}`] : []),
      ...(input.planQualityId ? [`real-task-loop-plan:plan-quality:${input.planQualityId}`] : []),
      ...(input.dryRunId ? [`real-task-loop-plan:dry-run:${input.dryRunId}`] : []),
      ...(input.anchoredProposalId ? [`real-task-loop-plan:anchored-proposal:${input.anchoredProposalId}`] : []),
      `real-task-loop-plan:confirmation:${input.confirmationState ?? "not-requested"}`,
      `real-task-loop-plan:verification-plan:${verificationPlanId}`,
      `real-task-loop-plan:repair:${input.repairEligibility ?? "not-eligible"}`,
      "real-task-loop-plan:mutation-authority:not-granted",
      "real-task-loop-plan:redacted-and-budgeted",
    ],
  };
}

function inferState(input: {
  readonly dryRunId?: string;
  readonly anchoredProposalId?: string;
  readonly confirmationState?: RealTaskLoopPlan["confirmationState"];
}): RealTaskLoopPlanState {
  if (!input.dryRunId) return "ready-for-provider-proposal";
  if (!input.anchoredProposalId) return "proposal-created";
  if (
    input.confirmationState === "trusted-confirmed" ||
    input.confirmationState === "confirmed"
  ) {
    return "confirmed-for-apply";
  }
  return "confirmation-required";
}

function buildTaskLoopId(input: object): string {
  return `real_task_loop_${hashContent(JSON.stringify(input)).slice(0, 12)}`;
}
