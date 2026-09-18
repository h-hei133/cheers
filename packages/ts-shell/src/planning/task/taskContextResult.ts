import type { AnalysisBriefCalibration } from "./analysisBriefCalibration.js";
import type { AnalysisQualityGateResult } from "./analysisQualityGate.js";
import type { TaskContextAcquisition } from "./taskContextAcquisition.js";
import type { TaskContextNeedSet } from "./taskContextNeed.js";
import type { TaskContextSufficiency } from "./taskContextSufficiency.js";

export type TaskContextTerminalOutcome =
  | "context-needs-identified"
  | "context-acquisition-planned"
  | "context-sufficient"
  | "context-insufficient"
  | "analysis-calibrated"
  | "analysis-under-evidenced"
  | "provider-blocked-by-analysis-quality"
  | "verification-blocked-by-context-sufficiency"
  | "suggested-reads-available";

export interface TaskContextResult {
  readonly outcome: TaskContextTerminalOutcome;
  readonly taskId: string;
  readonly contextNeedSetId: string;
  readonly acquisitionId?: string;
  readonly sufficiencyId?: string;
  readonly analysisCalibrationId?: string;
  readonly analysisQualityGateId?: string;
  readonly requiredContextCategories: readonly string[];
  readonly acquiredContextSummaries: readonly string[];
  readonly missingFacts: readonly string[];
  readonly analysisConfidence?: string;
  readonly suggestedReads: readonly string[];
  readonly suggestedVerification: readonly string[];
  readonly noWriteStatus: "mutation authority not granted";
  readonly output: string;
  readonly evidence: readonly string[];
}

export function buildTaskContextResult(input: {
  readonly needSet: TaskContextNeedSet;
  readonly acquisition?: TaskContextAcquisition;
  readonly sufficiency?: TaskContextSufficiency;
  readonly calibration?: AnalysisBriefCalibration;
  readonly analysisQualityGate?: AnalysisQualityGateResult;
}): TaskContextResult {
  const outcome = classifyOutcome(input);
  const missingFacts = Array.from(new Set([
    ...(input.sufficiency?.missingRequiredFacts ?? []),
    ...(input.sufficiency?.missingOptionalFacts ?? []),
    ...(input.calibration?.missingFacts ?? []),
  ]));
  const suggestedReads = Array.from(new Set([
    ...(input.acquisition?.suggestedReads ?? []),
    ...(input.sufficiency?.suggestedReads ?? []),
  ]));
  const suggestedVerification = Array.from(new Set([
    ...(input.acquisition?.suggestedVerification ?? []),
    ...(input.sufficiency?.suggestedVerification ?? []),
  ]));
  const requiredContextCategories = input.needSet.needs
    .filter((need) => need.required)
    .map((need) => need.kind);
  const output = [
    `Task context result: ${outcome}`,
    `Task: ${input.needSet.taskId}`,
    `Context needs: ${input.needSet.needSetId}`,
    input.acquisition ? `Acquisition: ${input.acquisition.acquisitionId}` : undefined,
    input.sufficiency ? `Sufficiency: ${input.sufficiency.state}` : undefined,
    input.calibration ? `Analysis confidence: ${input.calibration.confidence}` : undefined,
    `Required context: ${requiredContextCategories.join(", ") || "none"}`,
    `Acquired context: ${(input.acquisition?.acquiredSummaries ?? []).join("; ") || "none"}`,
    `Missing facts: ${missingFacts.join("; ") || "none"}`,
    `Suggested reads: ${suggestedReads.join("; ") || "none"}`,
    `Suggested verification: ${suggestedVerification.join("; ") || "none"}`,
    "No-write status: mutation authority not granted",
  ].filter(Boolean).join("\n");

  return {
    outcome,
    taskId: input.needSet.taskId,
    contextNeedSetId: input.needSet.needSetId,
    ...(input.acquisition ? { acquisitionId: input.acquisition.acquisitionId } : {}),
    ...(input.sufficiency ? { sufficiencyId: input.sufficiency.sufficiencyId } : {}),
    ...(input.calibration ? { analysisCalibrationId: input.calibration.calibrationId } : {}),
    ...(input.analysisQualityGate ? { analysisQualityGateId: input.analysisQualityGate.gateId } : {}),
    requiredContextCategories,
    acquiredContextSummaries: input.acquisition?.acquiredSummaries ?? [],
    missingFacts,
    ...(input.calibration ? { analysisConfidence: input.calibration.confidence } : {}),
    suggestedReads,
    suggestedVerification,
    noWriteStatus: "mutation authority not granted",
    output,
    evidence: [
      `task-context-result:outcome:${outcome}`,
      `task-context-result:need-set:${input.needSet.needSetId}`,
      ...(input.acquisition ? [`task-context-result:acquisition:${input.acquisition.acquisitionId}`] : []),
      ...(input.sufficiency ? [`task-context-result:sufficiency:${input.sufficiency.sufficiencyId}`] : []),
      ...(input.calibration ? [`task-context-result:analysis-calibration:${input.calibration.calibrationId}`] : []),
      ...(input.analysisQualityGate ? [`task-context-result:analysis-quality-gate:${input.analysisQualityGate.gateId}`] : []),
      `task-context-result:missing-facts:${missingFacts.length}`,
      "task-context-result:mutation-authority:not-granted",
      "task-context-result:provider-call:not-run",
      "task-context-result:command-dispatch:not-run",
      "task-context-result:raw-content-excluded",
      "task-context-result:hidden-cot-excluded",
    ],
  };
}

function classifyOutcome(input: {
  readonly needSet: TaskContextNeedSet;
  readonly acquisition?: TaskContextAcquisition;
  readonly sufficiency?: TaskContextSufficiency;
  readonly calibration?: AnalysisBriefCalibration;
  readonly analysisQualityGate?: AnalysisQualityGateResult;
}): TaskContextTerminalOutcome {
  if (input.analysisQualityGate?.decision === "stop-under-evidenced-analysis") {
    return "analysis-under-evidenced";
  }
  if (input.analysisQualityGate?.action === "provider-proposal" && !input.analysisQualityGate.allowed) {
    return "provider-blocked-by-analysis-quality";
  }
  if (input.analysisQualityGate?.action === "verification-planning" && !input.analysisQualityGate.allowed) {
    return "verification-blocked-by-context-sufficiency";
  }
  if (input.calibration?.readiness === "calibrated") {
    return "analysis-calibrated";
  }
  if (input.sufficiency?.state === "sufficient") {
    return "context-sufficient";
  }
  if (input.sufficiency) {
    return input.sufficiency.suggestedReads.length > 0 ? "suggested-reads-available" : "context-insufficient";
  }
  if (input.acquisition) {
    return "context-acquisition-planned";
  }
  return "context-needs-identified";
}
