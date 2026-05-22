import type { AnchoredProposalActivation } from "./anchoredProposalActivation.js";
import type { AnchoredProposalEval } from "./anchoredProposalEval.js";
import type { RealProviderProposalDryRunResult } from "./realProviderProposalDryRun.js";

export interface AnchoredProposalScorecard {
  readonly scorecardId: string;
  readonly activationId?: string;
  readonly proposalId?: string;
  readonly anchoredProposalId?: string;
  readonly dryRunId?: string;
  readonly promptAuditId?: string;
  readonly outputValidationId?: string;
  readonly anchorQualityId?: string;
  readonly exactCount: number;
  readonly partialCount: number;
  readonly unsupportedCount: number;
  readonly failureClass: string;
  readonly nextAction: string;
  readonly noWriteStatus: "pass" | "fail";
  readonly mutationAuthority: "not-granted";
  readonly replaySafeSummary: string;
  readonly evidence: readonly string[];
}

export function buildAnchoredProposalScorecard(input: {
  readonly activation?: AnchoredProposalActivation;
  readonly dryRun?: RealProviderProposalDryRunResult;
  readonly evalResult?: AnchoredProposalEval;
  readonly failureClass?: string;
}): AnchoredProposalScorecard {
  const manifest = input.dryRun && "manifest" in input.dryRun ? input.dryRun.manifest : undefined;
  const anchored = input.dryRun?.anchoredProposal;
  const noWriteStatus =
    input.dryRun && (input.dryRun.changedFiles.length > 0 || input.dryRun.mutation !== "not-run")
      ? "fail"
      : "pass";
  const failureClass = input.failureClass ?? classifyFailure(input.dryRun?.status, input.dryRun?.anchoringResult?.status);
  const scorecardId = [
    "anchored_proposal_scorecard",
    input.activation?.activationId ?? "no-activation",
    input.dryRun?.dryRunId ?? "no-dry-run",
    input.evalResult?.overall ?? "no-eval",
  ].join("_").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 128);
  const nextAction = input.dryRun?.nextAction ?? input.activation?.nextAction ?? "Activate anchored proposal runtime first.";
  const replaySafeSummary = [
    `anchored-proposal-scorecard ${scorecardId}`,
    manifest ? `proposal=${manifest.proposalId}` : undefined,
    anchored ? `anchoredProposal=${anchored.anchoredProposalId}` : undefined,
    input.dryRun ? `dryRun=${input.dryRun.dryRunId}` : undefined,
    input.dryRun?.promptAudit ? `promptAudit=${input.dryRun.promptAudit.auditId}` : undefined,
    input.dryRun?.outputValidation ? `outputValidation=${input.dryRun.outputValidation.validationId}` : undefined,
    input.dryRun?.anchorQuality ? `anchorQuality=${input.dryRun.anchorQuality.qualityId}` : undefined,
    `exact=${anchored?.exactHunkIds.length ?? 0}`,
    `partial=${anchored?.partialCandidateIds.length ?? 0}`,
    `unsupported=${anchored?.unsupportedCandidateIds.length ?? 0}`,
    `failureClass=${failureClass}`,
    `noWrite=${noWriteStatus}`,
    "mutationAuthority=not-granted",
    "raw-content-excluded",
  ].filter(Boolean).join("; ");

  return {
    scorecardId,
    ...(input.activation ? { activationId: input.activation.activationId } : {}),
    ...(manifest ? { proposalId: manifest.proposalId } : {}),
    ...(anchored ? { anchoredProposalId: anchored.anchoredProposalId } : {}),
    ...(input.dryRun ? { dryRunId: input.dryRun.dryRunId } : {}),
    ...(input.dryRun?.promptAudit ? { promptAuditId: input.dryRun.promptAudit.auditId } : {}),
    ...(input.dryRun?.outputValidation ? { outputValidationId: input.dryRun.outputValidation.validationId } : {}),
    ...(input.dryRun?.anchorQuality ? { anchorQualityId: input.dryRun.anchorQuality.qualityId } : {}),
    exactCount: anchored?.exactHunkIds.length ?? 0,
    partialCount: anchored?.partialCandidateIds.length ?? 0,
    unsupportedCount: anchored?.unsupportedCandidateIds.length ?? 0,
    failureClass,
    nextAction,
    noWriteStatus,
    mutationAuthority: "not-granted",
    replaySafeSummary,
    evidence: [
      `anchored-proposal-scorecard:id:${scorecardId}`,
      ...(input.activation ? [`anchored-proposal-scorecard:activation:${input.activation.activationId}`] : []),
      ...(manifest ? [`anchored-proposal-scorecard:proposal:${manifest.proposalId}`] : []),
      ...(anchored ? [`anchored-proposal-scorecard:anchored-proposal:${anchored.anchoredProposalId}`] : []),
      ...(input.dryRun ? [`anchored-proposal-scorecard:dry-run:${input.dryRun.dryRunId}`] : []),
      ...(input.dryRun?.promptAudit ? [`anchored-proposal-scorecard:prompt-audit:${input.dryRun.promptAudit.auditId}`] : []),
      ...(input.dryRun?.outputValidation ? [`anchored-proposal-scorecard:output-validation:${input.dryRun.outputValidation.validationId}`] : []),
      ...(input.dryRun?.anchorQuality ? [`anchored-proposal-scorecard:anchor-quality:${input.dryRun.anchorQuality.qualityId}`] : []),
      `anchored-proposal-scorecard:exact:${anchored?.exactHunkIds.length ?? 0}`,
      `anchored-proposal-scorecard:partial:${anchored?.partialCandidateIds.length ?? 0}`,
      `anchored-proposal-scorecard:unsupported:${anchored?.unsupportedCandidateIds.length ?? 0}`,
      `anchored-proposal-scorecard:failure-class:${failureClass}`,
      `anchored-proposal-scorecard:no-write:${noWriteStatus}`,
      "anchored-proposal-scorecard:mutation-authority:not-granted",
      "anchored-proposal-scorecard:raw-content-excluded",
      replaySafeSummary,
    ],
  };
}

function classifyFailure(
  status: RealProviderProposalDryRunResult["status"] | undefined,
  anchoringStatus: string | undefined,
): string {
  if (!status) return "anchored-proposal-not-run";
  if (status === "dry-run-exact-ready-no-write" || status === "dry-run-review-required") return "none";
  if (anchoringStatus === "ambiguous-anchors-need-target-selection") return "provider-anchor-ambiguous";
  if (anchoringStatus === "stale-context-blocks-anchoring") return "provider-anchor-stale-context";
  if (anchoringStatus === "unsupported-fuzzy-or-broad-output") return "provider-anchor-unsupported-fuzzy-output";
  if (status === "dry-run-prompt-audit-failed") return "provider-prompt-audit-failed";
  if (status === "dry-run-provider-invalid-output") return "provider-output-invalid";
  if (status === "dry-run-anchor-quality-low") return "provider-anchor-quality-low";
  return status;
}
