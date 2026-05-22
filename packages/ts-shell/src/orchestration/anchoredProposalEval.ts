import type { AnchoredProposalActivation } from "./anchoredProposalActivation.js";
import type { RealProviderProposalDryRunResult } from "./realProviderProposalDryRun.js";

export type AnchoredProposalEvalGrade = "pass" | "warn" | "fail" | "skip";

export interface AnchoredProposalEval {
  readonly evalId: string;
  readonly activationId?: string;
  readonly dryRunId?: string;
  readonly lifecycleReadiness: AnchoredProposalEvalGrade;
  readonly contextSufficiency: AnchoredProposalEvalGrade;
  readonly analysisQuality: AnchoredProposalEvalGrade;
  readonly planQuality: AnchoredProposalEvalGrade;
  readonly promptAudit: AnchoredProposalEvalGrade;
  readonly outputValidity: AnchoredProposalEvalGrade;
  readonly anchorExtraction: AnchoredProposalEvalGrade;
  readonly anchorMatchQuality: AnchoredProposalEvalGrade;
  readonly conflictStatus: AnchoredProposalEvalGrade;
  readonly reviewReadiness: AnchoredProposalEvalGrade;
  readonly handoffReadiness: AnchoredProposalEvalGrade;
  readonly noWriteCompliance: AnchoredProposalEvalGrade;
  readonly overall: AnchoredProposalEvalGrade;
  readonly mutationAuthority: "not-granted";
  readonly replaySafeSummary: string;
  readonly evidence: readonly string[];
}

export function evaluateAnchoredProposal(input: {
  readonly activation?: AnchoredProposalActivation;
  readonly dryRun?: RealProviderProposalDryRunResult;
}): AnchoredProposalEval {
  const activation = input.activation;
  const dryRun = input.dryRun;
  const lifecycleReadiness = activation?.taskLifecycleId ? "pass" : "fail";
  const contextSufficiency = activation?.contextPacketId && activation.contextGraphId && activation.codeGraphTraceId
    ? "pass"
    : "warn";
  const analysisQuality = activation?.decision === "stop-low-analysis-quality"
    ? "fail"
    : activation?.analysisBriefId && activation.analysisQualityId ? "pass" : "fail";
  const planQuality = activation?.decision === "stop-low-plan-quality"
    ? "fail"
    : activation?.planQualityId ? "pass" : "fail";
  const promptAudit = dryRun?.promptAudit ? (dryRun.promptAudit.status === "pass" ? "pass" : "fail") : "skip";
  const outputValidity = scoreOutput(dryRun?.outputValidation?.status);
  const anchorExtraction = dryRun?.anchoredProposal
    ? dryRun.anchoredProposal.candidateIds.length > 0 ? "pass" : "fail"
    : dryRun ? "fail" : "skip";
  const anchorMatchQuality = scoreMatch(dryRun?.anchoringResult?.status);
  const conflictStatus = dryRun?.anchoringResult?.status === "stale-context-blocks-anchoring"
    ? "fail"
    : dryRun?.anchoringResult?.status === "ambiguous-anchors-need-target-selection"
      ? "warn"
      : dryRun ? "pass" : "skip";
  const reviewReadiness = scoreReview(dryRun);
  const handoffReadiness = scoreHandoff(dryRun);
  const noWriteCompliance = dryRun
    ? dryRun.mutation === "not-run" && dryRun.mutationAuthority === "not-granted" && dryRun.changedFiles.length === 0
      ? "pass"
      : "fail"
    : activation?.mutationAuthority === "not-granted" ? "pass" : "skip";
  const grades = [
    lifecycleReadiness,
    contextSufficiency,
    analysisQuality,
    planQuality,
    promptAudit,
    outputValidity,
    anchorExtraction,
    anchorMatchQuality,
    conflictStatus,
    reviewReadiness,
    handoffReadiness,
    noWriteCompliance,
  ];
  const overall = grades.includes("fail") ? "fail" : grades.includes("warn") ? "warn" : "pass";
  const evalId = [
    "anchored_proposal_eval",
    activation?.activationId ?? "no-activation",
    dryRun?.dryRunId ?? "no-dry-run",
    overall,
  ].join("_").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 128);
  const replaySafeSummary = [
    `anchored-proposal-eval ${evalId}`,
    activation ? `activation=${activation.activationId}` : undefined,
    dryRun ? `dryRun=${dryRun.dryRunId}` : undefined,
    `overall=${overall}`,
    `promptAudit=${promptAudit}`,
    `output=${outputValidity}`,
    `anchoring=${anchorMatchQuality}`,
    `review=${reviewReadiness}`,
    `handoff=${handoffReadiness}`,
    `noWrite=${noWriteCompliance}`,
    "mutationAuthority=not-granted",
    "raw-content-excluded",
  ].filter(Boolean).join("; ");

  return {
    evalId,
    ...(activation ? { activationId: activation.activationId } : {}),
    ...(dryRun ? { dryRunId: dryRun.dryRunId } : {}),
    lifecycleReadiness,
    contextSufficiency,
    analysisQuality,
    planQuality,
    promptAudit,
    outputValidity,
    anchorExtraction,
    anchorMatchQuality,
    conflictStatus,
    reviewReadiness,
    handoffReadiness,
    noWriteCompliance,
    overall,
    mutationAuthority: "not-granted",
    replaySafeSummary,
    evidence: [
      `anchored-proposal-eval:id:${evalId}`,
      ...(activation ? [`anchored-proposal-eval:activation:${activation.activationId}`] : []),
      ...(dryRun ? [`anchored-proposal-eval:dry-run:${dryRun.dryRunId}`] : []),
      `anchored-proposal-eval:overall:${overall}`,
      `anchored-proposal-eval:lifecycle:${lifecycleReadiness}`,
      `anchored-proposal-eval:context:${contextSufficiency}`,
      `anchored-proposal-eval:analysis:${analysisQuality}`,
      `anchored-proposal-eval:plan:${planQuality}`,
      `anchored-proposal-eval:prompt-audit:${promptAudit}`,
      `anchored-proposal-eval:output:${outputValidity}`,
      `anchored-proposal-eval:anchor-extraction:${anchorExtraction}`,
      `anchored-proposal-eval:anchor-match:${anchorMatchQuality}`,
      `anchored-proposal-eval:conflict:${conflictStatus}`,
      `anchored-proposal-eval:review:${reviewReadiness}`,
      `anchored-proposal-eval:handoff:${handoffReadiness}`,
      `anchored-proposal-eval:no-write:${noWriteCompliance}`,
      "anchored-proposal-eval:mutation-authority:not-granted",
      "anchored-proposal-eval:raw-content-excluded",
    ],
  };
}

