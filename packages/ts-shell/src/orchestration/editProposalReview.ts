import type { GeneratedEditProposalManifest } from "./generatedEditProposal.js";
import type { ProviderEditProposalManifest } from "./providerEditProposal.js";

export type EditProposalSource = "generated" | "provider";
export type EditProposalReviewStatus =
  | "review-required"
  | "ready-for-selection"
  | "unsupported-for-apply";
export type EditProposalTargetScope = "single" | "target-set" | "unknown";

export interface EditProposalReviewHunk {
  readonly hunkId: string;
  readonly targetLabel: string;
  readonly operationSummary: string;
  readonly exactMappingReady: boolean;
  readonly unsupportedReason?: string;
  readonly redactionStatus: "raw-content-excluded";
}

export interface EditProposalReview {
  readonly proposalId: string;
  readonly source: EditProposalSource;
  readonly targetScope: EditProposalTargetScope;
  readonly targetLabels: readonly string[];
  readonly operationSummary: string;
  readonly hunkSummaries: readonly EditProposalReviewHunk[];
  readonly exactMappingReadiness:
    | "missing"
    | "single-target-ready"
    | "target-set-ready"
    | "unsupported";
  readonly riskNotes: readonly string[];
  readonly verificationExpectation: "required-before-write";
  readonly snapshotRecoveryExpectation: "required-before-write";
  readonly redactionStatus: "raw-content-excluded";
  readonly reviewStatus: EditProposalReviewStatus;
  readonly evidence: readonly string[];
  readonly transcriptSummary: string;
}

export function buildGeneratedEditProposalReview(
  manifest: GeneratedEditProposalManifest,
): EditProposalReview {
  const targetLabels = manifest.targetLabels;
  const exactMappingReadiness =
    manifest.exactMappingStatus === "exact-single-target"
      ? "single-target-ready"
      : manifest.exactMappingStatus === "exact-target-set"
        ? "target-set-ready"
        : manifest.exactMappingStatus === "not-exact"
          ? "unsupported"
          : "missing";
  const reviewStatus =
    exactMappingReadiness === "unsupported"
      ? "unsupported-for-apply"
      : exactMappingReadiness === "missing"
        ? "review-required"
        : "ready-for-selection";
  return buildReview({
    proposalId: manifest.proposalId,
    source: "generated",
    targetLabels,
    operationSummary: manifest.safeSummary,
    exactMappingReadiness,
    reviewStatus,
    riskNotes: [
      "generated proposal review is not write authorization",
      "existing edit lanes own authority, stale-read, snapshot, and verification",
    ],
    hunkSummaries: targetLabels.map((targetLabel, index) => ({
      hunkId: `generated-hunk-${index + 1}`,
      targetLabel,
      operationSummary: `generated ${manifest.requestedOperationKind} proposal`,
      exactMappingReady:
        exactMappingReadiness === "single-target-ready" ||
        exactMappingReadiness === "target-set-ready",
      ...(reviewStatus === "unsupported-for-apply"
        ? { unsupportedReason: "generated proposal is not exact old/new mapping" }
        : {}),
      redactionStatus: "raw-content-excluded",
    })),
    evidence: manifest.evidence,
  });
}

export function buildProviderEditProposalReview(
  manifest: ProviderEditProposalManifest,
): EditProposalReview {
  const targetLabels = manifest.targets.map((target) => target.pathLabel);
  const exactMappingReadiness =
    manifest.handoffReadiness === "exact-single-target"
      ? "single-target-ready"
      : manifest.handoffReadiness === "exact-target-set"
        ? "target-set-ready"
        : manifest.handoffReadiness === "unsupported"
          ? "unsupported"
          : "missing";
  const reviewStatus =
    exactMappingReadiness === "unsupported"
      ? "unsupported-for-apply"
      : exactMappingReadiness === "missing"
        ? "review-required"
        : "ready-for-selection";
  return buildReview({
    proposalId: manifest.proposalId,
    source: "provider",
    targetLabels,
    operationSummary: manifest.safeSummary,
    exactMappingReadiness,
    reviewStatus,
    riskNotes: [
      manifest.riskSummary,
      "provider proposal review is not write authorization",
      "no provider call is made during proposal apply",
    ],
    hunkSummaries: manifest.targets.map((target, index) => ({
      hunkId: `provider-hunk-${index + 1}`,
      targetLabel: target.pathLabel,
      operationSummary: target.proposedSummary,
      exactMappingReady: target.exactOldNewReady,
      ...(target.exactOldNewReady
        ? {}
        : { unsupportedReason: "provider hunk is not exact old/new mapping" }),
      redactionStatus: "raw-content-excluded",
    })),
    evidence: manifest.evidence,
  });
}

export function formatEditProposalReviewForPrint(review: EditProposalReview): string {
  return [
    "Proposal review",
    `Proposal: ${review.proposalId}`,
    `Source: ${review.source}`,
    `Status: ${review.reviewStatus}`,
    `Targets: ${review.targetLabels.join(", ") || "(none)"}`,
    `Readiness: ${review.exactMappingReadiness}`,
    `Hunks: ${review.hunkSummaries.length}`,
    "Mutation: not run",
    "Raw content: excluded",
    review.reviewStatus === "ready-for-selection"
      ? "Next: select exact hunks and confirm before apply."
      : review.reviewStatus === "review-required"
        ? "Next: review proposal and provide exact mapping before apply."
        : "Next: unsupported hunks remain review-only.",
  ].join("\n");
}

function buildReview(input: {
  readonly proposalId: string;
  readonly source: EditProposalSource;
  readonly targetLabels: readonly string[];
  readonly operationSummary: string;
  readonly hunkSummaries: readonly EditProposalReviewHunk[];
  readonly exactMappingReadiness: EditProposalReview["exactMappingReadiness"];
  readonly reviewStatus: EditProposalReviewStatus;
  readonly riskNotes: readonly string[];
  readonly evidence: readonly string[];
}): EditProposalReview {
  const targetScope =
    input.targetLabels.length === 0
      ? "unknown"
      : input.targetLabels.length === 1
        ? "single"
        : "target-set";
  return {
    proposalId: input.proposalId,
    source: input.source,
    targetScope,
    targetLabels: input.targetLabels,
    operationSummary: input.operationSummary,
    hunkSummaries: input.hunkSummaries,
    exactMappingReadiness: input.exactMappingReadiness,
    riskNotes: input.riskNotes,
    verificationExpectation: "required-before-write",
    snapshotRecoveryExpectation: "required-before-write",
    redactionStatus: "raw-content-excluded",
    reviewStatus: input.reviewStatus,
    evidence: [
      ...input.evidence,
      `edit-proposal-review:source:${input.source}`,
      `edit-proposal-review:status:${input.reviewStatus}`,
      `edit-proposal-review:readiness:${input.exactMappingReadiness}`,
      "edit-proposal-review:mutation:not-run",
      "edit-proposal-review:raw-content-excluded",
    ],
    transcriptSummary: [
      `edit-proposal-review proposal=${input.proposalId}`,
      `source=${input.source}`,
      `status=${input.reviewStatus}`,
      `targets=${input.targetLabels.join(", ") || "(none)"}`,
      `readiness=${input.exactMappingReadiness}`,
      "mutation:not-run",
      "raw-content-excluded",
    ].join("; "),
  };
}
