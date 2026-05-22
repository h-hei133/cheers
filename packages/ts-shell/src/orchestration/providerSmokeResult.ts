import type { HarnessScorecard } from "./harnessScorecard.js";
import type { HarnessTrace } from "./harnessTrace.js";
import type { ProposalQualityReport } from "./proposalQualityReport.js";

export type ProviderSmokeResultStatus =
  | "fake-corpus-passed"
  | "fake-corpus-warned"
  | "fake-corpus-failed"
  | "real-provider-smoke-skipped-no-opt-in"
  | "real-provider-smoke-skipped-provider-unavailable"
  | "real-provider-smoke-proposal-created-no-write"
  | "real-provider-smoke-output-invalid"
  | "prompt-audit-failed"
  | "anchoring-failed"
  | "anchoring-partial"
  | "anchoring-exact-ready"
  | "unsafe-output-blocked"
  | "no-write-compliance-confirmed";

export interface ProviderSmokeResult {
  readonly resultId: string;
  readonly status: ProviderSmokeResultStatus;
  readonly mode: ProposalQualityReport["mode"];
  readonly providerSafeLabel: string;
  readonly providerCalled: boolean;
  readonly skipReason?: string;
  readonly promptAuditSummary: string;
  readonly outputValidationSummary: string;
  readonly anchorQuality: string;
  readonly proposalReadiness: string;
  readonly scorecardStatus: ProposalQualityReport["scorecardStatus"];
  readonly noWriteStatus: ProposalQualityReport["noWriteStatus"];
  readonly changedFiles: readonly [];
  readonly mutationAuthority: "not-granted";
  readonly mutation: "not-run";
  readonly output: string;
  readonly evidence: readonly string[];
}

export function buildProviderSmokeResult(input: {
  readonly runId: string;
  readonly reports: readonly ProposalQualityReport[];
  readonly harnessTrace?: HarnessTrace;
  readonly harnessScorecard?: HarnessScorecard;
}): ProviderSmokeResult {
  const primary = input.reports[0];
  if (!primary) throw new Error("provider smoke result requires at least one quality report");
  const status = classifyStatus(input.reports);
  const failed = input.reports.filter((report) => report.scorecardStatus === "fail").length;
  const warned = input.reports.filter((report) => report.scorecardStatus === "warn").length;
  const skipped = input.reports.filter((report) => report.scorecardStatus === "skip").length;
  const resultId = [
    "provider_smoke_result",
    input.runId,
    primary.mode,
    status,
    input.reports.length,
    failed,
    warned,
    skipped,
  ].join("_").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 128);
  const output = [
    "anchored provider smoke evaluated; mutation did not run.",
    `Mode: ${primary.mode}`,
    `Provider: ${primary.providerSafeLabel}`,
    `Provider called: ${input.reports.some((report) => report.providerCalled) ? "yes" : "no"}`,
    primary.skipReason ? `Skip reason: ${primary.skipReason}` : undefined,
    `Prompt audit: ${primary.promptAuditStatus}`,
    `Output validation: ${primary.outputValidationStatus}`,
    `Anchor quality: ${primary.anchorQuality}`,
    `Proposal readiness: ${primary.proposalReadiness}`,
    `Scorecard: ${primary.scorecardStatus}`,
    `No-write: ${primary.noWriteStatus}`,
    `Reports: ${input.reports.length}`,
    `Failed: ${failed}`,
    `Warned: ${warned}`,
    `Skipped: ${skipped}`,
    "Mutation authority: not granted",
    "Raw provider output: excluded",
  ].filter(Boolean).join("\n");

  return {
    resultId,
    status,
    mode: primary.mode,
    providerSafeLabel: primary.providerSafeLabel,
    providerCalled: input.reports.some((report) => report.providerCalled),
    ...(primary.skipReason ? { skipReason: primary.skipReason } : {}),
    promptAuditSummary: primary.promptAuditStatus,
    outputValidationSummary: primary.outputValidationStatus,
    anchorQuality: primary.anchorQuality,
    proposalReadiness: primary.proposalReadiness,
    scorecardStatus: primary.scorecardStatus,
    noWriteStatus: primary.noWriteStatus,
    changedFiles: [],
    mutationAuthority: "not-granted",
    mutation: "not-run",
    output,
    evidence: [
      ...input.reports.flatMap((report) => report.evidence),
      ...(input.harnessTrace?.evidence ?? []),
      ...(input.harnessScorecard?.evidence ?? []),
      `provider-smoke-result:id:${resultId}`,
      `provider-smoke-result:status:${status}`,
      `provider-smoke-result:mode:${primary.mode}`,
      `provider-smoke-result:provider:${primary.providerSafeLabel}`,
      `provider-smoke-result:provider-called:${input.reports.some((report) => report.providerCalled)}`,
      ...(primary.skipReason ? [`provider-smoke-result:skip-reason:${primary.skipReason}`] : []),
      `provider-smoke-result:scorecard:${primary.scorecardStatus}`,
      `provider-smoke-result:no-write:${primary.noWriteStatus}`,
      "provider-smoke-result:mutation:not-run",
      "provider-smoke-result:mutation-authority:not-granted",
      "provider-smoke-result:no-apply",
      "provider-smoke-result:raw-output-excluded",
    ],
  };
}

function classifyStatus(reports: readonly ProposalQualityReport[]): ProviderSmokeResultStatus {
  const first = reports[0];
  if (first.mode === "fake-corpus") {
    if (reports.some((report) => report.scorecardStatus === "fail")) return "fake-corpus-failed";
    if (reports.some((report) => report.scorecardStatus === "warn")) return "fake-corpus-warned";
    return "fake-corpus-passed";
  }
  if (first.skipReason === "no-opt-in") return "real-provider-smoke-skipped-no-opt-in";
  if (first.skipReason) return "real-provider-smoke-skipped-provider-unavailable";
  if (first.failureClass === "smoke prompt audit failed") return "prompt-audit-failed";
  if (first.failureClass === "smoke unsafe output") return "unsafe-output-blocked";
  if (first.failureClass === "smoke output invalid") return "real-provider-smoke-output-invalid";
  if (first.handoffReadiness === "exact-single-target" || first.handoffReadiness === "exact-hunk-set") {
    return "anchoring-exact-ready";
  }
  if (first.proposalReadiness === "review-only") return "anchoring-partial";
  if (first.noWriteStatus === "pass" && first.providerCalled) return "real-provider-smoke-proposal-created-no-write";
  return first.noWriteStatus === "pass" ? "no-write-compliance-confirmed" : "anchoring-failed";
}
