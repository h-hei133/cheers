import type { HarnessTrace } from "./harnessTrace.js";
import type { PlanQuality } from "../../planning/quality/model.js";

export type HarnessScorecardStatus = "pass" | "warn" | "fail" | "skip";

export interface HarnessScorecard {
  readonly scorecardId: string;
  readonly traceId?: string;
  readonly planQualityId?: string;
  readonly contextQuality: HarnessScorecardStatus;
  readonly planReadiness: HarnessScorecardStatus;
  readonly providerProposalReadiness: HarnessScorecardStatus;
  readonly providerDryRunPromptReadiness?: HarnessScorecardStatus;
  readonly providerDryRunOutputValidity?: HarnessScorecardStatus;
  readonly providerDryRunAnchorQuality?: HarnessScorecardStatus;
  readonly providerAnchoringReadiness?: HarnessScorecardStatus;
  readonly providerAnchoringNoWrite?: HarnessScorecardStatus;
  readonly providerDryRunRedaction?: HarnessScorecardStatus;
  readonly providerDryRunNoWrite?: HarnessScorecardStatus;
  readonly providerSmokeMode?: string;
  readonly providerSmokeProviderKind?: string;
  readonly providerSmokeAdapterApproved?: boolean;
  readonly providerSmokeCaseId?: string;
  readonly providerSmokeSkipReason?: string;
  readonly providerSmokeReportId?: string;
  readonly providerSmokeProviderCalled?: boolean;
  readonly providerSmokeProviderErrorClass?: string;
  readonly providerSmokeOutputValidation?: string;
  readonly providerSmokeAnchorQuality?: string;
  readonly providerSmokeNoWrite?: HarnessScorecardStatus;
  readonly providerSmokeQuality?: HarnessScorecardStatus;
  readonly verificationReadiness: HarnessScorecardStatus;
  readonly repairReadiness: HarnessScorecardStatus;
  readonly resultTruthfulness: HarnessScorecardStatus;
  readonly continuationReadiness: HarnessScorecardStatus;
  readonly failureClass: string;
  readonly contextSufficiencyState?: string;
  readonly analysisConfidence?: string;
  readonly underEvidencedClaimsCount?: number;
  readonly missingRequiredContextCount?: number;
  readonly staleContext?: boolean;
  readonly budgetLimitedContext?: boolean;
  readonly nextSuggestedRouteAction: string;
  readonly mutationAuthority: "not-granted";
  readonly replaySafeSummary: string;
  readonly evidence: readonly string[];
}

