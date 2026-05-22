import { detectExactHunkConflicts } from "./exactHunkConflict.js";
import type { ProviderAnchorMatch, ProviderAnchorMatchResult } from "./providerAnchorMatcher.js";

export type ProviderAnchorConflictKind =
  | "none"
  | "duplicate-candidate"
  | "overlapping-hunks"
  | "conflicting-replacements"
  | "same-target-range"
  | "stale-match-facts"
  | "target-set-over-max"
  | "hunk-set-over-max"
  | "ambiguous-match";

export type ProviderAnchorConflictResult =
  | {
      readonly ok: true;
      readonly conflictId: string;
      readonly kind: "none";
      readonly orderedExactMatches: readonly ProviderAnchorMatch[];
      readonly noWrite: true;
      readonly mutationAuthority: "not-granted";
      readonly redactionStatus: "raw-content-excluded";
      readonly evidence: readonly string[];
    }
  | {
      readonly ok: false;
      readonly conflictId: string;
      readonly kind: Exclude<ProviderAnchorConflictKind, "none">;
      readonly candidateId?: string;
      readonly targetFileLabel?: string;
      readonly reason: string;
      readonly nextAction: string;
      readonly noWrite: true;
      readonly mutationAuthority: "not-granted";
      readonly redactionStatus: "raw-content-excluded";
      readonly evidence: readonly string[];
    };

export function detectProviderAnchorConflicts(input: {
  readonly requestId: string;
  readonly matchResult: ProviderAnchorMatchResult;
  readonly maxTargets?: number;
  readonly maxHunks?: number;
  readonly currentContentByTargetLabel?: ReadonlyMap<string, string>;
}): ProviderAnchorConflictResult {
  const exactMatches = input.matchResult.matches.filter(
    (match) => match.outcome === "exact-match" && match.mapping && match.targetFileLabel,
  );
  const targetLabels = Array.from(new Set(exactMatches.map((match) => match.targetFileLabel!)));
  const maxTargets = input.maxTargets ?? 3;
  const maxHunks = input.maxHunks ?? 8;
  const conflictId = buildConflictId({
    requestId: input.requestId,
    matchResultId: input.matchResult.matchResultId,
    targetLabels,
    hunkIds: exactMatches.map((match) => match.candidateId),
  });

  const duplicate = firstDuplicate(exactMatches.map((match) => match.candidateId));
  if (duplicate) {
    return conflict({
      conflictId,
      kind: "duplicate-candidate",
      candidateId: duplicate,
      reason: "Anchored provider proposal contains a duplicate candidate id.",
      nextAction: "Select each exact provider candidate at most once.",
    });
  }
  if (targetLabels.length > maxTargets) {
    return conflict({
      conflictId,
      kind: "target-set-over-max",
      reason: `Anchored provider proposal targets ${targetLabels.length} files; max is ${maxTargets}.`,
      nextAction: `Select at most ${maxTargets} exact targets before review handoff.`,
    });
  }
  if (exactMatches.length > maxHunks) {
    return conflict({
      conflictId,
      kind: "hunk-set-over-max",
      reason: `Anchored provider proposal has ${exactMatches.length} exact hunks; max is ${maxHunks}.`,
      nextAction: `Select at most ${maxHunks} exact hunks before review handoff.`,
    });
  }
  const stopped = input.matchResult.matches.find(
    (match) =>
      match.outcome === "stale-context" ||
      match.outcome === "multiple-candidates-ambiguous",
  );
  if (stopped) {
    return conflict({
      conflictId,
      kind: stopped.outcome === "stale-context" ? "stale-match-facts" : "ambiguous-match",
      candidateId: stopped.candidateId,
      targetFileLabel: stopped.targetFileLabel,
      reason: stopped.reason,
      nextAction: stopped.nextAction,
    });
  }

  const ordered: ProviderAnchorMatch[] = [];
  for (const target of targetLabels) {
    const targetMatches = exactMatches.filter((match) => match.targetFileLabel === target);
    const exactConflict = detectExactHunkConflicts({
      targetPath: target,
      originalContent: input.currentContentByTargetLabel?.get(target),
      hunks: targetMatches.map((match) => ({
        hunkId: match.candidateId,
        targetPath: target,
        mapping: match.mapping!,
        matchCount: match.matchCount,
        ...(match.range ? { range: match.range } : {}),
      })),
    });
    if (exactConflict.ok === false) {
      return conflict({
        conflictId,
        kind:
          exactConflict.kind === "conflicting-replacement"
            ? "conflicting-replacements"
            : exactConflict.kind === "overlapping-old-ranges" || exactConflict.kind === "order-dependent-conflict"
              ? "overlapping-hunks"
              : exactConflict.kind === "duplicate-hunk"
                ? "duplicate-candidate"
                : "ambiguous-match",
        candidateId: exactConflict.hunkId,
        targetFileLabel: exactConflict.targetPath,
        reason: exactConflict.reason,
        nextAction: exactConflict.nextAction,
        evidence: exactConflict.evidence,
      });
    }
    const order = new Map(exactConflict.orderedHunks.map((hunk, index) => [hunk.hunkId, index]));
    ordered.push(
      ...[...targetMatches].sort(
        (left, right) => (order.get(left.candidateId) ?? 0) - (order.get(right.candidateId) ?? 0),
      ),
    );
  }

  return {
    ok: true,
    conflictId,
    kind: "none",
    orderedExactMatches: ordered,
    noWrite: true,
    mutationAuthority: "not-granted",
    redactionStatus: "raw-content-excluded",
    evidence: [
      `provider-anchor-conflict:id:${conflictId}`,
      "provider-anchor-conflict:kind:none",
      `provider-anchor-conflict:targets:${targetLabels.length}`,
      `provider-anchor-conflict:hunks:${exactMatches.length}`,
      "provider-anchor-conflict:mutation:not-run",
      "provider-anchor-conflict:mutation-authority:not-granted",
      "provider-anchor-conflict:raw-content-excluded",
    ],
  };
}

function conflict(input: {
  readonly conflictId: string;
  readonly kind: Exclude<ProviderAnchorConflictKind, "none">;
  readonly candidateId?: string;
  readonly targetFileLabel?: string;
  readonly reason: string;
  readonly nextAction: string;
  readonly evidence?: readonly string[];
}): Extract<ProviderAnchorConflictResult, { ok: false }> {
  return {
    ok: false,
    conflictId: input.conflictId,
    kind: input.kind,
    ...(input.candidateId ? { candidateId: input.candidateId } : {}),
    ...(input.targetFileLabel ? { targetFileLabel: input.targetFileLabel } : {}),
    reason: input.reason,
    nextAction: input.nextAction,
    noWrite: true,
    mutationAuthority: "not-granted",
    redactionStatus: "raw-content-excluded",
    evidence: [
      ...(input.evidence ?? []),
      `provider-anchor-conflict:id:${input.conflictId}`,
      `provider-anchor-conflict:kind:${input.kind}`,
      "provider-anchor-conflict:mutation:not-run",
      "provider-anchor-conflict:mutation-authority:not-granted",
      "provider-anchor-conflict:raw-content-excluded",
    ],
  };
}

function buildConflictId(input: object): string {
  return `provider_anchor_conflict_${JSON.stringify(input).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 96)}`;
}

function firstDuplicate(values: readonly string[]): string | undefined {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return undefined;
}
