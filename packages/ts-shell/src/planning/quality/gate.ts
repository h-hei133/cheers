import type { PlanQuality } from "./model.js";

export type PlanQualityGateAction =
  | "provider-proposal"
  | "verification-command-plan"
  | "review-only-proposal"
  | "repair-loop";

export type PlanQualityGateDecision =
  | "allow-provider-proposal"
  | "allow-verification-command-plan"
  | "allow-review-only-proposal"
  | "allow-repair-loop"
  | "stop-needs-more-context"
  | "stop-budget-limited"
  | "stop-low-confidence"
  | "stop-missing-target"
  | "stop-missing-verification"
  | "stop-missing-runtime-receipt"
  | "stop-unsupported";

export interface PlanQualityGateResult {
  readonly decision: PlanQualityGateDecision;
  readonly allowed: boolean;
  readonly blockedDownstreamAction: PlanQualityGateAction;
  readonly reason: string;
  readonly nextAction: string;
  readonly mutationAuthority: "not-granted";
  readonly evidence: readonly string[];
}

export function evaluatePlanQualityGate(input: {
  readonly planQuality: PlanQuality;
  readonly action: PlanQualityGateAction;
  readonly hasRuntimeReceipt?: boolean;
}): PlanQualityGateResult {
  const decision = classifyDecision(input);
  const allowed = decision.startsWith("allow-");
  return {
    decision,
    allowed,
    blockedDownstreamAction: input.action,
    reason: buildReason(input.planQuality, decision),
    nextAction: allowed ? "Continue to the requested gated planning step." : input.planQuality.suggestedNextAction,
    mutationAuthority: "not-granted",
    evidence: [
      `plan-quality-gate:quality:${input.planQuality.qualityId}`,
      `plan-quality-gate:action:${input.action}`,
      `plan-quality-gate:decision:${decision}`,
      `plan-quality-gate:allowed:${allowed ? "yes" : "no"}`,
      "plan-quality-gate:mutation-authority:not-granted",
      "plan-quality-gate:provider-call:not-run",
      "plan-quality-gate:command:not-executed",
      "plan-quality-gate:raw-content-excluded",
    ],
  };
}

function classifyDecision(input: {
  readonly planQuality: PlanQuality;
  readonly action: PlanQualityGateAction;
  readonly hasRuntimeReceipt?: boolean;
}): PlanQualityGateDecision {
  if (!input.planQuality.dimensions.applyReadiness) {
    return "stop-missing-target";
  }
  if (input.planQuality.level === "unsupported") {
    return "stop-unsupported";
  }
  if (input.planQuality.level === "budget-limited") {
    return "stop-budget-limited";
  }
  if (
    input.action === "provider-proposal" &&
    input.planQuality.taskLifecycleId &&
    !input.planQuality.analysisBriefId
  ) {
    return "stop-low-confidence";
  }
  if (input.action === "verification-command-plan") {
    if (!input.planQuality.testImpactPlanId) {
      return "stop-missing-verification";
    }
    if (input.planQuality.graphReadiness?.testImpactReadiness !== "ready") {
      return "stop-missing-verification";
    }
  }
  if (input.action === "repair-loop" && input.hasRuntimeReceipt !== true) {
    return "stop-missing-runtime-receipt";
  }
  if (input.planQuality.level === "low-confidence") {
    return "stop-low-confidence";
  }
  if (input.planQuality.level === "needs-more-context") {
    return "stop-needs-more-context";
  }
  if (input.action === "provider-proposal") {
    return "allow-provider-proposal";
  }
  if (input.action === "verification-command-plan") {
    return "allow-verification-command-plan";
  }
  if (input.action === "repair-loop") {
    return "allow-repair-loop";
  }
  return "allow-review-only-proposal";
}

function buildReason(quality: PlanQuality, decision: PlanQualityGateDecision): string {
  switch (decision) {
    case "allow-provider-proposal":
    case "allow-verification-command-plan":
    case "allow-review-only-proposal":
    case "allow-repair-loop":
      return `Plan quality ${quality.qualityId} is ${quality.level} with score ${quality.score}.`;
    case "stop-missing-target":
      return "Plan quality gate requires an explicit target before downstream planning.";
    case "stop-missing-verification":
      return "Plan quality gate requires ready test-impact and verification facts before command planning.";
    case "stop-missing-runtime-receipt":
      return "Plan quality gate requires runtime receipt evidence before repair-loop planning.";
    case "stop-budget-limited":
      return "Plan quality gate stopped because context graph coverage is budget-limited.";
    case "stop-low-confidence":
      return "Plan quality gate stopped because plan quality is low-confidence.";
    case "stop-needs-more-context":
      return "Plan quality gate stopped because more context is required.";
    case "stop-unsupported":
      return "Plan quality gate stopped because the target or graph is unsupported.";
  }
}