export function buildHarnessScorecard(input: {
  readonly planQuality?: PlanQuality;
  readonly trace?: HarnessTrace;
  readonly providerProposalReady?: boolean;
  readonly providerDryRun?: {
    readonly promptAuditStatus?: string;
    readonly outputValidationStatus?: string;
    readonly anchorQualityLevel?: string;
    readonly anchoringOutcome?: string;
    readonly anchoredProposalId?: string;
    readonly anchoringReviewReadiness?: string;
    readonly anchoringNoWrite?: boolean;
    readonly redactionStatus?: string;
    readonly noWrite?: boolean;
  };
  readonly providerSmoke?: {
    readonly mode?: string;
    readonly providerKind?: string;
    readonly adapterApproved?: boolean;
    readonly caseId?: string;
    readonly skipReason?: string;
    readonly reportId?: string;
    readonly providerCalled?: boolean;
    readonly providerErrorClass?: string;
    readonly outputValidationStatus?: string;
    readonly anchorQuality?: string;
    readonly noWriteStatus?: string;
    readonly scorecardStatus?: string;
  };
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
  const providerDryRunPromptReadiness = input.providerDryRun
    ? input.providerDryRun.promptAuditStatus === "pass" ? "pass" : "fail"
    : undefined;
  const providerDryRunOutputValidity = input.providerDryRun
    ? scoreProviderOutput(input.providerDryRun.outputValidationStatus)
    : undefined;
  const providerDryRunAnchorQuality = input.providerDryRun
    ? scoreAnchorQuality(input.providerDryRun.anchorQualityLevel)
    : undefined;
  const providerAnchoringReadiness = input.providerDryRun
    ? scoreAnchoring(input.providerDryRun.anchoringOutcome, input.providerDryRun.anchoringReviewReadiness)
    : undefined;
  const providerAnchoringNoWrite = input.providerDryRun
    ? input.providerDryRun.anchoringNoWrite === false ? "fail" : "pass"
    : undefined;
  const providerDryRunRedaction = input.providerDryRun
    ? input.providerDryRun.redactionStatus === "redacted-and-budgeted" ||
        input.providerDryRun.redactionStatus === "raw-content-excluded"
      ? "pass"
      : "fail"
    : undefined;
  const providerDryRunNoWrite = input.providerDryRun
    ? input.providerDryRun.noWrite === false ? "fail" : "pass"
    : undefined;
  const providerSmokeNoWrite = input.providerSmoke
    ? input.providerSmoke.noWriteStatus === "fail" ? "fail" : "pass"
    : undefined;
  const providerSmokeQuality = input.providerSmoke
    ? scoreSmokeQuality(input.providerSmoke.scorecardStatus)
    : undefined;
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
    input.trace?.contextSufficiencyState ? `contextSufficiency=${input.trace.contextSufficiencyState}` : undefined,
    input.trace?.analysisConfidence ? `analysisConfidence=${input.trace.analysisConfidence}` : undefined,
    typeof input.trace?.underEvidencedClaimsCount === "number" ? `underEvidenced=${input.trace.underEvidencedClaimsCount}` : undefined,
    typeof input.trace?.missingRequiredContextCount === "number" ? `missingRequiredContext=${input.trace.missingRequiredContextCount}` : undefined,
    `context=${contextQuality}`,
    `plan=${planReadiness}`,
    `provider=${providerProposalReadiness}`,
    providerDryRunPromptReadiness ? `dryRunPrompt=${providerDryRunPromptReadiness}` : undefined,
    providerDryRunOutputValidity ? `dryRunOutput=${providerDryRunOutputValidity}` : undefined,
    providerDryRunAnchorQuality ? `dryRunAnchor=${providerDryRunAnchorQuality}` : undefined,
    providerAnchoringReadiness ? `anchoring=${providerAnchoringReadiness}` : undefined,
    providerAnchoringNoWrite ? `anchoringNoWrite=${providerAnchoringNoWrite}` : undefined,
    providerDryRunRedaction ? `dryRunRedaction=${providerDryRunRedaction}` : undefined,
    providerDryRunNoWrite ? `dryRunNoWrite=${providerDryRunNoWrite}` : undefined,
    input.providerSmoke?.mode ? `providerSmokeMode=${input.providerSmoke.mode}` : undefined,
    input.providerSmoke?.providerKind ? `providerSmokeProvider=${input.providerSmoke.providerKind}` : undefined,
    typeof input.providerSmoke?.adapterApproved === "boolean" ? `providerSmokeAdapterApproved=${input.providerSmoke.adapterApproved}` : undefined,
    input.providerSmoke?.caseId ? `providerSmokeCase=${input.providerSmoke.caseId}` : undefined,
    input.providerSmoke?.skipReason ? `providerSmokeSkip=${input.providerSmoke.skipReason}` : undefined,
    input.providerSmoke?.reportId ? `providerSmokeReport=${input.providerSmoke.reportId}` : undefined,
    typeof input.providerSmoke?.providerCalled === "boolean" ? `providerSmokeCalled=${input.providerSmoke.providerCalled}` : undefined,
    input.providerSmoke?.providerErrorClass ? `providerSmokeError=${input.providerSmoke.providerErrorClass}` : undefined,
    input.providerSmoke?.outputValidationStatus ? `providerSmokeOutput=${input.providerSmoke.outputValidationStatus}` : undefined,
    input.providerSmoke?.anchorQuality ? `providerSmokeAnchor=${input.providerSmoke.anchorQuality}` : undefined,
    providerSmokeNoWrite ? `providerSmokeNoWrite=${providerSmokeNoWrite}` : undefined,
    providerSmokeQuality ? `providerSmokeQuality=${providerSmokeQuality}` : undefined,
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
    ...(providerDryRunPromptReadiness ? { providerDryRunPromptReadiness } : {}),
    ...(providerDryRunOutputValidity ? { providerDryRunOutputValidity } : {}),
    ...(providerDryRunAnchorQuality ? { providerDryRunAnchorQuality } : {}),
    ...(providerAnchoringReadiness ? { providerAnchoringReadiness } : {}),
    ...(providerAnchoringNoWrite ? { providerAnchoringNoWrite } : {}),
    ...(providerDryRunRedaction ? { providerDryRunRedaction } : {}),
    ...(providerDryRunNoWrite ? { providerDryRunNoWrite } : {}),
    ...(input.providerSmoke?.mode ? { providerSmokeMode: input.providerSmoke.mode } : {}),
    ...(input.providerSmoke?.providerKind ? { providerSmokeProviderKind: input.providerSmoke.providerKind } : {}),
    ...(typeof input.providerSmoke?.adapterApproved === "boolean" ? { providerSmokeAdapterApproved: input.providerSmoke.adapterApproved } : {}),
    ...(input.providerSmoke?.caseId ? { providerSmokeCaseId: input.providerSmoke.caseId } : {}),
    ...(input.providerSmoke?.skipReason ? { providerSmokeSkipReason: input.providerSmoke.skipReason } : {}),
    ...(input.providerSmoke?.reportId ? { providerSmokeReportId: input.providerSmoke.reportId } : {}),
    ...(typeof input.providerSmoke?.providerCalled === "boolean" ? { providerSmokeProviderCalled: input.providerSmoke.providerCalled } : {}),
    ...(input.providerSmoke?.providerErrorClass ? { providerSmokeProviderErrorClass: input.providerSmoke.providerErrorClass } : {}),
    ...(input.providerSmoke?.outputValidationStatus ? { providerSmokeOutputValidation: input.providerSmoke.outputValidationStatus } : {}),
    ...(input.providerSmoke?.anchorQuality ? { providerSmokeAnchorQuality: input.providerSmoke.anchorQuality } : {}),
    ...(providerSmokeNoWrite ? { providerSmokeNoWrite } : {}),
    ...(providerSmokeQuality ? { providerSmokeQuality } : {}),
    verificationReadiness,
    repairReadiness,
    resultTruthfulness,
    continuationReadiness,
    failureClass,
    ...(input.trace?.contextSufficiencyState ? { contextSufficiencyState: input.trace.contextSufficiencyState } : {}),
    ...(input.trace?.analysisConfidence ? { analysisConfidence: input.trace.analysisConfidence } : {}),
    ...(typeof input.trace?.underEvidencedClaimsCount === "number" ? { underEvidencedClaimsCount: input.trace.underEvidencedClaimsCount } : {}),
    ...(typeof input.trace?.missingRequiredContextCount === "number" ? { missingRequiredContextCount: input.trace.missingRequiredContextCount } : {}),
    ...(typeof input.trace?.staleContext === "boolean" ? { staleContext: input.trace.staleContext } : {}),
    ...(typeof input.trace?.budgetLimitedContext === "boolean" ? { budgetLimitedContext: input.trace.budgetLimitedContext } : {}),
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
      ...(providerDryRunPromptReadiness ? [`harness-scorecard:provider-dry-run-prompt:${providerDryRunPromptReadiness}`] : []),
      ...(providerDryRunOutputValidity ? [`harness-scorecard:provider-dry-run-output:${providerDryRunOutputValidity}`] : []),
      ...(providerDryRunAnchorQuality ? [`harness-scorecard:provider-dry-run-anchor:${providerDryRunAnchorQuality}`] : []),
      ...(providerAnchoringReadiness ? [`harness-scorecard:provider-anchoring:${providerAnchoringReadiness}`] : []),
      ...(input.providerDryRun?.anchoringOutcome ? [`harness-scorecard:provider-anchoring-outcome:${input.providerDryRun.anchoringOutcome}`] : []),
      ...(input.providerDryRun?.anchoredProposalId ? [`harness-scorecard:provider-anchored-proposal:${input.providerDryRun.anchoredProposalId}`] : []),
      ...(providerAnchoringNoWrite ? [`harness-scorecard:provider-anchoring-no-write:${providerAnchoringNoWrite}`] : []),
      ...(providerDryRunRedaction ? [`harness-scorecard:provider-dry-run-redaction:${providerDryRunRedaction}`] : []),
      ...(providerDryRunNoWrite ? [`harness-scorecard:provider-dry-run-no-write:${providerDryRunNoWrite}`] : []),
      ...(input.providerSmoke?.mode ? [`harness-scorecard:provider-smoke-mode:${input.providerSmoke.mode}`] : []),
      ...(input.providerSmoke?.providerKind ? [`harness-scorecard:provider-smoke-provider:${input.providerSmoke.providerKind}`] : []),
      ...(typeof input.providerSmoke?.adapterApproved === "boolean" ? [`harness-scorecard:provider-smoke-adapter-approved:${input.providerSmoke.adapterApproved}`] : []),
      ...(input.providerSmoke?.caseId ? [`harness-scorecard:provider-smoke-case:${input.providerSmoke.caseId}`] : []),
      ...(input.providerSmoke?.skipReason ? [`harness-scorecard:provider-smoke-skip:${input.providerSmoke.skipReason}`] : []),
      ...(input.providerSmoke?.reportId ? [`harness-scorecard:provider-smoke-report:${input.providerSmoke.reportId}`] : []),
      ...(typeof input.providerSmoke?.providerCalled === "boolean" ? [`harness-scorecard:provider-smoke-called:${input.providerSmoke.providerCalled}`] : []),
      ...(input.providerSmoke?.providerErrorClass ? [`harness-scorecard:provider-smoke-error:${input.providerSmoke.providerErrorClass}`] : []),
      ...(input.providerSmoke?.outputValidationStatus ? [`harness-scorecard:provider-smoke-output:${input.providerSmoke.outputValidationStatus}`] : []),
      ...(input.providerSmoke?.anchorQuality ? [`harness-scorecard:provider-smoke-anchor:${input.providerSmoke.anchorQuality}`] : []),
      ...(providerSmokeNoWrite ? [`harness-scorecard:provider-smoke-no-write:${providerSmokeNoWrite}`] : []),
      ...(providerSmokeQuality ? [`harness-scorecard:provider-smoke-quality:${providerSmokeQuality}`] : []),
      `harness-scorecard:verification:${verificationReadiness}`,
      `harness-scorecard:repair:${repairReadiness}`,
      `harness-scorecard:failure-class:${failureClass}`,
      ...(input.trace?.contextSufficiencyState ? [`harness-scorecard:context-sufficiency:${input.trace.contextSufficiencyState}`] : []),
      ...(input.trace?.analysisConfidence ? [`harness-scorecard:analysis-confidence:${input.trace.analysisConfidence}`] : []),
      ...(typeof input.trace?.underEvidencedClaimsCount === "number" ? [`harness-scorecard:under-evidenced:${input.trace.underEvidencedClaimsCount}`] : []),
      ...(typeof input.trace?.missingRequiredContextCount === "number" ? [`harness-scorecard:missing-required-context:${input.trace.missingRequiredContextCount}`] : []),
      ...(input.trace?.staleContext ? ["harness-scorecard:stale-context"] : []),
      ...(input.trace?.budgetLimitedContext ? ["harness-scorecard:budget-limited-context"] : []),
      "harness-scorecard:mutation-authority:not-granted",
      "harness-scorecard:raw-content-excluded",
    ],
  };
}

