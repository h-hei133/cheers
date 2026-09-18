import { hashContent } from "../edit/recovery/recoveryAuthorityStore.js";
import type { FencedEditMapping } from "./fencedEditPlanner.js";
import type { EditProposalReview } from "./editProposalReview.js";
import type { ProviderAnchorConflictResult } from "./providerAnchorConflict.js";
import type { ProviderAnchorMatchResult } from "./providerAnchorMatcher.js";
import type { ProviderProposalAnchorExtraction } from "./providerProposalAnchors.js";
import type { ProviderAnchorQuality } from "./providerAnchorQuality.js";

export interface ProviderAnchoredProposalHunk {
  readonly hunkId: string;
  readonly candidateId: string;
  readonly targetLabel: string;
  readonly operationSummary: string;
  readonly exactMappingReady: boolean;
  readonly matchCount: number;
  readonly unsupportedReason?: string;
  readonly redactionStatus: "raw-content-excluded";
}

export interface ProviderAnchoredProposalManifest {
  readonly anchoredProposalId: string;
  readonly sourceProviderProposalId?: string;
  readonly sourceDryRunId?: string;
  readonly sourceOutputValidationId: string;
  readonly extractionId: string;
  readonly matchResultId: string;
  readonly conflictId: string;
  readonly candidateIds: readonly string[];
  readonly exactHunkIds: readonly string[];
  readonly partialCandidateIds: readonly string[];
  readonly unsupportedCandidateIds: readonly string[];
  readonly hunks: readonly ProviderAnchoredProposalHunk[];
  readonly anchorQualityId: string;
  readonly anchorQualityLevel: ProviderAnchorQuality["level"];
  readonly planQualityId?: string;
  readonly reviewRequirement:
    | "explicit-review-and-confirmation"
    | "target-selection-required"
    | "context-refresh-required"
    | "review-only"
    | "blocked";
  readonly handoffReadiness: "exact-single-target" | "exact-hunk-set" | "review-only" | "blocked";
  readonly mutationAuthority: "not-granted";
  readonly redactionStatus: "raw-content-excluded";
  readonly safeSummary: string;
  readonly transcriptSummary: string;
  readonly evidence: readonly string[];
}

