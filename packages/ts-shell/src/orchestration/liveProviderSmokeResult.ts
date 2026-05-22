import type { HarnessScorecard } from "./harnessScorecard.js";
import type { HarnessTrace } from "./harnessTrace.js";
import type { ProposalQualityReport, ProposalQualityReportStatus } from "./proposalQualityReport.js";

export type LiveProviderSmokeResultStatus =
  | "skipped-no-opt-in"
  | "skipped-provider-not-configured"
  | "skipped-provider-unsupported"
  | "skipped-provider-not-ready"
  | "skipped-provider-auth"
  | "skipped-provider-network"
  | "prompt-audit-failed"
  | "provider-called-provider-error"
  | "provider-called-output-valid"
  | "provider-called-output-invalid"
  | "provider-called-anchor-exact"
  | "provider-called-anchor-partial"
  | "provider-called-anchor-failed"
  | "provider-called-unsafe-output"
  | "no-write-confirmed";

export interface LiveProviderSmokeResult {
  readonly resultId: string;
  readonly runId: string;
  readonly status: LiveProviderSmokeResultStatus;
  readonly mode: "live-provider-smoke" | "fake-corpus";
  readonly providerSafeLabel: string;
  readonly providerKind: string;
  readonly adapterApproved: boolean;
  readonly providerCalled: boolean;
  readonly providerErrorClass: string;
  readonly skipReason?: string;
  readonly promptAuditId?: string;
  readonly outputValidationId?: string;
  readonly outputValidationStatus: string;
  readonly anchoredProposalId?: string;
  readonly anchorQuality: string;
  readonly qualityReportId?: string;
  readonly scorecardId?: string;
  readonly noWriteStatus: ProposalQualityReportStatus;
  readonly redactionStatus: string;
  readonly changedFiles: readonly [];
  readonly mutationAuthority: "not-granted";
  readonly output: string;
  readonly evidence: readonly string[];
}

export function buildLiveProviderSmokeResult(input: {
  readonly runId: string;
  readonly mode: "live-provider-smoke" | "fake-corpus";
  readonly providerSafeLabel: string;
  readonly providerKind?: string;
  readonly adapterApproved?: boolean;
  readonly providerCalled: boolean;
  readonly providerErrorClass?: string;
  readonly skipReason?: string;
  readonly gateDecision?: string;
  readonly promptAuditId?: string;
  readonly promptAuditStatus?: string;
  readonly outputValidationId?: string;
  readonly outputValidationStatus?: string;
  readonly anchoredProposalId?: string;
  readonly anchorQuality?: string;
  readonly qualityReportId?: string;
  readonly scorecardId?: string;
  readonly noWriteStatus?: ProposalQualityReportStatus;
  readonly redactionStatus?: string;
  readonly harnessTrace?: HarnessTrace;
  readonly harnessScorecard?: HarnessScorecard;
  readonly dryRunStatus?: string;
}): LiveProviderSmokeResult {
  const status = classifyResult(input);
  const resultId = buildResultId(input.runId, status);

  const output = [
    "live provider anchored smoke evaluated; mutation did not run.",
    `Mode: ${input.mode}`,
    `Provider: ${input.providerSafeLabel}`,
    `Provider kind: ${input.providerKind ?? input.providerSafeLabel}`,
    `Adapter approved: ${input.adapterApproved ? "yes" : "no"}`,
    `Provider called: ${input.providerCalled ? "yes" : "no"}`,
    `Provider error class: ${input.providerErrorClass ?? "none"}`,
    input.skipReason ? `Skip reason: ${input.skipReason}` : undefined,
    `Status: ${status}`,
    input.promptAuditId ? `Prompt audit: ${input.promptAuditId}` : undefined,
    input.outputValidationId ? `Output validation: ${input.outputValidationId}` : undefined,
    input.anchorQuality ? `Anchor quality: ${input.anchorQuality}` : undefined,
    `No-write: ${input.noWriteStatus ?? "pass"}`,
    "Mutation authority: not granted",
    "Raw provider output: excluded",
  ].filter(Boolean).join("\n");

  return {
    resultId,
    runId: input.runId,
    status,
    mode: input.mode,
    providerSafeLabel: input.providerSafeLabel,
    providerKind: input.providerKind ?? input.providerSafeLabel,
    adapterApproved: input.adapterApproved ?? false,
    providerCalled: input.providerCalled,
    providerErrorClass: input.providerErrorClass ?? "none",
    ...(input.skipReason ? { skipReason: input.skipReason } : {}),
    ...(input.promptAuditId ? { promptAuditId: input.promptAuditId } : {}),
    ...(input.outputValidationId ? { outputValidationId: input.outputValidationId } : {}),
    outputValidationStatus: input.outputValidationStatus ?? "none",
    ...(input.anchoredProposalId ? { anchoredProposalId: input.anchoredProposalId } : {}),
    anchorQuality: input.anchorQuality ?? "none",
    ...(input.qualityReportId ? { qualityReportId: input.qualityReportId } : {}),
    ...(input.scorecardId ? { scorecardId: input.scorecardId } : {}),
    noWriteStatus: input.noWriteStatus ?? "pass",
    redactionStatus: input.redactionStatus ?? "raw-content-excluded",
    changedFiles: [],
    mutationAuthority: "not-granted",
    output,
    evidence: [
      ...(input.harnessTrace?.evidence ?? []),
      ...(input.harnessScorecard?.evidence ?? []),
      `live-provider-smoke-result:id:${resultId}`,
      `live-provider-smoke-result:run:${input.runId}`,
      `live-provider-smoke-result:mode:${input.mode}`,
      `live-provider-smoke-result:status:${status}`,
      `live-provider-smoke-result:provider:${input.providerSafeLabel}`,
      `live-provider-smoke-result:provider-kind:${input.providerKind ?? input.providerSafeLabel}`,
      `live-provider-smoke-result:adapter-approved:${input.adapterApproved ?? false}`,
      `live-provider-smoke-result:provider-called:${input.providerCalled}`,
      `live-provider-smoke-result:provider-error-class:${input.providerErrorClass ?? "none"}`,
      ...(input.skipReason ? [`live-provider-smoke-result:skip-reason:${input.skipReason}`] : []),
      ...(input.promptAuditId ? [`live-provider-smoke-result:prompt-audit:${input.promptAuditId}`] : []),
      ...(input.outputValidationId ? [`live-provider-smoke-result:output-validation:${input.outputValidationId}`] : []),
      `live-provider-smoke-result:output-validation-status:${input.outputValidationStatus ?? "none"}`,
      ...(input.anchorQuality ? [`live-provider-smoke-result:anchor-quality:${input.anchorQuality}`] : []),
      ...(input.qualityReportId ? [`live-provider-smoke-result:quality-report:${input.qualityReportId}`] : []),
      ...(input.scorecardId ? [`live-provider-smoke-result:scorecard:${input.scorecardId}`] : []),
      `live-provider-smoke-result:no-write:${input.noWriteStatus ?? "pass"}`,
      `live-provider-smoke-result:redaction:${input.redactionStatus ?? "raw-content-excluded"}`,
      "live-provider-smoke-result:mutation:not-run",
      "live-provider-smoke-result:mutation-authority:not-granted",
      "live-provider-smoke-result:no-apply",
      "live-provider-smoke-result:raw-output-excluded",
    ],
  };
}

