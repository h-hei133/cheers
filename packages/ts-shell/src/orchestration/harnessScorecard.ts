import type { HarnessTrace } from "./harnessTrace.js";
import type { PlanQuality } from "./planQuality.js";

export type HarnessScorecardStatus = "pass" | "warn" | "fail" | "skip";

export interface HarnessScorecard {
  readonly scorecardId: string;
  readonly traceId?: string;
  readonly planQualityId?: string;
  readonly contextQuality: HarnessScorecardStatus;
  readonly planReadiness: HarnessScorecardStatus;
  readonly providerProposalReadiness: HarnessScorecardStatus;
  readonly verificationReadiness: HarnessScorecardStatus;
  readonly repairReadiness: HarnessScorecardStatus;
  readonly resultTruthfulness: HarnessScorecardStatus;
  readonly continuationReadiness: HarnessScorecardStatus;
  readonly failureClass: string;
  readonly nextSuggestedRouteAction: string;
  readonly mutationAuthority: "not-granted";
  readonly replaySafeSummary: string;
  readonly evidence: readonly string[];
}

export function buildHarnessScorecard(input: {
  readonly planQuality?: PlanQuality;
  readonly trace?: HarnessTrace;
  readonly providerProposalReady?: boolean;
  readonly verificationReady?: boolean;
  readonly repairReady?: boolean;
  readonly resultTruthful?: boolean;
  readonly continuationReady?: boolean;
}): HarnessScorecard {
  const failureClass = input.trace?.failureTaxonomy.failureClass ?? "unknown";
  const contextQuality = scoreContext(input.planQuality);
  const planReadiness = scorePlan(input.planQuality);
  const providerProposalReadiness = input.providerProposalReady === undefined
    ? "skip"
    : input.providerProposalReady ? "pass" : "fail";
  const verificationReadiness = input.verificationReady === undefined
    ? "skip"
    : input.verificationReady ? "pass" : "fail";
  const repairReadiness = input.repairReady === undefined
    ? "skip"
    : input.repairReady ? "pass" : "fail";
  const resultTruthfulness = input.resultTruthful === false ? "fail" : input.resultTruthful ? "pass" : "warn";
  const continuationReadiness = input.continuationReady === false ? "fail" : input.continuationReady ? "pass" : "warn";
  const scorecardId = `harness_scorecard_${[
    input.trace?.traceId ?? "no-trace",
    input.planQuality?.qualityId ?? "no-quality",
    contextQuality,
    planReadiness,
    providerProposalReadiness,
    verificationReadiness,
    repairReadiness,
    failureClass,
  ].join(":").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 96)}`;
  const nextSuggestedRouteAction =
    input.planQuality?.suggestedNextAction ??
    input.trace?.failureTaxonomy.suggestedNextAction ??
    "Inspect quality and trace evidence before downstream execution.";
  const replaySafeSummary = [
    `harness-scorecard ${scorecardId}`,
    input.trace ? `trace=${input.trace.traceId}` : undefined,
    input.planQuality ? `planQuality=${input.planQuality.qualityId}` : undefined,
    `context=${contextQuality}`,
    `plan=${planReadiness}`,
    `provider=${providerProposalReadiness}`,
    `verification=${verificationReadiness}`,
    `repair=${repairReadiness}`,
    `failureClass=${failureClass}`,
    "mutationAuthority=not-granted",
    "raw-content-excluded",
  ].filter(Boolean).join("; ");

  return {
    scorecardId,
    ...(input.trace ? { traceId: input.trace.traceId } : {}),
    ...(input.planQuality ? { planQualityId: input.planQuality.qualityId } : {}),
    contextQuality,
    planReadiness,
    providerProposalReadiness,
    verificationReadiness,
    repairReadiness,
    resultTruthfulness,
    continuationReadiness,
    failureClass,
    nextSuggestedRouteAction,
    mutationAuthority: "not-granted",
    replaySafeSummary,
    evidence: [
      `harness-scorecard:id:${scorecardId}`,
      ...(input.trace ? [`harness-scorecard:trace:${input.trace.traceId}`] : []),
      ...(input.planQuality ? [`harness-scorecard:plan-quality:${input.planQuality.qualityId}`] : []),
      `harness-scorecard:context:${contextQuality}`,
      `harness-scorecard:plan:${planReadiness}`,
      `harness-scorecard:provider:${providerProposalReadiness}`,
      `harness-scorecard:verification:${verificationReadiness}`,
      `harness-scorecard:repair:${repairReadiness}`,
      `harness-scorecard:failure-class:${failureClass}`,
      "harness-scorecard:mutation-authority:not-granted",
      "harness-scorecard:raw-content-excluded",
    ],
  };
}

function scoreContext(quality: PlanQuality | undefined): HarnessScorecardStatus {
  if (!quality) return "skip";
  if (quality.level === "budget-limited" || quality.level === "unsupported") return "fail";
  if (quality.level === "needs-more-context" || quality.level === "low-confidence") return "warn";
  return "pass";
}

function scorePlan(quality: PlanQuality | undefined): HarnessScorecardStatus {
  if (!quality) return "skip";
  if (quality.level === "ready") return "pass";
  if (quality.level === "blocked" || quality.level === "unsupported") return "fail";
  return "warn";
}