function scoreProviderOutput(status: string | undefined): HarnessScorecardStatus {
  if (!status) return "skip";
  if (status === "valid-exact-single-target" || status === "valid-exact-hunk-set") return "pass";
  if (status === "partial-anchor" || status === "unanchored-generated") return "warn";
  return "fail";
}

function scoreAnchorQuality(level: string | undefined): HarnessScorecardStatus {
  if (!level) return "skip";
  if (level === "exact-ready") return "pass";
  if (level === "review-only" || level === "needs-anchoring" || level === "ambiguous" || level === "stale") return "warn";
  return "fail";
}

function scoreSmokeQuality(status: string | undefined): HarnessScorecardStatus {
  if (!status) return "skip";
  if (status === "pass") return "pass";
  if (status === "warn" || status === "skip") return status;
  return "fail";
}

function scoreAnchoring(
  outcome: string | undefined,
  reviewReadiness: string | undefined,
): HarnessScorecardStatus {
  if (!outcome && !reviewReadiness) return "skip";
  if (
    outcome === "anchored-proposal-handoff-ready" ||
    outcome === "exact-anchors-ready-for-review" ||
    reviewReadiness === "explicit-review-and-confirmation"
  ) {
    return "pass";
  }
  if (
    outcome === "partial-anchors-review-only" ||
    outcome === "ambiguous-anchors-need-target-selection" ||
    outcome === "stale-context-blocks-anchoring" ||
    reviewReadiness === "review-only" ||
    reviewReadiness === "target-selection-required" ||
    reviewReadiness === "context-refresh-required"
  ) {
    return "warn";
  }
  return "fail";
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