function classifyResult(input: {
  readonly providerCalled: boolean;
  readonly skipReason?: string;
  readonly gateDecision?: string;
  readonly promptAuditStatus?: string;
  readonly outputValidationStatus?: string;
  readonly anchorQuality?: string;
  readonly dryRunStatus?: string;
  readonly providerErrorClass?: string;
}): LiveProviderSmokeResultStatus {
  if (!input.providerCalled) {
    if (input.skipReason === "no-opt-in") return "skipped-no-opt-in";
    if (input.skipReason === "provider-not-configured") return "skipped-provider-not-configured";
    if (input.skipReason === "provider-unsupported") return "skipped-provider-unsupported";
    if (input.skipReason === "provider-auth") return "skipped-provider-auth";
    if (input.skipReason === "provider-network") return "skipped-provider-network";
    if (input.skipReason === "provider-not-ready") return "skipped-provider-not-ready";
    if (input.promptAuditStatus && input.promptAuditStatus !== "pass") return "prompt-audit-failed";
    if (input.gateDecision?.startsWith("stop-")) return "skipped-provider-not-ready";
    if (input.gateDecision?.startsWith("skip-")) {
      switch (input.gateDecision) {
        case "skip-no-opt-in": return "skipped-no-opt-in";
        case "skip-provider-not-configured": return "skipped-provider-not-configured";
        case "skip-provider-unsupported": return "skipped-provider-unsupported";
        case "skip-provider-auth": return "skipped-provider-auth";
        case "skip-provider-network": return "skipped-provider-network";
        default: return "skipped-provider-not-ready";
      }
    }
    return "skipped-provider-not-ready";
  }

  if (input.providerErrorClass && input.providerErrorClass !== "none") {
    return "provider-called-provider-error";
  }

  if (input.anchorQuality === "exact-ready") return "provider-called-anchor-exact";
  if (input.anchorQuality === "review-only" || input.anchorQuality === "needs-anchoring") {
    return "provider-called-anchor-partial";
  }
  if (input.dryRunStatus === "dry-run-exact-ready-no-write") return "provider-called-anchor-exact";
  if (input.dryRunStatus === "dry-run-review-required") return "provider-called-anchor-partial";
  if (input.outputValidationStatus === "unsafe-output" || input.anchorQuality === "unsafe") {
    return "provider-called-unsafe-output";
  }
  if (input.outputValidationStatus && input.outputValidationStatus !== "valid-exact-single-target" &&
      input.outputValidationStatus !== "valid-exact-hunk-set" && input.outputValidationStatus !== "partial-anchor") {
    return "provider-called-output-invalid";
  }
  if (input.anchorQuality === "unsupported") return "provider-called-anchor-failed";
  if (input.outputValidationStatus === "valid-exact-single-target" || input.outputValidationStatus === "valid-exact-hunk-set") {
    return "provider-called-output-valid";
  }
  return "provider-called-anchor-failed";
}

function buildResultId(runId: string, status: LiveProviderSmokeResultStatus): string {
  return ["live_provider_smoke_result", runId, status]
    .join("_")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 128);
}
