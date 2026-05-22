import type {
  AgentPlan,
  AgentPlanExecutionReadiness,
  AgentPlanRequestedActionKind,
} from "./agentPlan.js";
import { buildAgentPlan } from "./agentPlan.js";
import type { AgentPlanContextProjection } from "./agentPlanContext.js";
import type { WorkflowTaskPlan } from "./workflowTaskPlanner.js";

export interface AgentPlanProjectionInput {
  readonly workflowPlan: WorkflowTaskPlan;
  readonly context?: AgentPlanContextProjection;
}

export function projectWorkflowTaskPlanToAgentPlan(
  input: AgentPlanProjectionInput,
): AgentPlan {
  const requestedActionKind = classifyRequestedActionKind(input.workflowPlan);
  const contextReadiness = input.context?.executionReadiness;
  const executionReadiness = classifyExecutionReadiness({
    workflowPlan: input.workflowPlan,
    requestedActionKind,
    contextReadiness,
  });
  const missingFacts = [
    ...classifyWorkflowMissingFacts(input.workflowPlan),
    ...(input.context?.missingFacts ?? []),
  ];
  const suggestedReads = [
    ...(input.workflowPlan.contextPlanningRequested && input.workflowPlan.targetPath
      ? [input.workflowPlan.targetPath]
      : []),
    ...(input.context?.suggestedReads ?? []),
  ];
  const suggestedVerification = [
    ...(input.workflowPlan.verifyCommand
      ? [input.workflowPlan.verifyCommand]
      : []),
    ...(input.context?.suggestedVerification ?? []),
  ];
  const safeEvidenceMarkers = [
    `agent-plan:task:${input.workflowPlan.taskKind}`,
    `agent-plan:action:${requestedActionKind}`,
    `agent-plan:readiness:${executionReadiness}`,
    "agent-plan:mutation-authority:not-granted",
    ...(input.context?.replaySafeEvidence ?? []),
  ];

  return buildAgentPlan({
    ownerCapability: selectOwnerCapability(input.workflowPlan),
    taskKind: input.workflowPlan.taskKind,
    requestedActionKind,
    targetSummary: input.workflowPlan.targetPath ?? "(missing-target)",
    contextPacketIds: input.context?.contextPacketIds ?? [],
    contextGraphIds: input.context?.contextGraphIds ?? [],
    codeGraphTraceIds: input.context?.codeGraphTraceIds ?? [],
    impactQueryId: input.context?.impactQueryId,
    impactReadiness: input.context?.impactReadiness,
    likelyAffectedFiles: input.context?.likelyAffectedFiles ?? [],
    likelyAffectedTests: input.context?.likelyAffectedTests ?? [],
    graphReadiness: input.context?.graphReadiness,
    contextCoverageScore: input.context?.contextCoverageScore,
    testImpactSummary: input.context?.testImpactSummary,
    contextCompleteness: input.context?.contextCompleteness ?? "not-requested",
    confidence: input.context?.confidence ?? classifyPlanConfidence(input.workflowPlan),
    executionReadiness,
    missingFacts,
    suggestedReads: Array.from(new Set(suggestedReads)),
    suggestedVerification: Array.from(new Set(suggestedVerification)),
    safeEvidenceMarkers,
    mutationAuthority: "not-granted",
    redactionStatus: input.context?.redactionStatus ?? "not-applicable",
    doNext: buildDoNext({
      workflowPlan: input.workflowPlan,
      executionReadiness,
      missingFacts,
      suggestedReads,
      suggestedVerification,
    }),
  });
}

function classifyRequestedActionKind(
  plan: WorkflowTaskPlan,
): AgentPlanRequestedActionKind {
  if (plan.contextPlanningRequested) {
    return "context-planning";
  }
  if (plan.verifyAfterEdit || plan.verifyCommand) {
    return "verify";
  }
  switch (plan.taskKind) {
    case "read-file":
      return plan.groundedDeliverableMode === "explain" ? "explain" : "read";
    case "repo-explain":
      return "explain";
    case "edit-file":
      return "edit";
    case "write-file":
      return "write";
    case "run-command":
      return "run-command";
    case "browser":
      return "browser";
    default:
      return "unsupported";
  }
}

function classifyExecutionReadiness(input: {
  readonly workflowPlan: WorkflowTaskPlan;
  readonly requestedActionKind: AgentPlanRequestedActionKind;
  readonly contextReadiness?: AgentPlanExecutionReadiness;
}): AgentPlanExecutionReadiness {
  if (input.workflowPlan.contextPlanningRequested) {
    if (input.workflowPlan.contextPlanningReason === "missing-edit-context") {
      return "needs-more-context";
    }
    return input.contextReadiness ?? "needs-more-context";
  }
  if (input.workflowPlan.blockedReason) {
    return input.workflowPlan.targetMissing ? "stopped" : "unsupported";
  }
  if (
    input.workflowPlan.taskKind === "edit-file" &&
    input.workflowPlan.targetPath &&
    input.workflowPlan.replaceFrom &&
    input.workflowPlan.replaceTo
  ) {
    return "ready";
  }
  if (input.requestedActionKind === "read" || input.requestedActionKind === "explain") {
    return input.workflowPlan.targetPath ? "ready" : "stopped";
  }
  return input.workflowPlan.targetPath ? "ready" : "stopped";
}

function classifyWorkflowMissingFacts(plan: WorkflowTaskPlan): string[] {
  if (plan.contextPlanningReason === "missing-edit-context") {
    return ["concrete edit transform not provided"];
  }
  if (plan.targetMissing) {
    return ["unique in-workspace target not resolved"];
  }
  if (plan.blockedReason) {
    return [plan.blockedReason];
  }
  return [];
}

function classifyPlanConfidence(plan: WorkflowTaskPlan): "high" | "medium" | "low" {
  if (plan.blockedReason || plan.targetMissing) {
    return "low";
  }
  if (plan.replaceFrom && plan.replaceTo) {
    return "high";
  }
  return plan.targetPath ? "medium" : "low";
}

function selectOwnerCapability(plan: WorkflowTaskPlan): AgentPlan["ownerCapability"] {
  if (plan.contextPlanningRequested || plan.taskKind === "read-file") {
    return "workspace-file-context";
  }
  if (plan.taskKind === "edit-file" || plan.taskKind === "write-file") {
    return "edit-patch";
  }
  if (plan.taskKind === "browser") {
    return "browser";
  }
  if (plan.taskKind === "run-command") {
    return "tool-runtime";
  }
  return "agent-loop";
}

function buildDoNext(input: {
  readonly workflowPlan: WorkflowTaskPlan;
  readonly executionReadiness: AgentPlanExecutionReadiness;
  readonly missingFacts: readonly string[];
  readonly suggestedReads: readonly string[];
  readonly suggestedVerification: readonly string[];
}): string {
  if (input.executionReadiness === "ready") {
    if (input.suggestedVerification.length > 0) {
      return `Proceed through the existing ${input.workflowPlan.taskKind} route and run suggested verification.`;
    }
    return `Proceed through the existing ${input.workflowPlan.taskKind} route.`;
  }
  if (input.executionReadiness === "needs-more-context") {
    const reads = input.suggestedReads.length > 0
      ? input.suggestedReads.join(", ")
      : "the target and related tests or docs";
    return `Read ${reads}, then rerun with an exact transform or confirmed proposal.`;
  }
  if (input.workflowPlan.blockedReason) {
    return input.workflowPlan.blockedReason;
  }
  return input.missingFacts[0] ?? "Clarify the target and requested action.";
}
