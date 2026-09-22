import type { ProviderAnchoredProposalManifest } from "./providerAnchoredProposal.js";

export type ProviderAnchoringResultStatus =
  | "exact-anchors-ready-for-review"
  | "partial-anchors-review-only"
  | "ambiguous-anchors-need-target-selection"
  | "no-anchors-found"
  | "stale-context-blocks-anchoring"
  | "unsupported-fuzzy-or-broad-output"
  | "unsafe-or-malformed-provider-output"
  | "anchored-proposal-handoff-ready"
  | "anchored-proposal-applied-through-existing-path";

export interface ProviderAnchoringResult {
  readonly status: ProviderAnchoringResultStatus;
  readonly anchoredProposalId?: string;
  readonly candidateCount: number;
  readonly exactCount: number;
  readonly partialCount: number;
  readonly unsupportedCount: number;
  readonly anchorQualityLevel?: string;
  readonly missingFacts: readonly string[];
  readonly suggestedReads: readonly string[];
  readonly noWrite: true;
  readonly mutationAuthority: "not-granted";
  readonly redactionStatus: "raw-content-excluded";
  readonly reason: string;
  readonly nextAction: string;
  readonly safeSummary: string;
  readonly evidence: readonly string[];
}

export function buildProviderAnchoringResult(input: {
  readonly manifest?: ProviderAnchoredProposalManifest;
  readonly candidateCount: number;
  readonly exactCount: number;
  readonly partialCount: number;
  readonly unsupportedCount: number;
  readonly anchorQualityLevel?: string;
  readonly matchOutcome?: string;
  readonly conflictKind?: string;
  readonly suggestedReads?: readonly string[];
  readonly appliedThroughExistingPath?: boolean;
  readonly evidence?: readonly string[];
}): ProviderAnchoringResult {
  const status = classifyStatus(input);
  const missingFacts = buildMissingFacts(input);
  const reason = describeStatus(status);
  const nextAction = nextActionForStatus(status);
  const safeSummary = [
    input.manifest ? `provider-anchoring proposal=${input.manifest.anchoredProposalId}` : "provider-anchoring proposal=(none)",
    `status=${status}`,
    `candidates=${input.candidateCount}`,
    `exact=${input.exactCount}`,
    `partial=${input.partialCount}`,
    `unsupported=${input.unsupportedCount}`,
    input.anchorQualityLevel ? `anchorQuality=${input.anchorQualityLevel}` : undefined,
    missingFacts.length ? `missingFacts=${missingFacts.length}` : undefined,
    (input.suggestedReads?.length ?? 0) > 0 ? `suggestedReads=${input.suggestedReads!.join(",")}` : undefined,
    "mutationAuthority=not-granted",
    "raw-content-excluded",
  ].filter(Boolean).join("; ");

  return {
    status,
    ...(input.manifest ? { anchoredProposalId: input.manifest.anchoredProposalId } : {}),
    candidateCount: input.candidateCount,
    exactCount: input.exactCount,
    partialCount: input.partialCount,
    unsupportedCount: input.unsupportedCount,
    ...(input.anchorQualityLevel ? { anchorQualityLevel: input.anchorQualityLevel } : {}),
    missingFacts,
    suggestedReads: input.suggestedReads ?? [],
    noWrite: true,
    mutationAuthority: "not-granted",
    redactionStatus: "raw-content-excluded",
    reason,
    nextAction,
    safeSummary,
    evidence: [
      ...(input.evidence ?? []),
      `provider-anchoring-result:status:${status}`,
      ...(input.manifest ? [`provider-anchoring-result:proposal:${input.manifest.anchoredProposalId}`] : []),
      `provider-anchoring-result:candidates:${input.candidateCount}`,
      `provider-anchoring-result:exact:${input.exactCount}`,
      `provider-anchoring-result:partial:${input.partialCount}`,
      `provider-anchoring-result:unsupported:${input.unsupportedCount}`,
      ...(input.anchorQualityLevel ? [`provider-anchoring-result:anchor-quality:${input.anchorQualityLevel}`] : []),
      "provider-anchoring-result:no-write",
      "provider-anchoring-result:mutation-authority:not-granted",
      "provider-anchoring-result:raw-content-excluded",
      safeSummary,
    ],
  };
}