export function buildProviderAnchoredProposal(input: {
  readonly requestId: string;
  readonly extraction: ProviderProposalAnchorExtraction;
  readonly matchResult: ProviderAnchorMatchResult;
  readonly conflict: ProviderAnchorConflictResult;
  readonly anchorQuality: ProviderAnchorQuality;
  readonly planQualityId?: string;
}): ProviderAnchoredProposalManifest {
  const exactMatches = input.conflict.ok ? input.conflict.orderedExactMatches : [];
  const reviewOnlyMatches = input.matchResult.matches.filter(
    (match) => match.outcome === "single-candidate-needs-review",
  );
  const stoppedMatches = input.matchResult.matches.filter(
    (match) => match.outcome !== "exact-match" && match.outcome !== "single-candidate-needs-review",
  );
  const hunks: ProviderAnchoredProposalHunk[] = [
    ...exactMatches.map((match) => ({
      hunkId: `anchored-${match.candidateId}`,
      candidateId: match.candidateId,
      targetLabel: match.targetFileLabel!,
      operationSummary: "provider anchored exact old/new hunk",
      exactMappingReady: true,
      matchCount: match.matchCount,
      redactionStatus: "raw-content-excluded" as const,
    })),
    ...reviewOnlyMatches.map((match) => ({
      hunkId: `anchored-${match.candidateId}`,
      candidateId: match.candidateId,
      targetLabel: match.targetFileLabel ?? "(missing target)",
      operationSummary: "provider anchor candidate requires review",
      exactMappingReady: false,
      matchCount: match.matchCount,
      unsupportedReason: match.reason,
      redactionStatus: "raw-content-excluded" as const,
    })),
  ];
  const exactHunkIds = hunks
    .filter((hunk) => hunk.exactMappingReady)
    .map((hunk) => hunk.hunkId);
  const handoffReadiness = classifyHandoff({
    exactHunkCount: exactHunkIds.length,
    stoppedCount: stoppedMatches.length,
    conflictOk: input.conflict.ok,
  });
  const reviewRequirement = classifyReviewRequirement({
    conflict: input.conflict,
    matchResult: input.matchResult,
    handoffReadiness,
  });
  const anchoredProposalId = buildAnchoredProposalId({
    requestId: input.requestId,
    extractionId: input.extraction.extractionId,
    matchResultId: input.matchResult.matchResultId,
    conflictId: input.conflict.conflictId,
    exactHunkIds,
    partialCandidateIds: input.extraction.partialCandidateIds,
    unsupportedCandidateIds: input.extraction.unsupportedCandidateIds,
  });
  const safeSummary = [
    `provider anchored proposal ${anchoredProposalId}`,
    input.extraction.sourceProposalId ? `sourceProposal=${input.extraction.sourceProposalId}` : undefined,
    input.extraction.sourceDryRunId ? `dryRun=${input.extraction.sourceDryRunId}` : undefined,
    `candidates=${input.extraction.candidates.length}`,
    `exact=${exactHunkIds.length}`,
    `partial=${input.extraction.partialCandidateIds.length}`,
    `unsupported=${input.extraction.unsupportedCandidateIds.length + stoppedMatches.length}`,
    `anchorQuality=${input.anchorQuality.level}`,
    `handoff=${handoffReadiness}`,
    `review=${reviewRequirement}`,
    "mutationAuthority=not-granted",
    "raw-content-excluded",
  ].filter(Boolean).join("; ");

  return {
    anchoredProposalId,
    ...(input.extraction.sourceProposalId ? { sourceProviderProposalId: input.extraction.sourceProposalId } : {}),
    ...(input.extraction.sourceDryRunId ? { sourceDryRunId: input.extraction.sourceDryRunId } : {}),
    sourceOutputValidationId: input.extraction.sourceOutputValidationId,
    extractionId: input.extraction.extractionId,
    matchResultId: input.matchResult.matchResultId,
    conflictId: input.conflict.conflictId,
    candidateIds: input.extraction.candidates.map((candidate) => candidate.candidateId),
    exactHunkIds,
    partialCandidateIds: input.extraction.partialCandidateIds,
    unsupportedCandidateIds: [
      ...input.extraction.unsupportedCandidateIds,
      ...stoppedMatches.map((match) => match.candidateId),
    ],
    hunks,
    anchorQualityId: input.anchorQuality.qualityId,
    anchorQualityLevel: input.anchorQuality.level,
    ...(input.planQualityId ? { planQualityId: input.planQualityId } : {}),
    reviewRequirement,
    handoffReadiness,
    mutationAuthority: "not-granted",
    redactionStatus: "raw-content-excluded",
    safeSummary,
    transcriptSummary: [
      `provider-anchored-proposal id=${anchoredProposalId}`,
      `hunks=${exactHunkIds.length}`,
      `review=${reviewRequirement}`,
      `handoff=${handoffReadiness}`,
      `anchorQuality=${input.anchorQuality.level}`,
      "mutation:not-run",
      "mutationAuthority:not-granted",
      "raw-content-excluded",
    ].join("; "),
    evidence: [
      `provider-anchored-proposal:id:${anchoredProposalId}`,
      `provider-anchored-proposal:extraction:${input.extraction.extractionId}`,
      `provider-anchored-proposal:match:${input.matchResult.matchResultId}`,
      `provider-anchored-proposal:conflict:${input.conflict.conflictId}`,
      ...(input.extraction.sourceDryRunId ? [`provider-anchored-proposal:dry-run:${input.extraction.sourceDryRunId}`] : []),
      ...(input.planQualityId ? [`provider-anchored-proposal:plan-quality:${input.planQualityId}`] : []),
      `provider-anchored-proposal:anchor-quality:${input.anchorQuality.qualityId}`,
      `provider-anchored-proposal:anchor-quality-level:${input.anchorQuality.level}`,
      `provider-anchored-proposal:exact-hunks:${exactHunkIds.length}`,
      `provider-anchored-proposal:partial:${input.extraction.partialCandidateIds.length}`,
      `provider-anchored-proposal:unsupported:${input.extraction.unsupportedCandidateIds.length + stoppedMatches.length}`,
      `provider-anchored-proposal:review:${reviewRequirement}`,
      `provider-anchored-proposal:handoff:${handoffReadiness}`,
      "provider-anchored-proposal:mutation-authority:not-granted",
      "provider-anchored-proposal:raw-content-excluded",
      ...input.extraction.evidence,
      ...input.matchResult.evidence,
      ...input.conflict.evidence,
    ],
  };
}

