import type { CodingResultSummary } from "./types.js";
import type { HarnessScorecard } from "./harnessScorecard.js";
import type { HarnessTrace } from "./harnessTrace.js";
import type { PlanQuality } from "./planQuality.js";
import type { PlanQualityGateResult } from "./planQualityGate.js";

export function buildPlanQualityCodingResult(input: {
  readonly planQuality: PlanQuality;
  readonly gate?: PlanQualityGateResult;
  readonly trace?: HarnessTrace;
  readonly scorecard?: HarnessScorecard;
}): CodingResultSummary {
  const quality = input.planQuality;
  const reason = input.gate?.reason ?? `Plan quality ${quality.level}.`;
  const evidence = [
    quality.replaySafeSummary,
    ...quality.evidence,
    ...(input.gate?.evidence ?? []),
    ...(input.trace ? [input.trace.replaySafeSummary, ...input.trace.evidence] : []),
    ...(input.scorecard ? [input.scorecard.replaySafeSummary, ...input.scorecard.evidence] : []),
    "plan-quality-result:mutation-authority:not-granted",
    "plan-quality-result:raw-content-excluded",
  ];
  return {
    taskKind: "inspect-files",
    changedFiles: [],
    failedFiles: quality.level === "ready" ? [] : [{ path: quality.sourceAgentPlanId, reason }],
    repair: {
      status: "not-needed",
      attempts: 0,
      recoveredItems: [],
      failedItems: [],
      notes: ["plan quality result is no-write and does not grant mutation authority"],
    },
    continuation: {
      status: "first-pass-success",
      attempts: 0,
      evidence,
    },
    changeSet: {
      gitAware: false,
      preExistingDirtyFiles: [],
      postRunDirtyFiles: [],
      attemptedFiles: [],
      changedFiles: [],
      unchangedAttemptedFiles: [],
    },
    taskSatisfaction: {
      verdict: quality.level === "ready" ? "satisfied" : "insufficient-evidence",
      reasons: [reason],
      requiredEvidence: ["plan quality score", "quality gate decision", "harness trace or scorecard when present"],
      observedEvidence: evidence,
    },
    verifiedFiles: [],
    unverifiedFiles: quality.level === "ready" ? [] : [{ path: quality.sourceAgentPlanId, reason }],
    verification: {
      status: quality.level === "ready" ? "skipped" : "blocked",
      reason,
      blockerKind: "unknown",
      nextAction: input.gate?.nextAction ?? quality.suggestedNextAction,
    },
    evidence,
    failureBoundary: quality.level === "ready" ? undefined : `plan-quality-${quality.level}`,
  };
}
