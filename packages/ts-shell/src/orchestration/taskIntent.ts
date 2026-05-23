import crypto from "node:crypto";

import type { AgentPlanRequestedActionKind } from "./agentPlan.js";
import { redactProviderEditText } from "./providerEditContext.js";
import type { CodingTaskKind } from "./types.js";
import type { WorkflowTaskPlan } from "./workflowTaskPlanner.js";

export type TaskIntentKind =
  | "read-explain"
  | "analyze"
  | "plan-only"
  | "edit-proposal"
  | "edit-apply-request"
  | "verification"
  | "repair"
  | "broad-unsupported"
  | "ambiguous";

export type TaskIntentStageRequirement =
  | "read"
  | "analyze"
  | "plan"
  | "proposal"
  | "review"
  | "edit"
  | "verify"
  | "repair";

export interface TaskIntent {
  readonly taskId: string;
  readonly kind: TaskIntentKind;
  readonly sourceTaskKind: CodingTaskKind;
  readonly requestedActionKind?: AgentPlanRequestedActionKind;
  readonly userRequestSummary: string;
  readonly explicitTargets: readonly string[];
  readonly requestedOutcome: string;
  readonly requiredStages: readonly TaskIntentStageRequirement[];
  readonly missingTargetFacts: readonly string[];
  readonly redactionStatus: "redacted-and-budgeted";
  readonly mutationAuthority: "not-granted";
  readonly evidence: readonly string[];
  readonly replaySafeSummary: string;
}

export function buildTaskIntent(input: {
  readonly userRequest: string;
  readonly workflowPlan: WorkflowTaskPlan;
  readonly requestedActionKind?: AgentPlanRequestedActionKind;
  readonly additionalTargets?: readonly string[];
}): TaskIntent {
  const kind = classifyTaskIntent(input.workflowPlan, input.requestedActionKind);
  const explicitTargets = Array.from(
    new Set(
      [
        input.workflowPlan.targetPath,
        ...(input.workflowPlan.additionalTargetPaths ?? []),
        ...(input.additionalTargets ?? []),
      ]
        .filter((target): target is string => Boolean(target?.trim()))
        .map((target) => redactProviderEditText(target)),
    ),
  );
  const missingTargetFacts =
    explicitTargets.length === 0 && requiresTarget(kind)
      ? ["explicit in-workspace target not resolved"]
      : [];
  const requestedOutcome = classifyRequestedOutcome(input.workflowPlan, kind);
  const requiredStages = buildRequiredStages(kind, input.workflowPlan);
  const userRequestSummary = redactProviderEditText(input.userRequest)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
  const taskId = buildTaskId({
    kind,
    sourceTaskKind: input.workflowPlan.taskKind,
    requestedActionKind: input.requestedActionKind,
    userRequestSummary,
    explicitTargets,
    requestedOutcome,
    missingTargetFacts,
  });
  const replaySafeSummary = [
    `task-intent ${taskId}`,
    `kind=${kind}`,
    `sourceTask=${input.workflowPlan.taskKind}`,
    input.requestedActionKind ? `action=${input.requestedActionKind}` : undefined,
    `targets=${explicitTargets.length}`,
    `requiredStages=${requiredStages.join(",")}`,
    `missingTargetFacts=${missingTargetFacts.length}`,
    "mutationAuthority=not-granted",
    "redaction=redacted-and-budgeted",
  ].filter(Boolean).join("; ");

  return {
    taskId,
    kind,
    sourceTaskKind: input.workflowPlan.taskKind,
    ...(input.requestedActionKind ? { requestedActionKind: input.requestedActionKind } : {}),
    userRequestSummary,
    explicitTargets,
    requestedOutcome,
    requiredStages,
    missingTargetFacts,
    redactionStatus: "redacted-and-budgeted",
    mutationAuthority: "not-granted",
    evidence: [
      `task-intent:id:${taskId}`,
      `task-intent:kind:${kind}`,
      `task-intent:source-task:${input.workflowPlan.taskKind}`,
      `task-intent:targets:${explicitTargets.length}`,
      `task-intent:required-stages:${requiredStages.join(",")}`,
      "task-intent:mutation-authority:not-granted",
      "task-intent:redacted-and-budgeted",
      "task-intent:raw-content-excluded",
    ],
    replaySafeSummary,
  };
}

function classifyTaskIntent(
  plan: WorkflowTaskPlan,
  requestedActionKind: AgentPlanRequestedActionKind | undefined,
): TaskIntentKind {
  if (plan.repairContextUsed || plan.continuationRepairReplan || plan.repairedFailureReason) {
    return "repair";
  }
  if (plan.taskKind === "read-file" || plan.taskKind === "repo-explain") {
    return plan.groundedDeliverableMode === "explain" ? "read-explain" : "analyze";
  }
  if (plan.contextPlanningRequested || requestedActionKind === "context-planning") {
    return "plan-only";
  }
  if (
    plan.taskKind === "edit-file" &&
    plan.targetPath &&
    plan.replaceFrom &&
    plan.replaceTo
  ) {
    return "edit-apply-request";
  }
  if (plan.taskKind === "edit-file" || plan.taskKind === "write-file") {
    return "edit-proposal";
  }
  if (plan.verifyAfterEdit || plan.verifyCommand || requestedActionKind === "verify") {
    return "verification";
  }
  if (plan.blockedReason || plan.targetMissing) {
    return "ambiguous";
  }
  return "broad-unsupported";
}

function buildRequiredStages(
  kind: TaskIntentKind,
  plan: WorkflowTaskPlan,
): readonly TaskIntentStageRequirement[] {
  const base: TaskIntentStageRequirement[] = ["read", "analyze", "plan"];
  if (kind === "read-explain" || kind === "analyze" || kind === "plan-only") {
    return base;
  }
  if (kind === "edit-proposal") {
    return [...base, "proposal", "review"];
  }
  if (kind === "edit-apply-request") {
    return [...base, "proposal", "review", "edit", ...(plan.verifyAfterEdit ? ["verify" as const] : [])];
  }
  if (kind === "verification") {
    return [...base, "verify"];
  }
  if (kind === "repair") {
    return [...base, "verify", "repair", "review"];
  }
  return base;
}

function classifyRequestedOutcome(plan: WorkflowTaskPlan, kind: TaskIntentKind): string {
  if (plan.blockedReason) {
    return redactProviderEditText(plan.blockedReason);
  }
  if (kind === "edit-apply-request") {
    return "review-confirmed edit handoff through existing apply lane";
  }
  if (kind === "edit-proposal") {
    return "review-only edit proposal";
  }
  if (kind === "verification") {
    return "verification plan through existing runtime dispatcher";
  }
  if (kind === "repair") {
    return "review-gated repair proposal from failed verification evidence";
  }
  return plan.reason ? redactProviderEditText(plan.reason).slice(0, 180) : kind;
}

function requiresTarget(kind: TaskIntentKind): boolean {
  return kind !== "broad-unsupported" && kind !== "ambiguous";
}

function buildTaskId(input: object): string {
  return `task_${crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 12)}`;
}
