import type { AnchoredProviderSmokeGate } from "./anchoredProviderSmokeGate.js";
import type { ProposalQualityCorpusCase } from "./proposalQualityCorpus.js";
import type { RealProviderProposalDryRunResult } from "./realProviderProposalDryRun.js";

export type ProposalQualityReportMode = "fake-corpus" | "real-provider-smoke";
export type ProposalQualityReportStatus = "pass" | "warn" | "fail" | "skip";

export interface ProposalQualityReport {
  readonly reportId: string;
  readonly runId: string;
  readonly mode: ProposalQualityReportMode;
  readonly providerSafeLabel: string;
  readonly caseId?: string;
  readonly providerCalled: boolean;
  readonly skipReason?: string;
  readonly promptAuditStatus: string;
  readonly outputValidationStatus: string;
  readonly anchorExtractionStatus: string;
  readonly matchConflictStatus: string;
  readonly anchorQuality: string;
  readonly proposalReadiness: string;
  readonly handoffReadiness: string;
  readonly noWriteStatus: ProposalQualityReportStatus;
  readonly failureClass: string;
  readonly scorecardStatus: ProposalQualityReportStatus;
  readonly mutationAuthority: "not-granted";
  readonly rawOutput: "excluded";
  readonly evidence: readonly string[];
}

export function buildProposalQualityReport(input: {
  readonly runId: string;
  readonly mode: ProposalQualityReportMode;
  readonly providerSafeLabel?: string;
  readonly case?: ProposalQualityCorpusCase;
  readonly gate?: AnchoredProviderSmokeGate;
  readonly dryRun?: RealProviderProposalDryRunResult;
  readonly failureClass?: string;
}): ProposalQualityReport {
  const dryRun = input.dryRun;
  const anchored = dryRun?.anchoredProposal;
  const noWriteStatus =
    dryRun && (dryRun.changedFiles.length > 0 || dryRun.mutation !== "not-run" || dryRun.mutationAuthority !== "not-granted")
      ? "fail"
      : "pass";
  const status = scoreReport({
    gate: input.gate,
    dryRun,
    noWriteStatus,
    expectedFailureClass: input.case?.expectedFailureClass,
  });
  const failureClass = input.failureClass ?? classifyReportFailure(input.gate, dryRun);
  const providerSafeLabel =
    input.providerSafeLabel ?? dryRun?.providerSafeLabel ?? input.gate?.providerSafeLabel ?? "unknown";
  const reportId = [
    "proposal_quality_report",
    input.runId,
    input.mode,
    input.case?.caseId ?? "no-case",
    dryRun?.dryRunId ?? input.gate?.gateId ?? "no-dry-run",
    status,
  ].join("_").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 128);
  const anchorExtractionStatus = anchored ? anchored.candidateIds.length > 0 ? "present" : "missing" : "none";
  const matchConflictStatus = dryRun?.anchoringResult?.status ?? input.gate?.decision ?? "none";
  const proposalReadiness = anchored?.reviewRequirement ?? "none";
  const handoffReadiness = anchored?.handoffReadiness ?? "none";

  return {
    reportId,
    runId: input.runId,
    mode: input.mode,
    providerSafeLabel,
    ...(input.case ? { caseId: input.case.caseId } : {}),
    providerCalled: dryRun?.providerCalled ?? false,
    ...(input.gate?.skipReason ? { skipReason: input.gate.skipReason } : {}),
    promptAuditStatus: dryRun?.promptAudit?.status ?? input.gate?.evidence.find((entry) => entry.startsWith("anchored-provider-smoke-gate:prompt-audit:"))?.split(":").at(-1) ?? "none",
    outputValidationStatus: dryRun?.outputValidation?.status ?? "none",
    anchorExtractionStatus,
    matchConflictStatus,
    anchorQuality: dryRun?.anchorQuality?.level ?? "none",
    proposalReadiness,
    handoffReadiness,
    noWriteStatus,
    failureClass,
    scorecardStatus: status,
    mutationAuthority: "not-granted",
    rawOutput: "excluded",
    evidence: [
      `proposal-quality-report:id:${reportId}`,
      `proposal-quality-report:run:${input.runId}`,
      `proposal-quality-report:mode:${input.mode}`,
      ...(input.case ? [`proposal-quality-report:case:${input.case.caseId}`] : []),
      `proposal-quality-report:provider:${providerSafeLabel}`,
      `proposal-quality-report:provider-called:${dryRun?.providerCalled ?? false}`,
      ...(input.gate?.skipReason ? [`proposal-quality-report:skip-reason:${input.gate.skipReason}`] : []),
      `proposal-quality-report:prompt-audit:${dryRun?.promptAudit?.status ?? "none"}`,
      `proposal-quality-report:output-validation:${dryRun?.outputValidation?.status ?? "none"}`,
      `proposal-quality-report:anchor-extraction:${anchorExtractionStatus}`,
      `proposal-quality-report:match-conflict:${matchConflictStatus}`,
      `proposal-quality-report:anchor-quality:${dryRun?.anchorQuality?.level ?? "none"}`,
      `proposal-quality-report:proposal-readiness:${proposalReadiness}`,
      `proposal-quality-report:handoff:${handoffReadiness}`,
      `proposal-quality-report:no-write:${noWriteStatus}`,
      `proposal-quality-report:failure-class:${failureClass}`,
      `proposal-quality-report:scorecard:${status}`,
      "proposal-quality-report:mutation-authority:not-granted",
      "proposal-quality-report:no-apply",
      "proposal-quality-report:raw-output-excluded",
    ],
  };
}

function scoreReport(input: {
  readonly gate?: AnchoredProviderSmokeGate;
  readonly dryRun?: RealProviderProposalDryRunResult;
  readonly noWriteStatus: ProposalQualityReportStatus;
  readonly expectedFailureClass?: string;
}): ProposalQualityReportStatus {
  if (input.noWriteStatus === "fail") return "fail";
  if (!input.dryRun) return input.gate?.decision.startsWith("skip-") ? "skip" : "fail";
  if (input.dryRun.status === "dry-run-exact-ready-no-write") return "pass";
  if (input.dryRun.status === "dry-run-review-required") return "warn";
  return input.expectedFailureClass === "smoke output invalid" ||
    input.expectedFailureClass === "smoke unsafe output" ||
    input.expectedFailureClass === "smoke anchoring failed"
    ? "fail"
    : "warn";
}

function classifyReportFailure(
  gate: AnchoredProviderSmokeGate | undefined,
  dryRun: RealProviderProposalDryRunResult | undefined,
): string {
  if (!dryRun) {
    switch (gate?.decision) {
      case "skip-no-opt-in":
        return "smoke no opt-in";
      case "skip-provider-not-configured":
      case "skip-provider-not-ready":
      case "skip-provider-unsupported":
        return "smoke provider unavailable";
      case "stop-prompt-audit-failed":
        return "smoke prompt audit failed";
      default:
        return gate?.decision ?? "smoke not run";
    }
  }
  if (dryRun.status === "dry-run-exact-ready-no-write") return "smoke exact-ready no-write";
  if (dryRun.status === "dry-run-review-required") return "smoke anchoring partial";
  if (dryRun.status === "dry-run-prompt-audit-failed") return "smoke prompt audit failed";
  if (dryRun.status === "dry-run-anchor-quality-low" || dryRun.anchorQuality?.level === "unsafe") {
    return "smoke unsafe output";
  }
  if (dryRun.status === "dry-run-provider-invalid-output") return "smoke output invalid";
  return "smoke anchoring failed";
}
