import type { AgentPlan } from "./agentPlan.js";
import { projectRuntimeCodingOutcome, type RuntimeOutcomeProjection } from "./runtimeOutcomeProjection.js";

export type AgentPlanTerminalOutcome =
  | "plan-ready"
  | "needs-more-context"
  | "missing-target"
  | "ambiguous-target"
  | "unsupported-planning-request"
  | "context-packet-budget-limited"
  | "verification-needed";

export interface AgentPlanResultProjection {
  readonly outcome: AgentPlanTerminalOutcome;
  readonly plan: AgentPlan;
  readonly output: string;
  readonly evidence: readonly string[];
}

export function buildAgentPlanResult(plan: AgentPlan): AgentPlanResultProjection {
  const outcome = classifyAgentPlanOutcome(plan);
  const output = [
    `Agent plan: ${outcome}`,
    `Plan id: ${plan.planId}`,
    `Owner: ${plan.ownerCapability}`,
    `Action: ${plan.requestedActionKind}`,
    `Target: ${plan.targetSummary}`,
    `Readiness: ${plan.executionReadiness}`,
    `Confidence: ${plan.confidence}`,
    `Context packets: ${plan.contextPacketIds.join(", ") || "none"}`,
    `Missing facts: ${plan.missingFacts.join(", ") || "none"}`,
    `Suggested reads: ${plan.suggestedReads.join(", ") || "none"}`,
    `Suggested verification: ${plan.suggestedVerification.join(", ") || "none"}`,
    `Do next: ${plan.doNext}`,
    "Mutation authority: not-granted",
  ].join("\n");
  return {
    outcome,
    plan,
    output,
    evidence: [
      plan.replaySafeSummary,
      ...plan.safeEvidenceMarkers,
      `agent-plan-result:${outcome}`,
    ],
  };
}

export function projectAgentPlanRuntimeOutcome(input: {
  readonly plan: AgentPlan;
  readonly reason?: string;
  readonly baseOutput?: string;
  readonly taskVerdictWhenReady?: "satisfied" | "completed-with-caveats";
}): RuntimeOutcomeProjection {
  const result = buildAgentPlanResult(input.plan);
  const stopped = input.plan.executionReadiness !== "ready";
  const reason =
    input.reason ??
    (stopped
      ? input.plan.doNext
      : "Agent plan is ready for the existing execution route.");
  return projectRuntimeCodingOutcome({
    taskKind: input.plan.taskKind,
    changedFiles: [],
    failedFiles: stopped
      ? [{ path: input.plan.targetSummary, reason }]
      : [],
    patches: [],
    verifiedFiles: [],
    unverifiedFiles: [],
    verification: {
      status: input.plan.suggestedVerification.length > 0 ? "not-requested" : "not-requested",
      reason:
        input.plan.suggestedVerification.length > 0
          ? "planning suggested verification candidates"
          : "planning-only projection",
      selectionScope: "none",
      selectionSource: "not-requested",
      ...(stopped ? { nextAction: input.plan.doNext } : {}),
    },
    repairNotes: [reason],
    evidence: [...result.evidence],
    taskVerdict: stopped
      ? "insufficient-evidence"
      : (input.taskVerdictWhenReady ?? "satisfied"),
    taskReasons: [reason],
    userFacingOutput: input.baseOutput
      ? [input.baseOutput, "", result.output].join("\n")
      : result.output,
  });
}

function classifyAgentPlanOutcome(plan: AgentPlan): AgentPlanTerminalOutcome {
  if (
    plan.executionReadiness === "needs-more-context" &&
    plan.contextCompleteness === "partial"
  ) {
    return "context-packet-budget-limited";
  }
  if (plan.executionReadiness === "needs-more-context") {
    return "needs-more-context";
  }
  if (
    plan.executionReadiness === "stopped" &&
    plan.missingFacts.some((fact) => /ambiguous|multiple/i.test(fact))
  ) {
    return "ambiguous-target";
  }
  if (plan.executionReadiness === "stopped") {
    return "missing-target";
  }
  if (plan.executionReadiness === "unsupported") {
    return "unsupported-planning-request";
  }
  if (plan.suggestedVerification.length > 0) {
    return "verification-needed";
  }
  return "plan-ready";
}
