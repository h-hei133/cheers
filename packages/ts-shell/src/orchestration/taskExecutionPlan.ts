import crypto from "node:crypto";

import type { AgentPlan } from "./agentPlan.js";
import type { AnalysisBrief } from "./analysisBrief.js";
import type { PlanQuality } from "../planning/quality/model.js";
import type { TaskLifecycle } from "./taskLifecycle.js";
import type { TaskReadPlan } from "./taskReadPlan.js";

export type TaskExecutionReadiness = "ready" | "review-only" | "needs-evidence" | "blocked";

export interface TaskExecutionPlan {
  readonly executionPlanId: string;
  readonly taskId: string;
  readonly lifecycleId?: string;
  readonly analysisBriefId: string;
  readonly readPlanId: string;
  readonly agentPlanId?: string;
  readonly proposedStrategy: string;
  readonly proposalReadiness: TaskExecutionReadiness;
  readonly editReadiness: TaskExecutionReadiness;
  readonly verificationReadiness: TaskExecutionReadiness;
  readonly repairReadiness: TaskExecutionReadiness;
  readonly requiredConfirmation: readonly string[];
  readonly stopConditions: readonly string[];
  readonly fallbackPath: string;
  readonly recoveryExpectation: string;
  readonly qualityGateId?: string;
  readonly scorecardId?: string;
  readonly redactionStatus: "redacted-and-budgeted";
  readonly mutationAuthority: "not-granted";
  readonly replaySafeSummary: string;
  readonly evidence: readonly string[];
}

export function buildTaskExecutionPlan(input: {
  readonly brief: AnalysisBrief;
  readonly readPlan: TaskReadPlan;
  readonly lifecycle?: TaskLifecycle;
  readonly agentPlan?: AgentPlan;
  readonly planQuality?: PlanQuality;
  readonly scorecardId?: string;
}): TaskExecutionPlan {
  const missingFacts = unique([
    ...input.brief.missingFacts,
    ...(input.agentPlan?.missingFacts ?? []),
    ...(input.planQuality?.missingFacts ?? []),
  ]);
  const proposalReadiness = classifyProposalReadiness(input.brief, input.planQuality);
  const verificationReadiness =
    input.brief.verificationExpectation.includes("attach an explicit")
      ? "needs-evidence"
      : input.planQuality?.level === "blocked" || input.planQuality?.level === "unsupported"
        ? "blocked"
        : "ready";
  const editReadiness =
    proposalReadiness === "ready" ? "review-only" : proposalReadiness;
  const repairReadiness =
    verificationReadiness === "ready" ? "review-only" : verificationReadiness;
  const stopConditions = unique([
    ...missingFacts,
    ...(input.lifecycle?.stopConditions ?? []),
    ...(input.planQuality?.level && input.planQuality.level !== "ready"
      ? [`plan quality ${input.planQuality.level}`]
      : []),
  ]);
  const executionPlanId = buildExecutionPlanId({
    taskId: input.brief.taskId,
    briefId: input.brief.briefId,
    readPlanId: input.readPlan.readPlanId,
    lifecycleId: input.lifecycle?.lifecycleId,
    agentPlanId: input.agentPlan?.planId,
    planQualityId: input.planQuality?.qualityId,
    proposalReadiness,
    verificationReadiness,
    stopConditions,
  });
  const requiredConfirmation = [
    "proposal review before edit handoff",
    "explicit exact mapping confirmation before apply",
    ...(verificationReadiness === "ready" ? ["existing runtime permission checks before command dispatch"] : []),
  ];
  const replaySafeSummary = [
    `task-execution-plan ${executionPlanId}`,
    `task=${input.brief.taskId}`,
    input.lifecycle ? `lifecycle=${input.lifecycle.lifecycleId}` : undefined,
    `brief=${input.brief.briefId}`,
    `readPlan=${input.readPlan.readPlanId}`,
    input.agentPlan ? `agentPlan=${input.agentPlan.planId}` : undefined,
    input.planQuality ? `quality=${input.planQuality.qualityId}` : undefined,
    `proposal=${proposalReadiness}`,
    `edit=${editReadiness}`,
    `verification=${verificationReadiness}`,
    `repair=${repairReadiness}`,
    `stops=${stopConditions.length}`,
    "mutationAuthority=not-granted",
  ].filter(Boolean).join("; ");

  return {
    executionPlanId,
    taskId: input.brief.taskId,
    ...(input.lifecycle ? { lifecycleId: input.lifecycle.lifecycleId } : {}),
    analysisBriefId: input.brief.briefId,
    readPlanId: input.readPlan.readPlanId,
    ...(input.agentPlan ? { agentPlanId: input.agentPlan.planId } : {}),
    proposedStrategy: input.brief.recommendedStrategy,
    proposalReadiness,
    editReadiness,
    verificationReadiness,
    repairReadiness,
    requiredConfirmation,
    stopConditions,
    fallbackPath:
      stopConditions.length > 0
        ? "Return to read/analyze stages and rebuild plan evidence."
        : "Use existing proposal, review, edit, verification, and repair lanes without lifecycle-granted authority.",
    recoveryExpectation:
      "Failed verification can create review-gated repair context; no automatic repair or apply is performed.",
    ...(input.planQuality ? { qualityGateId: input.planQuality.qualityId } : {}),
    ...(input.scorecardId ? { scorecardId: input.scorecardId } : {}),
    redactionStatus: "redacted-and-budgeted",
    mutationAuthority: "not-granted",
    replaySafeSummary,
    evidence: [
      `task-execution-plan:id:${executionPlanId}`,
      `task-execution-plan:brief:${input.brief.briefId}`,
      `task-execution-plan:read-plan:${input.readPlan.readPlanId}`,
      ...(input.lifecycle ? [`task-execution-plan:lifecycle:${input.lifecycle.lifecycleId}`] : []),
      ...(input.agentPlan ? [`task-execution-plan:agent-plan:${input.agentPlan.planId}`] : []),
      ...(input.planQuality ? [`task-execution-plan:plan-quality:${input.planQuality.qualityId}`] : []),
      `task-execution-plan:proposal-readiness:${proposalReadiness}`,
      `task-execution-plan:verification-readiness:${verificationReadiness}`,
      "task-execution-plan:mutation-authority:not-granted",
      "task-execution-plan:provider-call:not-run",
      "task-execution-plan:command-dispatch:not-run",
      "task-execution-plan:redacted-and-budgeted",
      "task-execution-plan:raw-content-excluded",
    ],
  };
}

function classifyProposalReadiness(
  brief: AnalysisBrief,
  quality: PlanQuality | undefined,
): TaskExecutionReadiness {
  if (brief.missingFacts.length > 0 || brief.confidence === "low") {
    return "needs-evidence";
  }
  if (quality?.level === "blocked" || quality?.level === "unsupported") {
    return "blocked";
  }
  if (quality?.level && quality.level !== "ready") {
    return "needs-evidence";
  }
  return "ready";
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.filter((value) => Boolean(value.trim()))));
}

function buildExecutionPlanId(input: object): string {
  return `task_execution_plan_${crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 12)}`;
}
