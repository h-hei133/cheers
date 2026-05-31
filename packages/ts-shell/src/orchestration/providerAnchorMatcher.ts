import { locateExactHunkRange, type ExactHunkRange } from "../edit/patch/plan/hunkSet.js";
import type { FencedEditMapping } from "./fencedEditPlanner.js";
import type { ProviderAnchorCandidate } from "./providerAnchorCandidate.js";

export type ProviderAnchorMatchOutcome =
  | "exact-match"
  | "single-candidate-needs-review"
  | "multiple-candidates-ambiguous"
  | "no-match"
  | "stale-context"
  | "target-missing"
  | "out-of-workspace"
  | "unsupported";

export interface ProviderAnchorMatch {
  readonly candidateId: string;
  readonly targetFileLabel?: string;
  readonly outcome: ProviderAnchorMatchOutcome;
  readonly matchCount: number;
  readonly range?: ExactHunkRange;
  readonly mapping?: FencedEditMapping;
  readonly reason: string;
  readonly nextAction: string;
  readonly evidence: readonly string[];
}

export interface ProviderAnchorMatchResult {
  readonly matchResultId: string;
  readonly outcome: ProviderAnchorMatchOutcome | "mixed";
  readonly matches: readonly ProviderAnchorMatch[];
  readonly exactMatchIds: readonly string[];
  readonly reviewOnlyIds: readonly string[];
  readonly stoppedIds: readonly string[];
  readonly suggestedReads: readonly string[];
  readonly noWrite: true;
  readonly mutationAuthority: "not-granted";
  readonly redactionStatus: "raw-content-excluded";
  readonly evidence: readonly string[];
}

export function matchProviderAnchorCandidates(input: {
  readonly requestId: string;
  readonly candidates: readonly ProviderAnchorCandidate[];
  readonly explicitTargetLabels: readonly string[];
  readonly currentContentByTargetLabel?: ReadonlyMap<string, string>;
  readonly staleTargetLabels?: readonly string[];
  readonly inWorkspaceTargetLabels?: readonly string[];
}): ProviderAnchorMatchResult {
  const explicitTargets = new Set(input.explicitTargetLabels);
  const inWorkspaceTargets = new Set(input.inWorkspaceTargetLabels ?? input.explicitTargetLabels);
  const staleTargets = new Set(input.staleTargetLabels ?? []);
  const matches = input.candidates.map((candidate) =>
    matchCandidate({
      candidate,
      explicitTargets,
      inWorkspaceTargets,
      staleTargets,
      currentContentByTargetLabel: input.currentContentByTargetLabel,
    }),
  );
  const exactMatchIds = matches
    .filter((match) => match.outcome === "exact-match")
    .map((match) => match.candidateId);
  const reviewOnlyIds = matches
    .filter((match) => match.outcome === "single-candidate-needs-review")
    .map((match) => match.candidateId);
  const stoppedIds = matches
    .filter((match) => match.outcome !== "exact-match" && match.outcome !== "single-candidate-needs-review")
    .map((match) => match.candidateId);
  const outcome = summarizeOutcome(matches);
  const matchResultId = [
    "provider_anchor_match",
    input.requestId,
    outcome,
    exactMatchIds.length,
    reviewOnlyIds.length,
    stoppedIds.length,
  ].join("_").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 128);
  const suggestedReads = Array.from(
    new Set(
      matches
        .filter((match) => match.outcome === "single-candidate-needs-review" || match.outcome === "target-missing")
        .map((match) => match.targetFileLabel)
        .filter((label): label is string => Boolean(label)),
    ),
  );

  return {
    matchResultId,
    outcome,
    matches,
    exactMatchIds,
    reviewOnlyIds,
    stoppedIds,
    suggestedReads,
    noWrite: true,
    mutationAuthority: "not-granted",
    redactionStatus: "raw-content-excluded",
    evidence: [
      `provider-anchor-match:id:${matchResultId}`,
      `provider-anchor-match:outcome:${outcome}`,
      `provider-anchor-match:exact:${exactMatchIds.length}`,
      `provider-anchor-match:review-only:${reviewOnlyIds.length}`,
      `provider-anchor-match:stopped:${stoppedIds.length}`,
      ...(suggestedReads.length ? [`provider-anchor-match:suggestedReads=${suggestedReads.join(",")}`] : []),
      "provider-anchor-match:mutation:not-run",
      "provider-anchor-match:mutation-authority:not-granted",
      "provider-anchor-match:raw-content-excluded",
      ...matches.flatMap((match) => match.evidence),
    ],
  };
}