function classifyStatus(input: {
  readonly manifest?: ProviderAnchoredProposalManifest;
  readonly exactCount: number;
  readonly partialCount: number;
  readonly unsupportedCount: number;
  readonly matchOutcome?: string;
  readonly conflictKind?: string;
  readonly appliedThroughExistingPath?: boolean;
}): ProviderAnchoringResultStatus {
  if (input.appliedThroughExistingPath) return "anchored-proposal-applied-through-existing-path";
  if (input.manifest?.handoffReadiness === "exact-single-target" || input.manifest?.handoffReadiness === "exact-hunk-set") {
    return "anchored-proposal-handoff-ready";
  }
  if (input.conflictKind === "stale-match-facts" || input.matchOutcome === "stale-context") {
    return "stale-context-blocks-anchoring";
  }
  if (input.matchOutcome === "multiple-candidates-ambiguous" || input.matchOutcome === "target-missing") {
    return "ambiguous-anchors-need-target-selection";
  }
  if (input.unsupportedCount > 0 && input.exactCount === 0 && input.partialCount === 0) {
    return input.matchOutcome === "unsupported" ? "unsupported-fuzzy-or-broad-output" : "unsafe-or-malformed-provider-output";
  }
  if (input.partialCount > 0) return "partial-anchors-review-only";
  if (input.exactCount > 0) return "exact-anchors-ready-for-review";
  return "no-anchors-found";
}

function buildMissingFacts(input: {
  readonly matchOutcome?: string;
  readonly conflictKind?: string;
}): readonly string[] {
  return [
    ...(input.matchOutcome === "single-candidate-needs-review" ? ["current safe read needed"] : []),
    ...(input.matchOutcome === "target-missing" ? ["explicit target selection needed"] : []),
    ...(input.matchOutcome === "stale-context" || input.conflictKind === "stale-match-facts" ? ["fresh target content needed"] : []),
    ...(input.matchOutcome === "multiple-candidates-ambiguous" ? ["unique anchor selection needed"] : []),
  ];
}

function describeStatus(status: ProviderAnchoringResultStatus): string {
  switch (status) {
    case "exact-anchors-ready-for-review":
      return "Provider output has exact anchors ready for review.";
    case "partial-anchors-review-only":
      return "Provider output has partial anchors that remain review-only.";
    case "ambiguous-anchors-need-target-selection":
      return "Provider anchors are ambiguous and need explicit target or hunk selection.";
    case "no-anchors-found":
      return "Provider output did not produce usable anchors.";
    case "stale-context-blocks-anchoring":
      return "Stale context blocks provider anchoring.";
    case "unsupported-fuzzy-or-broad-output":
      return "Fuzzy or broad provider output is unsupported for anchoring.";
    case "unsafe-or-malformed-provider-output":
      return "Unsafe or malformed provider output cannot be anchored.";
    case "anchored-proposal-handoff-ready":
      return "Exact anchored provider proposal is ready for review and explicit confirmation.";
    case "anchored-proposal-applied-through-existing-path":
      return "Anchored proposal was applied through an existing explicit apply path.";
  }
}

function nextActionForStatus(status: ProviderAnchoringResultStatus): string {
  switch (status) {
    case "anchored-proposal-handoff-ready":
    case "exact-anchors-ready-for-review":
      return "Review and explicitly confirm exact hunks before existing apply path.";
    case "partial-anchors-review-only":
      return "Provide exact old/new mappings or request a more anchored proposal.";
    case "ambiguous-anchors-need-target-selection":
      return "Select the target/hunk or provide a unique exact old anchor.";
    case "stale-context-blocks-anchoring":
      return "Refresh target reads and retry anchoring.";
    case "unsupported-fuzzy-or-broad-output":
      return "Request bounded exact target anchors; do not fuzzy apply.";
    case "unsafe-or-malformed-provider-output":
      return "Discard output and retry with supported safe proposal shape.";
    case "anchored-proposal-applied-through-existing-path":
      return "Use existing edit verification and result surface evidence.";
    case "no-anchors-found":
      return "Request a target-bound provider proposal with exact anchors.";
  }
}
