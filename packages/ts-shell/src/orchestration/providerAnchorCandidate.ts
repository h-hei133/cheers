import { hashContent } from "./patchRecovery/recoveryAuthorityStore.js";
import { redactProviderEditText } from "./providerEditContext.js";
import type { ProviderEditOperationKind } from "./providerEditProposal.js";
import type { FencedEditMapping } from "./fencedEditPlanner.js";
import type { ProviderOutputValidationStatus } from "./providerOutputValidator.js";

export type ProviderAnchorOldStatus = "exact" | "partial" | "missing";
export type ProviderAnchorNewStatus = "bounded" | "missing" | "unsafe";
export type ProviderAnchorExactness = "exact" | "partial" | "unanchored" | "unsupported" | "unsafe";
export type ProviderAnchorAmbiguity = "none" | "needs-target" | "needs-current-read" | "multiple-candidates" | "unsupported";

export interface ProviderAnchorCandidate {
  readonly candidateId: string;
  readonly sourceProposalId?: string;
  readonly sourceDryRunId?: string;
  readonly sourceOutputValidationId: string;
  readonly sourceOutputStatus: ProviderOutputValidationStatus;
  readonly targetFileLabel?: string;
  readonly targetEvidenceIds: readonly string[];
  readonly proposedOperationKind: ProviderEditOperationKind;
  readonly proposedSummary: string;
  readonly oldAnchorStatus: ProviderAnchorOldStatus;
  readonly newContentStatus: ProviderAnchorNewStatus;
  readonly exactness: ProviderAnchorExactness;
  readonly confidence: "low" | "medium" | "high";
  readonly ambiguity: ProviderAnchorAmbiguity;
  readonly unsupportedReason?: string;
  readonly redactionStatus: "raw-content-excluded";
  readonly mutationAuthority: "not-granted";
  readonly mapping?: FencedEditMapping;
  readonly oldTextHash?: string;
  readonly newTextHash?: string;
  readonly evidence: readonly string[];
}

export function buildProviderAnchorCandidate(input: {
  readonly requestId: string;
  readonly index: number;
  readonly sourceProposalId?: string;
  readonly sourceDryRunId?: string;
  readonly sourceOutputValidationId: string;
  readonly sourceOutputStatus: ProviderOutputValidationStatus;
  readonly targetFileLabel?: string;
  readonly targetEvidenceIds?: readonly string[];
  readonly proposedOperationKind: ProviderEditOperationKind;
  readonly proposedSummary?: string;
  readonly oldText?: string;
  readonly newText?: string;
  readonly confidence?: "low" | "medium" | "high";
  readonly unsupportedReason?: string;
}): ProviderAnchorCandidate {
  const hasOld = Boolean(input.oldText);
  const hasNew = typeof input.newText === "string" && input.newText.length > 0;
  const unsupportedReason = input.unsupportedReason ?? classifyUnsupportedReason(input.sourceOutputStatus);
  const oldAnchorStatus: ProviderAnchorOldStatus = hasOld ? "exact" : input.targetFileLabel ? "partial" : "missing";
  const newContentStatus: ProviderAnchorNewStatus =
    input.sourceOutputStatus === "unsafe-output" ? "unsafe" : hasNew ? "bounded" : "missing";
  const exactness: ProviderAnchorExactness =
    input.sourceOutputStatus === "unsafe-output"
      ? "unsafe"
      : unsupportedReason
        ? "unsupported"
        : hasOld && hasNew && input.targetFileLabel
          ? "exact"
          : input.targetFileLabel
            ? "partial"
            : "unanchored";
  const ambiguity: ProviderAnchorAmbiguity =
    exactness === "exact"
      ? "needs-current-read"
      : exactness === "partial"
        ? "needs-current-read"
        : exactness === "unanchored"
          ? "needs-target"
          : "unsupported";
  const candidateId = buildCandidateId({
    requestId: input.requestId,
    index: input.index,
    targetFileLabel: input.targetFileLabel,
    sourceOutputValidationId: input.sourceOutputValidationId,
    oldText: input.oldText,
    newText: input.newText,
    unsupportedReason,
  });
  const mapping =
    hasOld && hasNew
      ? {
          oldText: input.oldText!,
          newText: input.newText!,
          source: "old-new-fenced-blocks" as const,
        }
      : undefined;

  return {
    candidateId,
    ...(input.sourceProposalId ? { sourceProposalId: input.sourceProposalId } : {}),
    ...(input.sourceDryRunId ? { sourceDryRunId: input.sourceDryRunId } : {}),
    sourceOutputValidationId: input.sourceOutputValidationId,
    sourceOutputStatus: input.sourceOutputStatus,
    ...(input.targetFileLabel ? { targetFileLabel: input.targetFileLabel } : {}),
    targetEvidenceIds: input.targetEvidenceIds ?? [],
    proposedOperationKind: input.proposedOperationKind,
    proposedSummary: redactProviderEditText(input.proposedSummary ?? "provider proposed anchor candidate"),
    oldAnchorStatus,
    newContentStatus,
    exactness,
    confidence: input.confidence ?? (exactness === "exact" ? "high" : exactness === "partial" ? "medium" : "low"),
    ambiguity,
    ...(unsupportedReason ? { unsupportedReason } : {}),
    redactionStatus: "raw-content-excluded",
    mutationAuthority: "not-granted",
    ...(mapping ? { mapping } : {}),
    ...(input.oldText ? { oldTextHash: hashContent(input.oldText).slice(0, 16) } : {}),
    ...(input.newText ? { newTextHash: hashContent(input.newText).slice(0, 16) } : {}),
    evidence: [
      `provider-anchor-candidate:id:${candidateId}`,
      `provider-anchor-candidate:source-validation:${input.sourceOutputValidationId}`,
      `provider-anchor-candidate:source-status:${input.sourceOutputStatus}`,
      ...(input.targetFileLabel ? [`provider-anchor-candidate:target:${input.targetFileLabel}`] : []),
      `provider-anchor-candidate:exactness:${exactness}`,
      `provider-anchor-candidate:old-anchor:${oldAnchorStatus}`,
      `provider-anchor-candidate:new-content:${newContentStatus}`,
      `provider-anchor-candidate:ambiguity:${ambiguity}`,
      ...(unsupportedReason ? [`provider-anchor-candidate:unsupported:${unsupportedReason}`] : []),
      "provider-anchor-candidate:mutation-authority:not-granted",
      "provider-anchor-candidate:raw-content-excluded",
    ],
  };
}

function classifyUnsupportedReason(status: ProviderOutputValidationStatus): string | undefined {
  switch (status) {
    case "fuzzy-output":
      return "unsupported fuzzy output";
    case "broad-refactor-output":
      return "unsupported broad refactor output";
    case "malformed-output":
      return "malformed provider output";
    case "unsafe-output":
      return "unsafe provider output";
    case "empty-output":
      return "empty provider output";
    case "over-budget-output":
      return "over-budget provider output";
    default:
      return undefined;
  }
}

function buildCandidateId(input: {
  readonly requestId: string;
  readonly index: number;
  readonly targetFileLabel?: string;
  readonly sourceOutputValidationId: string;
  readonly oldText?: string;
  readonly newText?: string;
  readonly unsupportedReason?: string;
}): string {
  const digest = hashContent(JSON.stringify(input)).slice(0, 12);
  return `provider-anchor-candidate-${digest}`;
}
