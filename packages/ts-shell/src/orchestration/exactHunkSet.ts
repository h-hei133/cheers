import { hashContent } from "./patchRecovery/recoveryAuthorityStore.js";
import type { FencedEditMapping } from "./fencedEditPlanner.js";

export interface ExactHunkRange {
  readonly startLine: number;
  readonly endLine: number;
}

export interface ExactHunkSetEntry {
  readonly hunkId: string;
  readonly sourceProposalId: string;
  readonly targetPath: string;
  readonly oldTextHash: string;
  readonly newTextHash: string;
  readonly oldTextSummary: string;
  readonly newTextSummary: string;
  readonly matchCount: number;
  readonly targetBinding: "single-target";
  readonly orderKey: string;
  readonly range?: ExactHunkRange;
  readonly redactionStatus: "raw-content-excluded";
  readonly unsupportedReason?: string;
  readonly evidence: readonly string[];
}

export interface ExactHunkSetFile {
  readonly targetPath: string;
  readonly hunkCount: number;
  readonly hunks: readonly ExactHunkSetEntry[];
  readonly deterministicOrder: "descending-original-range";
  readonly evidence: readonly string[];
}

export interface ExactHunkSetModel {
  readonly source: "exact-hunk-set";
  readonly proposalId: string;
  readonly hunkSetId: string;
  readonly targetCount: number;
  readonly hunkCount: number;
  readonly files: readonly ExactHunkSetFile[];
  readonly redactionStatus: "raw-content-excluded";
  readonly evidence: readonly string[];
}

export function buildExactHunkSetModel(input: {
  readonly proposalId: string;
  readonly hunkSetId: string;
  readonly hunks: readonly {
    readonly hunkId: string;
    readonly targetPath: string;
    readonly mapping: FencedEditMapping;
    readonly matchCount: number;
    readonly range?: ExactHunkRange;
    readonly unsupportedReason?: string;
  }[];
}): ExactHunkSetModel {
  const files = Array.from(groupByTarget(input.hunks).entries()).map(
    ([targetPath, hunks]): ExactHunkSetFile => {
      const ordered = sortHunksForApply(
        hunks.map((hunk) => buildExactHunkSetEntry({ ...input, ...hunk })),
      );
      return {
        targetPath,
        hunkCount: ordered.length,
        hunks: ordered,
        deterministicOrder: "descending-original-range",
        evidence: [
          `exact-hunk-set:file:${targetPath}:hunk-count:${ordered.length}`,
          "exact-hunk-set:file:deterministic-order:descending-original-range",
          "exact-hunk-set:file:raw-content-excluded",
          ...ordered.flatMap((hunk) => hunk.evidence),
        ],
      };
    },
  );
  return {
    source: "exact-hunk-set",
    proposalId: input.proposalId,
    hunkSetId: input.hunkSetId,
    targetCount: files.length,
    hunkCount: input.hunks.length,
    files,
    redactionStatus: "raw-content-excluded",
    evidence: [
      `exact-hunk-set:id:${input.hunkSetId}`,
      `exact-hunk-set:proposal:${input.proposalId}`,
      `exact-hunk-set:target-count:${files.length}`,
      `exact-hunk-set:hunk-count:${input.hunks.length}`,
      "exact-hunk-set:raw-content-excluded",
      ...files.flatMap((file) => file.evidence),
    ],
  };
}

export function locateExactHunkRange(input: {
  readonly content: string;
  readonly oldText: string;
}): { readonly matchCount: number; readonly range?: ExactHunkRange } {
  const haystack = splitExactHunkLines(input.content);
  const needle = splitExactHunkLines(input.oldText);
  if (needle.length === 0 || needle.length > haystack.length) {
    return { matchCount: 0 };
  }

  const ranges: ExactHunkRange[] = [];
  for (let index = 0; index <= haystack.length - needle.length; index += 1) {
    let found = true;
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (haystack[index + offset] !== needle[offset]) {
        found = false;
        break;
      }
    }
    if (found) {
      ranges.push({ startLine: index, endLine: index + needle.length });
    }
  }
  return {
    matchCount: ranges.length,
    ...(ranges.length === 1 ? { range: ranges[0]! } : {}),
  };
}

export function sortHunksForApply<T extends { readonly range?: ExactHunkRange; readonly hunkId: string }>(
  hunks: readonly T[],
): readonly T[] {
  return [...hunks].sort((left, right) => {
    const rangeDelta = (right.range?.startLine ?? -1) - (left.range?.startLine ?? -1);
    if (rangeDelta !== 0) return rangeDelta;
    return left.hunkId.localeCompare(right.hunkId);
  });
}

export function splitExactHunkLines(value: string): readonly string[] {
  const normalized = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  return lines.at(-1) === "" ? lines.slice(0, -1) : lines;
}

function buildExactHunkSetEntry(input: {
  readonly proposalId: string;
  readonly hunkSetId: string;
  readonly hunkId: string;
  readonly targetPath: string;
  readonly mapping: FencedEditMapping;
  readonly matchCount: number;
  readonly range?: ExactHunkRange;
  readonly unsupportedReason?: string;
}): ExactHunkSetEntry {
  const orderKey = `${input.targetPath}:${String(input.range?.startLine ?? -1).padStart(8, "0")}:${input.hunkId}`;
  return {
    hunkId: input.hunkId,
    sourceProposalId: input.proposalId,
    targetPath: input.targetPath,
    oldTextHash: hashContent(input.mapping.oldText).slice(0, 16),
    newTextHash: hashContent(input.mapping.newText).slice(0, 16),
    oldTextSummary: summarizeText(input.mapping.oldText),
    newTextSummary: summarizeText(input.mapping.newText),
    matchCount: input.matchCount,
    targetBinding: "single-target",
    orderKey,
    ...(input.range ? { range: input.range } : {}),
    redactionStatus: "raw-content-excluded",
    ...(input.unsupportedReason ? { unsupportedReason: input.unsupportedReason } : {}),
    evidence: [
      `exact-hunk-set:hunk:${input.hunkId}`,
      `exact-hunk-set:hunk:${input.hunkId}:match-count:${input.matchCount}`,
      `exact-hunk-set:hunk:${input.hunkId}:old-hash:${hashContent(input.mapping.oldText).slice(0, 16)}`,
      `exact-hunk-set:hunk:${input.hunkId}:new-hash:${hashContent(input.mapping.newText).slice(0, 16)}`,
      "exact-hunk-set:hunk:target-binding:single-target",
      "exact-hunk-set:hunk:raw-content-excluded",
    ],
  };
}

function summarizeText(value: string): string {
  return `lines:${splitExactHunkLines(value).length};bytes:${Buffer.byteLength(value, "utf8")}`;
}

function groupByTarget<T extends { readonly targetPath: string }>(
  hunks: readonly T[],
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const hunk of hunks) {
    grouped.set(hunk.targetPath, [...(grouped.get(hunk.targetPath) ?? []), hunk]);
  }
  return grouped;
}
