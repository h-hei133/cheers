import type { FencedEditMapping } from "./fencedEditPlanner.js";
import type { ExactHunkRange } from "./exactHunkSet.js";
import { sortHunksForApply, splitExactHunkLines } from "./exactHunkSet.js";

export type ExactHunkConflictKind =
  | "duplicate-hunk"
  | "overlapping-old-ranges"
  | "conflicting-replacement"
  | "ambiguous-match-count"
  | "order-dependent-conflict";

export type ExactHunkConflictResult =
  | {
      readonly ok: true;
      readonly orderedHunks: readonly ExactHunkConflictInput[];
      readonly evidence: readonly string[];
    }
  | {
      readonly ok: false;
      readonly kind: ExactHunkConflictKind;
      readonly hunkId?: string;
      readonly targetPath?: string;
      readonly reason: string;
      readonly nextAction: string;
      readonly evidence: readonly string[];
    };

export interface ExactHunkConflictInput {
  readonly hunkId: string;
  readonly targetPath: string;
  readonly mapping: FencedEditMapping;
  readonly matchCount: number;
  readonly range?: ExactHunkRange;
}

export function detectExactHunkConflicts(input: {
  readonly targetPath: string;
  readonly originalContent?: string;
  readonly hunks: readonly ExactHunkConflictInput[];
}): ExactHunkConflictResult {
  const duplicateHunk = firstDuplicate(input.hunks.map((hunk) => hunk.hunkId));
  if (duplicateHunk) {
    return conflict({
      kind: "duplicate-hunk",
      hunkId: duplicateHunk,
      targetPath: input.targetPath,
      reason: "Exact hunk set contains a duplicate hunk id.",
      nextAction: "Select each exact hunk at most once.",
    });
  }

  for (const hunk of input.hunks) {
    if (hunk.matchCount !== 1 || !hunk.range) {
      return conflict({
        kind: "ambiguous-match-count",
        hunkId: hunk.hunkId,
        targetPath: hunk.targetPath,
        reason: `Exact hunk ${hunk.hunkId} matched ${hunk.matchCount} regions.`,
        nextAction: "Provide exact old text that matches exactly one current region.",
      });
    }
  }

  const sortedByRange = [...input.hunks].sort(
    (left, right) =>
      (left.range?.startLine ?? 0) - (right.range?.startLine ?? 0) ||
      left.hunkId.localeCompare(right.hunkId),
  );
  for (let index = 1; index < sortedByRange.length; index += 1) {
    const previous = sortedByRange[index - 1]!;
    const current = sortedByRange[index]!;
    if ((previous.range?.endLine ?? 0) > (current.range?.startLine ?? 0)) {
      return conflict({
        kind:
          previous.mapping.oldText === current.mapping.oldText &&
          previous.mapping.newText !== current.mapping.newText
            ? "conflicting-replacement"
            : "overlapping-old-ranges",
        hunkId: current.hunkId,
        targetPath: input.targetPath,
        reason: `Exact hunks ${previous.hunkId} and ${current.hunkId} overlap in ${input.targetPath}.`,
        nextAction:
          "Resolve the overlapping proposal hunks before applying this hunk set.",
      });
    }
  }

  const orderedHunks = sortHunksForApply(input.hunks);
  const orderEvidence: string[] = [];
  if (typeof input.originalContent === "string") {
    const orderCheck = verifySequentialOrder({
      content: input.originalContent,
      orderedHunks,
      targetPath: input.targetPath,
    });
    if (orderCheck.ok === false) {
      return orderCheck;
    }
    orderEvidence.push(...orderCheck.evidence);
  }

  return {
    ok: true,
    orderedHunks,
    evidence: [
      `exact-hunk-conflict:target:${input.targetPath}:none`,
      "exact-hunk-conflict:overlap-checked",
      "exact-hunk-conflict:duplicate-checked",
      "exact-hunk-conflict:match-count-checked",
      "exact-hunk-conflict:order:descending-original-range",
      ...orderEvidence,
      "exact-hunk-conflict:raw-content-excluded",
    ],
  };
}

function verifySequentialOrder(input: {
  readonly content: string;
  readonly orderedHunks: readonly ExactHunkConflictInput[];
  readonly targetPath: string;
}): Extract<ExactHunkConflictResult, { ok: true }> | Extract<ExactHunkConflictResult, { ok: false }> {
  let planned = input.content;
  for (const hunk of input.orderedHunks) {
    const matchCount = countExactMatches(planned, hunk.mapping.oldText);
    if (matchCount !== 1) {
      return conflict({
        kind: "order-dependent-conflict",
        hunkId: hunk.hunkId,
        targetPath: input.targetPath,
        reason: `Exact hunk ${hunk.hunkId} would match ${matchCount} regions after earlier hunks.`,
        nextAction:
          "Resolve order-dependent hunk conflicts before applying this hunk set.",
      });
    }
    planned = replaceExactOnce(planned, hunk.mapping.oldText, hunk.mapping.newText);
  }
  return {
    ok: true,
    orderedHunks: input.orderedHunks,
    evidence: ["exact-hunk-conflict:order-dependent-conflict-checked"],
  };
}

function countExactMatches(content: string, oldText: string): number {
  const haystack = splitExactHunkLines(content);
  const needle = splitExactHunkLines(oldText);
  if (needle.length === 0 || needle.length > haystack.length) {
    return 0;
  }
  let count = 0;
  for (let index = 0; index <= haystack.length - needle.length; index += 1) {
    if (needle.every((line, offset) => haystack[index + offset] === line)) {
      count += 1;
    }
  }
  return count;
}

function replaceExactOnce(content: string, oldText: string, newText: string): string {
  const trailingNewline = content.endsWith("\n");
  const haystack = splitExactHunkLines(content);
  const needle = splitExactHunkLines(oldText);
  const replacement = splitExactHunkLines(newText);
  const match = findFirstMatch(haystack, needle);
  if (match === undefined) {
    return content;
  }
  const nextLines = [
    ...haystack.slice(0, match),
    ...replacement,
    ...haystack.slice(match + needle.length),
  ];
  const next = nextLines.join("\n");
  return trailingNewline ? `${next}\n` : next;
}

function findFirstMatch(
  haystack: readonly string[],
  needle: readonly string[],
): number | undefined {
  for (let index = 0; index <= haystack.length - needle.length; index += 1) {
    if (needle.every((line, offset) => haystack[index + offset] === line)) {
      return index;
    }
  }
  return undefined;
}

function conflict(input: {
  readonly kind: ExactHunkConflictKind;
  readonly hunkId?: string;
  readonly targetPath?: string;
  readonly reason: string;
  readonly nextAction: string;
}): Extract<ExactHunkConflictResult, { ok: false }> {
  return {
    ok: false,
    kind: input.kind,
    ...(input.hunkId ? { hunkId: input.hunkId } : {}),
    ...(input.targetPath ? { targetPath: input.targetPath } : {}),
    reason: input.reason,
    nextAction: input.nextAction,
    evidence: [
      `exact-hunk-conflict:blocker:${input.kind}`,
      "exact-hunk-conflict:mutation:not-run",
      "exact-hunk-conflict:raw-content-excluded",
    ],
  };
}

function firstDuplicate(values: readonly string[]): string | undefined {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return undefined;
}