function matchCandidate(input: {
  readonly candidate: ProviderAnchorCandidate;
  readonly explicitTargets: ReadonlySet<string>;
  readonly inWorkspaceTargets: ReadonlySet<string>;
  readonly staleTargets: ReadonlySet<string>;
  readonly currentContentByTargetLabel?: ReadonlyMap<string, string>;
}): ProviderAnchorMatch {
  const target = input.candidate.targetFileLabel;
  if (input.candidate.exactness === "unsupported" || input.candidate.exactness === "unsafe") {
    return stoppedMatch({
      candidate: input.candidate,
      outcome: "unsupported",
      reason: input.candidate.unsupportedReason ?? "Provider anchor candidate is unsupported.",
      nextAction: "Keep unsupported provider output review-only/no-write.",
    });
  }
  if (!target || !input.explicitTargets.has(target)) {
    return stoppedMatch({
      candidate: input.candidate,
      outcome: "target-missing",
      reason: "Anchor candidate is not bound to an explicit target.",
      nextAction: "Select an explicit target and request target-bound anchors.",
    });
  }
  if (!input.inWorkspaceTargets.has(target)) {
    return stoppedMatch({
      candidate: input.candidate,
      outcome: "out-of-workspace",
      reason: "Anchor candidate target is outside the current workspace authority facts.",
      nextAction: "Use only explicit in-workspace targets.",
    });
  }
  if (input.staleTargets.has(target)) {
    return stoppedMatch({
      candidate: input.candidate,
      outcome: "stale-context",
      reason: "Anchor candidate depends on stale target context.",
      nextAction: "Re-read the target before anchoring provider output.",
    });
  }
  if (!input.candidate.mapping) {
    return stoppedMatch({
      candidate: input.candidate,
      outcome: "single-candidate-needs-review",
      reason: "Anchor candidate is target-bound but missing exact old/new mapping.",
      nextAction: "Review candidate and provide exact old/new mapping.",
    });
  }
  const currentContent = input.currentContentByTargetLabel?.get(target);
  if (typeof currentContent !== "string") {
    return stoppedMatch({
      candidate: input.candidate,
      outcome: "single-candidate-needs-review",
      reason: "Current safe read content is required before exact anchoring.",
      nextAction: `Read ${target} through the safe read path before anchoring.`,
      mapping: input.candidate.mapping,
    });
  }
  const located = locateExactHunkRange({
    content: currentContent,
    oldText: input.candidate.mapping.oldText,
  });
  if (located.matchCount === 0) {
    return stoppedMatch({
      candidate: input.candidate,
      outcome: "no-match",
      reason: "Provider old anchor was not found in the current target content.",
      nextAction: "Re-read the target or request an exact current old anchor.",
      mapping: input.candidate.mapping,
      matchCount: 0,
    });
  }
  if (located.matchCount > 1) {
    return stoppedMatch({
      candidate: input.candidate,
      outcome: "multiple-candidates-ambiguous",
      reason: `Provider old anchor matched ${located.matchCount} regions in the current target content.`,
      nextAction: "Request a larger exact old anchor that uniquely identifies one region.",
      mapping: input.candidate.mapping,
      matchCount: located.matchCount,
    });
  }
  return {
    candidateId: input.candidate.candidateId,
    targetFileLabel: target,
    outcome: "exact-match",
    matchCount: 1,
    range: located.range,
    mapping: input.candidate.mapping,
    reason: "Provider anchor matched exactly one current target region.",
    nextAction: "Review and explicitly confirm before using the existing apply path.",
    evidence: [
      `provider-anchor-match:candidate:${input.candidate.candidateId}`,
      "provider-anchor-match:outcome:exact-match",
      `provider-anchor-match:target:${target}`,
      "provider-anchor-match:match-count:1",
      "provider-anchor-match:mutation:not-run",
      "provider-anchor-match:raw-content-excluded",
    ],
  };
}

function stoppedMatch(input: {
  readonly candidate: ProviderAnchorCandidate;
  readonly outcome: ProviderAnchorMatchOutcome;
  readonly reason: string;
  readonly nextAction: string;
  readonly mapping?: FencedEditMapping;
  readonly matchCount?: number;
}): ProviderAnchorMatch {
  return {
    candidateId: input.candidate.candidateId,
    ...(input.candidate.targetFileLabel ? { targetFileLabel: input.candidate.targetFileLabel } : {}),
    outcome: input.outcome,
    matchCount: input.matchCount ?? 0,
    ...(input.mapping ? { mapping: input.mapping } : {}),
    reason: input.reason,
    nextAction: input.nextAction,
    evidence: [
      `provider-anchor-match:candidate:${input.candidate.candidateId}`,
      `provider-anchor-match:outcome:${input.outcome}`,
      ...(input.candidate.targetFileLabel ? [`provider-anchor-match:target:${input.candidate.targetFileLabel}`] : []),
      `provider-anchor-match:match-count:${input.matchCount ?? 0}`,
      "provider-anchor-match:mutation:not-run",
      "provider-anchor-match:raw-content-excluded",
    ],
  };
}

function summarizeOutcome(matches: readonly ProviderAnchorMatch[]): ProviderAnchorMatchResult["outcome"] {
  const outcomes = new Set(matches.map((match) => match.outcome));
  if (outcomes.size === 1) {
    return matches[0]?.outcome ?? "no-match";
  }
  if (outcomes.has("stale-context")) return "stale-context";
  if (outcomes.has("multiple-candidates-ambiguous")) return "multiple-candidates-ambiguous";
  if (outcomes.has("unsupported")) return "unsupported";
  if (outcomes.has("no-match")) return "no-match";
  return "mixed";
}
