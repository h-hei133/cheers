import type { ProviderOutputValidation } from "./providerOutputValidator.js";
import type { ProviderAnchorConflictResult } from "./providerAnchorConflict.js";
import type { ProviderAnchorMatchResult } from "./providerAnchorMatcher.js";
import type { ProviderProposalAnchorExtraction } from "./providerProposalAnchors.js";

export type ProviderAnchorQualityLevel =
  | "exact-ready"
  | "review-only"
  | "needs-anchoring"
  | "ambiguous"
  | "stale"
  | "low-confidence"
  | "unsupported"
  | "unsafe";

export interface ProviderAnchorQuality {
  readonly qualityId: string;
  readonly level: ProviderAnchorQualityLevel;
  readonly targetSpecificity: "specific" | "partial" | "missing";
  readonly oldTextExactness: "exact" | "partial" | "missing";
  readonly newTextBoundedness: "bounded" | "missing" | "unsafe";
  readonly matchUniqueness: "not-proven";
  readonly hunkConflictRisk: "low" | "medium" | "high";
  readonly multiFileScope: "single-target" | "target-set" | "unsupported";
  readonly verificationExpectation: "present" | "missing";
  readonly reviewReadiness: "ready-for-review" | "needs-anchoring" | "blocked";
  readonly summary: string;
  readonly mutationAuthority: "not-granted";
  readonly evidence: readonly string[];
}

export function classifyProviderAnchorQuality(input: {
  readonly requestId: string;
  readonly validation: ProviderOutputValidation;
  readonly extraction?: ProviderProposalAnchorExtraction;
  readonly matchResult?: ProviderAnchorMatchResult;
  readonly conflict?: ProviderAnchorConflictResult;
  readonly verificationPlan?: readonly string[];
}): ProviderAnchorQuality {
  const level = classifyLevel({
    validation: input.validation,
    extraction: input.extraction,
    matchResult: input.matchResult,
    conflict: input.conflict,
  });
  const targetSpecificity =
    input.validation.targetBinding === "exact"
      ? "specific"
      : input.validation.targetBinding === "partial"
        ? "partial"
        : "missing";
  const oldTextExactness =
    input.validation.status === "valid-exact-single-target" ||
    input.validation.status === "valid-exact-hunk-set"
      ? "exact"
      : input.validation.status === "partial-anchor"
        ? "partial"
        : "missing";
  const newTextBoundedness =
    input.validation.status === "unsafe-output"
      ? "unsafe"
      : input.validation.hunkCount > 0
        ? "bounded"
        : "missing";
  const hunkConflictRisk =
    level === "exact-ready"
      ? "low"
      : level === "review-only" || level === "needs-anchoring" || level === "ambiguous" || level === "stale"
        ? "medium"
        : "high";
  const multiFileScope =
    input.validation.targetCount === 1
      ? "single-target"
      : input.validation.targetCount > 1 && input.validation.targetCount <= 3
        ? "target-set"
        : "unsupported";
  const verificationExpectation =
    input.verificationPlan?.length ? "present" : "missing";
  const reviewReadiness =
    level === "unsafe" || level === "unsupported" || level === "low-confidence" || level === "stale"
      ? "blocked"
      : level === "needs-anchoring" || level === "ambiguous"
        ? "needs-anchoring"
        : "ready-for-review";
  const qualityId = [
    "provider_anchor_quality",
    input.requestId,
    level,
    input.validation.validationId,
    input.extraction?.extractionId,
    input.matchResult?.matchResultId,
    input.conflict?.conflictId,
  ].join("_").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 128);
  const summary = [
    `provider-anchor-quality ${qualityId}`,
    `level=${level}`,
    `targets=${targetSpecificity}`,
    `oldText=${oldTextExactness}`,
    `newText=${newTextBoundedness}`,
    `review=${reviewReadiness}`,
    "mutationAuthority=not-granted",
    "raw-content-excluded",
  ].join("; ");

  return {
    qualityId,
    level,
    targetSpecificity,
    oldTextExactness,
    newTextBoundedness,
    matchUniqueness: "not-proven",
    hunkConflictRisk,
    multiFileScope,
    verificationExpectation,
    reviewReadiness,
    summary,
    mutationAuthority: "not-granted",
    evidence: [
      `provider-anchor-quality:id:${qualityId}`,
      `provider-anchor-quality:level:${level}`,
      `provider-anchor-quality:target-specificity:${targetSpecificity}`,
      `provider-anchor-quality:old-text:${oldTextExactness}`,
      `provider-anchor-quality:new-text:${newTextBoundedness}`,
      `provider-anchor-quality:review:${reviewReadiness}`,
      ...(input.extraction ? [`provider-anchor-quality:extraction:${input.extraction.extractionId}`] : []),
      ...(input.matchResult ? [`provider-anchor-quality:match:${input.matchResult.matchResultId}`] : []),
      ...(input.conflict ? [`provider-anchor-quality:conflict:${input.conflict.conflictId}`] : []),
      "provider-anchor-quality:mutation-authority:not-granted",
      "provider-anchor-quality:raw-content-excluded",
    ],
  };
}

function classifyLevel(input: {
  readonly validation: ProviderOutputValidation;
  readonly extraction?: ProviderProposalAnchorExtraction;
  readonly matchResult?: ProviderAnchorMatchResult;
  readonly conflict?: ProviderAnchorConflictResult;
}): ProviderAnchorQualityLevel {
  if (input.validation.status === "unsafe-output") return "unsafe";
  if (input.conflict && input.conflict.ok === false) {
    if (input.conflict.kind === "stale-match-facts") return "stale";
    if (input.conflict.kind === "ambiguous-match") return "ambiguous";
    return "unsupported";
  }
  if (input.matchResult) {
    if (input.matchResult.outcome === "stale-context") return "stale";
    if (
      input.matchResult.outcome === "multiple-candidates-ambiguous" ||
      input.matchResult.outcome === "target-missing"
    ) {
      return "ambiguous";
    }
    if (input.matchResult.exactMatchIds.length > 0 && input.matchResult.stoppedIds.length === 0) {
      return "exact-ready";
    }
    if (input.matchResult.reviewOnlyIds.length > 0) return "review-only";
    if (input.matchResult.stoppedIds.length > 0) return "unsupported";
  }
  if (input.extraction?.partialCandidateIds.length) return "needs-anchoring";

  switch (input.validation.status) {
    case "valid-exact-single-target":
    case "valid-exact-hunk-set":
      return "exact-ready";
    case "partial-anchor":
      return "needs-anchoring";
    case "unanchored-generated":
      return "review-only";
    case "fuzzy-output":
    case "broad-refactor-output":
    case "malformed-output":
      return "unsupported";
    case "empty-output":
    case "over-budget-output":
      return "low-confidence";
  }
}
