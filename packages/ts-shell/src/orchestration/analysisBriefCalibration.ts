import crypto from "node:crypto";

import type { AnalysisBrief } from "./analysisBrief.js";
import type { TaskContextSufficiency } from "./taskContextSufficiency.js";

export type AnalysisCalibrationRiskLevel = "low" | "medium" | "high";
export type AnalysisCalibrationReadiness =
  | "calibrated"
  | "under-evidenced"
  | "missing-facts"
  | "stale-context"
  | "unsupported";

export interface AnalysisBriefCalibration {
  readonly calibrationId: string;
  readonly analysisBriefId: string;
  readonly taskId: string;
  readonly confidence: AnalysisBrief["confidence"];
  readonly readiness: AnalysisCalibrationReadiness;
  readonly riskLevel: AnalysisCalibrationRiskLevel;
  readonly unsupportedClaims: readonly string[];
  readonly underEvidencedClaims: readonly string[];
  readonly missingFacts: readonly string[];
  readonly rejectedAlternativesQuality: "present" | "weak" | "missing";
  readonly recommendedStrategyReadiness: "ready" | "needs-context" | "unsupported";
  readonly replaySafeSummary: string;
  readonly mutationAuthority: "not-granted";
  readonly evidence: readonly string[];
}

export function calibrateAnalysisBrief(input: {
  readonly analysisBrief: AnalysisBrief;
  readonly contextSufficiency?: TaskContextSufficiency;
  readonly additionalEvidenceIds?: readonly string[];
}): AnalysisBriefCalibration {
  const evidenceIds = new Set([
    ...input.analysisBrief.supportingEvidenceIds,
    ...input.analysisBrief.evidence,
    ...(input.contextSufficiency?.evidence ?? []),
    ...(input.additionalEvidenceIds ?? []),
  ]);
  const observedClaims = [
    ...input.analysisBrief.observations,
    ...input.analysisBrief.hypotheses,
    ...input.analysisBrief.rejectedAlternatives,
  ];
  const underEvidencedClaims = observedClaims
    .filter((claim) => claim.evidenceIds.length === 0 || !claim.evidenceIds.some((id) => evidenceIds.has(id)))
    .map((claim) => claim.claim);
  const missingFacts = Array.from(new Set([
    ...input.analysisBrief.missingFacts,
    ...(input.contextSufficiency?.missingRequiredFacts ?? []),
  ]));
  const unsupportedClaims = input.contextSufficiency?.state === "unsupported"
    ? input.analysisBrief.observations.map((claim) => claim.claim)
    : [];
  const riskLevel = classifyRisk({
    underEvidencedClaims,
    missingFacts,
    contextSufficiency: input.contextSufficiency,
    brief: input.analysisBrief,
  });
  const readiness = classifyReadiness({
    unsupportedClaims,
    underEvidencedClaims,
    missingFacts,
    contextSufficiency: input.contextSufficiency,
  });
  const confidence = calibrateConfidence({
    brief: input.analysisBrief,
    readiness,
    riskLevel,
    underEvidencedClaims,
    missingFacts,
  });
  const rejectedAlternativesQuality =
    input.analysisBrief.rejectedAlternatives.length === 0
      ? "missing"
      : input.analysisBrief.rejectedAlternatives.some((entry) => entry.evidenceIds.length > 0)
        ? "present"
        : "weak";
  const recommendedStrategyReadiness =
    readiness === "unsupported"
      ? "unsupported"
      : readiness === "calibrated"
        ? "ready"
        : "needs-context";
  const calibrationId = `analysis_calibration_${hash({
    analysisBriefId: input.analysisBrief.briefId,
    readiness,
    confidence,
    riskLevel,
    underEvidencedClaims,
    missingFacts,
  })}`;
  const replaySafeSummary = [
    `analysis-calibration ${calibrationId}`,
    `analysisBrief=${input.analysisBrief.briefId}`,
    `readiness=${readiness}`,
    `confidence=${confidence}`,
    `risk=${riskLevel}`,
    `underEvidenced=${underEvidencedClaims.length}`,
    `missingFacts=${missingFacts.length}`,
    "hidden-cot-excluded",
    "mutationAuthority=not-granted",
  ].join("; ");

  return {
    calibrationId,
    analysisBriefId: input.analysisBrief.briefId,
    taskId: input.analysisBrief.taskId,
    confidence,
    readiness,
    riskLevel,
    unsupportedClaims,
    underEvidencedClaims,
    missingFacts,
    rejectedAlternativesQuality,
    recommendedStrategyReadiness,
    replaySafeSummary,
    mutationAuthority: "not-granted",
    evidence: [
      `analysis-calibration:id:${calibrationId}`,
      `analysis-calibration:analysis-brief:${input.analysisBrief.briefId}`,
      `analysis-calibration:readiness:${readiness}`,
      `analysis-calibration:confidence:${confidence}`,
      `analysis-calibration:risk:${riskLevel}`,
      `analysis-calibration:under-evidenced:${underEvidencedClaims.length}`,
      `analysis-calibration:missing-facts:${missingFacts.length}`,
      `analysis-calibration:rejected-alternatives:${rejectedAlternativesQuality}`,
      "analysis-calibration:hidden-cot-excluded",
      "analysis-calibration:raw-content-excluded",
      "analysis-calibration:mutation-authority:not-granted",
    ],
  };
}

function classifyReadiness(input: {
  readonly unsupportedClaims: readonly string[];
  readonly underEvidencedClaims: readonly string[];
  readonly missingFacts: readonly string[];
  readonly contextSufficiency?: TaskContextSufficiency;
}): AnalysisCalibrationReadiness {
  if (input.unsupportedClaims.length > 0 || input.contextSufficiency?.state === "unsupported") {
    return "unsupported";
  }
  if (input.contextSufficiency?.state === "stale-context") {
    return "stale-context";
  }
  if (input.missingFacts.length > 0) {
    return "missing-facts";
  }
  if (input.underEvidencedClaims.length > 0) {
    return "under-evidenced";
  }
  return "calibrated";
}

function classifyRisk(input: {
  readonly underEvidencedClaims: readonly string[];
  readonly missingFacts: readonly string[];
  readonly contextSufficiency?: TaskContextSufficiency;
  readonly brief: AnalysisBrief;
}): AnalysisCalibrationRiskLevel {
  if (
    input.contextSufficiency?.state === "unsupported" ||
    input.contextSufficiency?.state === "stale-context" ||
    input.missingFacts.length > 0 ||
    input.brief.confidence === "low"
  ) {
    return "high";
  }
  if (input.underEvidencedClaims.length > 0 || input.brief.risks.length > 0) {
    return "medium";
  }
  return "low";
}

function calibrateConfidence(input: {
  readonly brief: AnalysisBrief;
  readonly readiness: AnalysisCalibrationReadiness;
  readonly riskLevel: AnalysisCalibrationRiskLevel;
  readonly underEvidencedClaims: readonly string[];
  readonly missingFacts: readonly string[];
}): AnalysisBrief["confidence"] {
  if (input.readiness !== "calibrated" || input.riskLevel === "high" || input.missingFacts.length > 0) {
    return "low";
  }
  if (input.riskLevel === "medium" || input.underEvidencedClaims.length > 0) {
    return "medium";
  }
  return input.brief.confidence === "low" ? "medium" : input.brief.confidence;
}

function hash(input: object): string {
  return crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 12);
}