function scoreOutput(status: string | undefined): AnchoredProposalEvalGrade {
  if (!status) return "skip";
  if (status === "valid-exact-single-target" || status === "valid-exact-hunk-set") return "pass";
  if (status === "partial-anchor" || status === "unanchored-generated") return "warn";
  return "fail";
}

function scoreMatch(status: string | undefined): AnchoredProposalEvalGrade {
  if (!status) return "skip";
  if (status === "anchored-proposal-handoff-ready" || status === "exact-anchors-ready-for-review") return "pass";
  if (
    status === "partial-anchors-review-only" ||
    status === "ambiguous-anchors-need-target-selection" ||
    status === "stale-context-blocks-anchoring"
  ) return "warn";
  return "fail";
}

function scoreReview(dryRun: RealProviderProposalDryRunResult | undefined): AnchoredProposalEvalGrade {
  if (!dryRun?.anchoredProposal) return dryRun ? "fail" : "skip";
  return dryRun.anchoredProposal.reviewRequirement === "explicit-review-and-confirmation" ||
    dryRun.anchoredProposal.reviewRequirement === "review-only"
    ? "pass"
    : "warn";
}

function scoreHandoff(dryRun: RealProviderProposalDryRunResult | undefined): AnchoredProposalEvalGrade {
  if (!dryRun?.anchoredProposal) return dryRun ? "fail" : "skip";
  return dryRun.anchoredProposal.handoffReadiness === "exact-single-target" ||
    dryRun.anchoredProposal.handoffReadiness === "exact-hunk-set"
    ? "pass"
    : dryRun.anchoredProposal.handoffReadiness === "review-only" ? "warn" : "fail";
}
