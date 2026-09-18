import crypto from "node:crypto";

import type { AnalysisBriefCalibration } from "./analysisBriefCalibration.js";
import type { TaskContextSufficiency } from "./taskContextSufficiency.js";

export type AnalysisQualityGateAction =
  | "plan"
  | "provider-proposal"
  | "verification-planning"
  | "review-only-proposal"
  | "repair-proposal"
  | "edit-apply-readiness";

export type AnalysisQualityGateDecision =
  | "allow-plan"
  | "allow-provider-proposal"
  | "allow-verification-planning"
  | "allow-review-only-proposal"
  | "allow-repair-proposal"
  | "stop-missing-analysis"
  | "stop-under-evidenced-analysis"
  | "stop-missing-required-context"
  | "stop-stale-context"
  | "stop-budget-limited"
  | "stop-unsupported"
  | "stop-mutation-not-authorized";

export interface AnalysisQualityGateResult {
  readonly gateId: string;
  readonly action: AnalysisQualityGateAction;
  readonly decision: AnalysisQualityGateDecision;
  readonly allowed: boolean;
  readonly analysisCalibrationId?: string;
  readonly contextSufficiencyId?: string;
  readonly reason: string;
  readonly nextAction: string;
  readonly mutationAuthority: "not-granted";
  readonly providerCall: "not-run";
  readonly commandDispatch: "not-run";
  readonly evidence: readonly string[];
}

export function evaluateAnalysisQualityGate(input: {
  readonly action: AnalysisQualityGateAction;
  readonly calibration?: AnalysisBriefCalibration;
  readonly contextSufficiency?: TaskContextSufficiency;
}): AnalysisQualityGateResult {
  const decision = classifyDecision(input);
  const allowed = decision.startsWith("allow-");
  const gateId = `analysis_quality_gate_${hash({
    action: input.action,
    calibrationId: input.calibration?.calibrationId,
    sufficiencyId: input.contextSufficiency?.sufficiencyId,
    decision,
  })}`;
  return {
    gateId,
    action: input.action,
    decision,
    allowed,
    ...(input.calibration ? { analysisCalibrationId: input.calibration.calibrationId } : {}),
    ...(input.contextSufficiency ? { contextSufficiencyId: input.contextSufficiency.sufficiencyId } : {}),
    reason: buildReason(decision),
    nextAction: buildNextAction(input, decision),
    mutationAuthority: "not-granted",
    providerCall: "not-run",
    commandDispatch: "not-run",
    evidence: [
      `analysis-quality-gate:id:${gateId}`,
      `analysis-quality-gate:action:${input.action}`,
      `analysis-quality-gate:decision:${decision}`,
      `analysis-quality-gate:allowed:${allowed ? "yes" : "no"}`,
      ...(input.calibration ? [`analysis-quality-gate:calibration:${input.calibration.calibrationId}`] : []),
      ...(input.contextSufficiency ? [`analysis-quality-gate:sufficiency:${input.contextSufficiency.sufficiencyId}`] : []),
      "analysis-quality-gate:mutation-authority:not-granted",
      "analysis-quality-gate:provider-call:not-run",
      "analysis-quality-gate:command-dispatch:not-run",
      "analysis-quality-gate:raw-content-excluded",
    ],
  };
}

function classifyDecision(input: {
  readonly action: AnalysisQualityGateAction;
  readonly calibration?: AnalysisBriefCalibration;
  readonly contextSufficiency?: TaskContextSufficiency;
}): AnalysisQualityGateDecision {
  if (input.action === "edit-apply-readiness") {
    return "stop-mutation-not-authorized";
  }
  if (!input.calibration) {
    return "stop-missing-analysis";
  }
  if (input.contextSufficiency?.state === "unsupported" || input.calibration.readiness === "unsupported") {
    return "stop-unsupported";
  }
  if (input.contextSufficiency?.state === "stale-context" || input.calibration.readiness === "stale-context") {
    return "stop-stale-context";
  }
  if (input.contextSufficiency?.state === "budget-limited") {
    return "stop-budget-limited";
  }
  if (input.contextSufficiency?.state === "needs-required-context") {
    return "stop-missing-required-context";
  }
  if (input.calibration.readiness === "under-evidenced" || input.calibration.confidence === "low") {
    return "stop-under-evidenced-analysis";
  }
  if (input.action === "verification-planning" && input.contextSufficiency?.verificationPlanningReadiness !== "ready") {
    return "stop-missing-required-context";
  }
  if (input.action === "provider-proposal") {
    return "allow-provider-proposal";
  }
  if (input.action === "verification-planning") {
    return "allow-verification-planning";
  }
  if (input.action === "review-only-proposal") {
    return "allow-review-only-proposal";
  }
  if (input.action === "repair-proposal") {
    return "allow-repair-proposal";
  }
  return "allow-plan";
}

function buildReason(decision: AnalysisQualityGateDecision): string {
  switch (decision) {
    case "allow-plan":
      return "Analysis is calibrated enough for Agent Plan readiness.";
    case "allow-provider-proposal":
      return "Analysis quality allows existing provider proposal preflight without granting mutation authority.";
    case "allow-verification-planning":
      return "Analysis quality and context sufficiency allow verification planning.";
    case "allow-review-only-proposal":
      return "Analysis quality allows review-only proposal planning.";
    case "allow-repair-proposal":
      return "Analysis quality allows repair proposal preflight.";
    case "stop-missing-analysis":
      return "Analysis quality gate requires a calibrated analysis brief.";
    case "stop-under-evidenced-analysis":
      return "Analysis quality gate stopped because analysis is low-confidence or under-evidenced.";
    case "stop-missing-required-context":
      return "Analysis quality gate stopped because required task context is missing.";
    case "stop-stale-context":
      return "Analysis quality gate stopped because task context is stale.";
    case "stop-budget-limited":
      return "Analysis quality gate stopped because context acquisition is budget-limited.";
    case "stop-unsupported":
      return "Analysis quality gate stopped because the task/context route is unsupported.";
    case "stop-mutation-not-authorized":
      return "Analysis never grants edit apply or mutation authority.";
  }
}

function buildNextAction(input: {
  readonly calibration?: AnalysisBriefCalibration;
  readonly contextSufficiency?: TaskContextSufficiency;
}, decision: AnalysisQualityGateDecision): string {
  if (decision.startsWith("allow-")) {
    return "Continue through the existing gated downstream preflight.";
  }
  return input.contextSufficiency?.suggestedReads[0] ??
    input.calibration?.missingFacts[0] ??
    "Acquire missing task context and rebuild the analysis calibration.";
}

function hash(input: object): string {
  return crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 12);
}