export function buildAnchoredProviderProposalReview(
  manifest: ProviderAnchoredProposalManifest,
): EditProposalReview {
  const targetLabels = Array.from(new Set(manifest.hunks.map((hunk) => hunk.targetLabel)));
  const exactMappingReadiness =
    manifest.handoffReadiness === "exact-single-target"
      ? "single-target-ready"
      : manifest.handoffReadiness === "exact-hunk-set"
        ? "target-set-ready"
        : manifest.handoffReadiness === "blocked"
          ? "unsupported"
          : "missing";
  const reviewStatus =
    exactMappingReadiness === "unsupported"
      ? "unsupported-for-apply"
      : exactMappingReadiness === "missing"
        ? "review-required"
        : "ready-for-selection";
  return {
    proposalId: manifest.anchoredProposalId,
    source: "provider",
    targetScope:
      targetLabels.length === 0 ? "unknown" : targetLabels.length === 1 ? "single" : "target-set",
    targetLabels,
    operationSummary: manifest.safeSummary,
    hunkSummaries: manifest.hunks.map((hunk) => ({
      hunkId: hunk.hunkId,
      targetLabel: hunk.targetLabel,
      operationSummary: hunk.operationSummary,
      exactMappingReady: hunk.exactMappingReady,
      ...(hunk.unsupportedReason ? { unsupportedReason: hunk.unsupportedReason } : {}),
      redactionStatus: "raw-content-excluded",
    })),
    exactMappingReadiness,
    riskNotes: [
      "anchored provider proposal review is not write authorization",
      "apply must reuse existing proposal apply paths after explicit confirmation",
      "no provider call is made during proposal apply",
    ],
    verificationExpectation: "required-before-write",
    snapshotRecoveryExpectation: "required-before-write",
    redactionStatus: "raw-content-excluded",
    reviewStatus,
    evidence: [
      ...manifest.evidence,
      `edit-proposal-review:source:provider`,
      `edit-proposal-review:status:${reviewStatus}`,
      `edit-proposal-review:readiness:${exactMappingReadiness}`,
      "edit-proposal-review:anchored-provider-proposal",
      "edit-proposal-review:mutation:not-run",
      "edit-proposal-review:raw-content-excluded",
    ],
    transcriptSummary: [
      `edit-proposal-review proposal=${manifest.anchoredProposalId}`,
      "source=provider",
      `status=${reviewStatus}`,
      `targets=${targetLabels.join(", ") || "(none)"}`,
      `readiness=${exactMappingReadiness}`,
      "anchoredProvider=true",
      "mutation:not-run",
      "raw-content-excluded",
    ].join("; "),
  };
}

export function buildAnchoredProposalMappingByHunkId(input: {
  readonly manifest: ProviderAnchoredProposalManifest;
  readonly matchResult: ProviderAnchorMatchResult;
}): ReadonlyMap<string, FencedEditMapping> {
  const mapping = new Map<string, FencedEditMapping>();
  for (const hunk of input.manifest.hunks) {
    if (!hunk.exactMappingReady) continue;
    const match = input.matchResult.matches.find((candidate) => candidate.candidateId === hunk.candidateId);
    if (match?.mapping) {
      mapping.set(hunk.hunkId, match.mapping);
    }
  }
  return mapping;
}

function classifyHandoff(input: {
  readonly exactHunkCount: number;
  readonly stoppedCount: number;
  readonly conflictOk: boolean;
}): ProviderAnchoredProposalManifest["handoffReadiness"] {
  if (!input.conflictOk || input.stoppedCount > 0) return "blocked";
  if (input.exactHunkCount === 0) return "review-only";
  return input.exactHunkCount === 1 ? "exact-single-target" : "exact-hunk-set";
}

function classifyReviewRequirement(input: {
  readonly conflict: ProviderAnchorConflictResult;
  readonly matchResult: ProviderAnchorMatchResult;
  readonly handoffReadiness: ProviderAnchoredProposalManifest["handoffReadiness"];
}): ProviderAnchoredProposalManifest["reviewRequirement"] {
  if (!input.conflict.ok) {
    return input.conflict.kind === "stale-match-facts" ? "context-refresh-required" : "blocked";
  }
  if (input.matchResult.outcome === "stale-context") return "context-refresh-required";
  if (input.matchResult.outcome === "multiple-candidates-ambiguous" || input.matchResult.outcome === "target-missing") {
    return "target-selection-required";
  }
  if (input.handoffReadiness === "exact-single-target" || input.handoffReadiness === "exact-hunk-set") {
    return "explicit-review-and-confirmation";
  }
  return input.handoffReadiness === "blocked" ? "blocked" : "review-only";
}

function buildAnchoredProposalId(input: object): string {
  return `provider-anchored-${hashContent(JSON.stringify(input)).slice(0, 12)}`;
}
