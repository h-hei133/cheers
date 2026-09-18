import { safeTargetLabel } from "../../orchestration/workspaceFileContract.js";
import {
  buildProviderAnchorCandidate,
  type ProviderAnchorCandidate,
} from "./providerAnchorCandidate.js";
import type { ProviderEditRawProposal } from "./providerEditProposal.js";
import type { ProviderOutputValidation } from "./providerOutputValidator.js";

export interface ProviderProposalAnchorExtraction {
  readonly extractionId: string;
  readonly sourceProposalId?: string;
  readonly sourceDryRunId?: string;
  readonly sourceOutputValidationId: string;
  readonly status:
    | "exact-candidates"
    | "partial-candidates"
    | "review-only-unanchored"
    | "unsupported-output"
    | "unsafe-output"
    | "malformed-output"
    | "empty-output";
  readonly candidates: readonly ProviderAnchorCandidate[];
  readonly exactCandidateIds: readonly string[];
  readonly partialCandidateIds: readonly string[];
  readonly unsupportedCandidateIds: readonly string[];
  readonly noWrite: true;
  readonly mutationAuthority: "not-granted";
  readonly redactionStatus: "raw-content-excluded";
  readonly reason: string;
  readonly nextAction: string;
  readonly evidence: readonly string[];
}

export function extractProviderProposalAnchors(input: {
  readonly requestId: string;
  readonly rawOutput?: ProviderEditRawProposal | null;
  readonly validation: ProviderOutputValidation;
  readonly sourceProposalId?: string;
  readonly sourceDryRunId?: string;
  readonly explicitTargetEvidenceIds?: ReadonlyMap<string, readonly string[]>;
}): ProviderProposalAnchorExtraction {
  const rawOutput = input.rawOutput;
  const targets = rawOutput?.targets ?? [];
  const candidates = targets.map((target, index) =>
    buildProviderAnchorCandidate({
      requestId: input.requestId,
      index,
      sourceProposalId: input.sourceProposalId,
      sourceDryRunId: input.sourceDryRunId,
      sourceOutputValidationId: input.validation.validationId,
      sourceOutputStatus: input.validation.status,
      targetFileLabel: target.path ? safeTargetLabel(target.path) : undefined,
      targetEvidenceIds: target.path
        ? input.explicitTargetEvidenceIds?.get(safeTargetLabel(target.path))
        : undefined,
      proposedOperationKind: rawOutput?.operationKind ?? "generated-replacement",
      proposedSummary: target.summary,
      oldText: target.oldText,
      newText: target.newText,
      confidence: rawOutput?.confidence,
    }),
  );

  const status = classifyExtractionStatus(input.validation, candidates);
  const exactCandidateIds = candidates
    .filter((candidate) => candidate.exactness === "exact")
    .map((candidate) => candidate.candidateId);
  const partialCandidateIds = candidates
    .filter((candidate) => candidate.exactness === "partial" || candidate.exactness === "unanchored")
    .map((candidate) => candidate.candidateId);
  const unsupportedCandidateIds = candidates
    .filter((candidate) => candidate.exactness === "unsupported" || candidate.exactness === "unsafe")
    .map((candidate) => candidate.candidateId);
  const extractionId = [
    "provider_anchor_extraction",
    input.requestId,
    input.validation.validationId,
    status,
    candidates.length,
  ].join("_").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 128);

  return {
    extractionId,
    ...(input.sourceProposalId ? { sourceProposalId: input.sourceProposalId } : {}),
    ...(input.sourceDryRunId ? { sourceDryRunId: input.sourceDryRunId } : {}),
    sourceOutputValidationId: input.validation.validationId,
    status,
    candidates,
    exactCandidateIds,
    partialCandidateIds,
    unsupportedCandidateIds,
    noWrite: true,
    mutationAuthority: "not-granted",
    redactionStatus: "raw-content-excluded",
    reason: describeStatus(status),
    nextAction: nextAction(status),
    evidence: [
      `provider-anchor-extraction:id:${extractionId}`,
      `provider-anchor-extraction:status:${status}`,
      `provider-anchor-extraction:source-validation:${input.validation.validationId}`,
      `provider-anchor-extraction:candidates:${candidates.length}`,
      `provider-anchor-extraction:exact:${exactCandidateIds.length}`,
      `provider-anchor-extraction:partial:${partialCandidateIds.length}`,
      `provider-anchor-extraction:unsupported:${unsupportedCandidateIds.length}`,
      "provider-anchor-extraction:mutation:not-run",
      "provider-anchor-extraction:mutation-authority:not-granted",
      "provider-anchor-extraction:raw-content-excluded",
      ...candidates.flatMap((candidate) => candidate.evidence),
    ],
  };
}

function classifyExtractionStatus(
  validation: ProviderOutputValidation,
  candidates: readonly ProviderAnchorCandidate[],
): ProviderProposalAnchorExtraction["status"] {
  switch (validation.status) {
    case "valid-exact-single-target":
    case "valid-exact-hunk-set":
      return "exact-candidates";
    case "partial-anchor":
      return "partial-candidates";
    case "unanchored-generated":
      return "review-only-unanchored";
    case "unsafe-output":
      return "unsafe-output";
    case "malformed-output":
      return "malformed-output";
    case "empty-output":
      return "empty-output";
    default:
      return candidates.length ? "unsupported-output" : "empty-output";
  }
}

function describeStatus(status: ProviderProposalAnchorExtraction["status"]): string {
  switch (status) {
    case "exact-candidates":
      return "Provider output produced exact anchor candidates that still require current-content matching.";
    case "partial-candidates":
      return "Provider output produced partial review-only anchor candidates.";
    case "review-only-unanchored":
      return "Provider output was unanchored and remains review-only.";
    case "unsafe-output":
      return "Provider output was unsafe and cannot be anchored.";
    case "malformed-output":
      return "Provider output was malformed and cannot be anchored.";
    case "unsupported-output":
      return "Provider output shape is unsupported for anchoring.";
    case "empty-output":
      return "Provider output did not produce anchor candidates.";
  }
}

function nextAction(status: ProviderProposalAnchorExtraction["status"]): string {
  switch (status) {
    case "exact-candidates":
      return "Match candidates against current safe reads before review handoff.";
    case "partial-candidates":
      return "Review partial anchors or request exact old/new anchors.";
    case "review-only-unanchored":
      return "Select explicit targets and request bounded old/new anchors.";
    case "unsafe-output":
      return "Discard unsafe provider output and retry with safety constraints.";
    case "malformed-output":
    case "unsupported-output":
    case "empty-output":
      return "Request a bounded target-bound proposal in the supported shape.";
  }
}
