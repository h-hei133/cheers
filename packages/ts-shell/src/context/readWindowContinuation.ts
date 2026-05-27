import crypto from "node:crypto";

import type { ContinuityStateLike } from "../orchestration/runtimeHandoffProjection.js";

export type ReadWindowMode = "reset" | "continue" | "absolute";

export interface ReadWindowDirective {
  readonly lineCount?: number;
  readonly lineOffset?: number;
  readonly mode: ReadWindowMode;
}

export function extractRequestedLineCount(prompt: string): number | undefined {
  const zh = prompt.match(
    /(?:前|读前|读取前|前面)\s*([0-9]+|[一二两三四五六七八九十百]+)\s*行/u,
  );
  if (zh?.[1]) {
    return parseLineCountToken(zh[1]);
  }
  const en = prompt.match(/first\s+([0-9]+)\s+lines?/i);
  if (en?.[1]) {
    return parseLineCountToken(en[1]);
  }
  const generic = prompt.match(
    /(?:read|读取|查看|看)\s*([0-9]+)\s*(?:lines?|行)/i,
  );
  if (generic?.[1]) {
    return parseLineCountToken(generic[1]);
  }
  return undefined;
}

export function extractContinuationReadLineCount(prompt: string): number | undefined {
  const zh = prompt.match(
    /(?:继续(?:读取|读|看)|接着(?:读取|读|看)|再读(?:后|下)?|继续读取后)\s*([0-9]+|[一二两三四五六七八九十百]+)\s*行/u,
  );
  if (zh?.[1]) {
    return parseLineCountToken(zh[1]);
  }
  const en = prompt.match(
    /(?:continue|next)\s+(?:read(?:ing)?\s+)?(?:next\s+)?([0-9]+)\s+lines?/i,
  );
  if (en?.[1]) {
    return parseLineCountToken(en[1]);
  }
  if (/(?:缁х画璇诲彇鍚庝袱琛|鍚庝袱琛)/u.test(prompt)) {
    return 2;
  }
  return undefined;
}

export function extractReadStartLine(prompt: string): number | undefined {
  const zh = prompt.match(
    /从第\s*([0-9]+|[一二两三四五六七八九十百]+)\s*行(?:开始|起)?/u,
  );
  if (zh?.[1]) {
    return parseLineCountToken(zh[1]);
  }
  const en = prompt.match(/(?:from|starting\s+at)\s+line\s+([0-9]+)/i);
  if (en?.[1]) {
    return parseLineCountToken(en[1]);
  }
  return undefined;
}

export function hasReadTailCue(prompt: string): boolean {
  return /(?:后\s*(?:[0-9]+|[一二两三四五六七八九十百]+)\s*行|最后\s*(?:[0-9]+|[一二两三四五六七八九十百]+)\s*行|last\s+[0-9]+\s+lines?|鍚庝袱琛)/iu.test(
    prompt,
  );
}

export function hasResetReadWindowCue(prompt: string): boolean {
  return /(?:重新(?:读取|读)|重读|re-?read|read again)/i.test(prompt);
}

export function hasImplicitReadContinuationCue(prompt: string): boolean {
  return /(?:继续读(?:下一段)?|再读一段|接着读一段|继续读取|go on reading|continue reading(?:\s+(?:it|this|that))?|read on|read next chunk|next chunk)/i.test(
    prompt,
  );
}

export function hasLocalSliceExplainCue(prompt: string): boolean {
  return /(?:这部分|这一段|这段|刚才那段|that part|this part|this section|that section|local section)/i.test(
    prompt,
  );
}

export function isReflectiveExplainContinuationPrompt(prompt: string): boolean {
  return /(?:continue explaining that part|继续解释这部分)/i.test(prompt);
}

export function isRepairContinuationFollowUpPrompt(prompt: string): boolean {
  return /(?:\bcontinue fixing(?:\s+that)?\b|\bthen continue(?:\s+fixing)?\b|\bwhy did it stop[^\n]*continue\b|\bwhat should we do next[^\n]*continue fixing\b|刚才为什么停了.*继续修|那继续修|继续修这个|就按刚才那个继续修|按这个继续修|那就按这个继续修)/i.test(
    prompt,
  );
}

function parseLineCountToken(token: string): number | undefined {
  const normalized = token.trim();
  if (normalized.length === 0) {
    return undefined;
  }
  if (/^\d+$/.test(normalized)) {
    const value = Number.parseInt(normalized, 10);
    return Number.isFinite(value) && value > 0 ? value : undefined;
  }
  const value = parseChineseNumber(normalized);
  return value > 0 ? value : undefined;
}

function parseChineseNumber(token: string): number {
  const normalized = token.replace(/\s+/g, "");
  if (normalized.length === 0) {
    return 0;
  }
  const digitMap: Record<string, number> = {
    零: 0,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };
  if (normalized === "十") {
    return 10;
  }
  if (normalized.includes("十")) {
    const parts = normalized.split("十");
    const tensPart = parts[0] ?? "";
    const onesPart = parts[1] ?? "";
    const tens = tensPart.length === 0 ? 1 : (digitMap[tensPart] ?? 0);
    const ones = onesPart.length === 0 ? 0 : (digitMap[onesPart] ?? 0);
    return tens * 10 + ones;
  }
  if (normalized.includes("百")) {
    const parts = normalized.split("百");
    const hundredsPart = parts[0] ?? "";
    const restPart = parts[1] ?? "";
    const hundreds =
      hundredsPart.length === 0 ? 1 : (digitMap[hundredsPart] ?? 0);
    if (restPart.length === 0) {
      return hundreds * 100;
    }
    return hundreds * 100 + parseChineseNumber(restPart);
  }
  return digitMap[normalized] ?? 0;
}

export function extractLastReadWindowFromContinuity(continuity: ContinuityStateLike): {
  start?: number;
  end?: number;
  size?: number;
} {
  let start = continuity.lastReadWindowStart;
  let end = continuity.lastReadWindowEnd;
  let size = continuity.lastReadWindowSize;
  for (const entry of continuity.lastContinuationEvidence ?? []) {
    const token = entry.trim().toLowerCase();
    if (!token) {
      continue;
    }
    if (start === undefined) {
      const match = token.match(/^read-window-start:(\d+)$/);
      if (match?.[1]) {
        const parsed = Number.parseInt(match[1], 10);
        if (Number.isFinite(parsed) && parsed >= 0) {
          start = parsed;
        }
      }
    }
    if (end === undefined) {
      const match = token.match(/^read-window-end:(\d+)$/);
      if (match?.[1]) {
        const parsed = Number.parseInt(match[1], 10);
        if (Number.isFinite(parsed) && parsed >= 0) {
          end = parsed;
        }
      }
    }
    if (size === undefined) {
      const match = token.match(/^read-window-size:(\d+)$/);
      if (match?.[1]) {
        const parsed = Number.parseInt(match[1], 10);
        if (Number.isFinite(parsed) && parsed > 0) {
          size = parsed;
        }
      }
    }
  }
  if (
    size === undefined &&
    start !== undefined &&
    end !== undefined &&
    end >= start
  ) {
    size = end - start;
  }
  return { start, end, size };
}

export function extractLastReadDeliveredFragmentFromContinuity(
  continuity: ContinuityStateLike,
): {
  start?: number;
  end?: number;
  lineIndexes?: number[];
  ranges?: string[];
  sourceWindowStart?: number;
  sourceWindowEnd?: number;
  fingerprint?: string;
  filter?: "none" | "function-definitions";
  empty?: boolean;
} {
  let start = continuity.lastReadFragmentStart;
  let end = continuity.lastReadFragmentEnd;
  const lineIndexes =
    continuity.lastReadFragmentLineIndexes?.filter(
      (value) => Number.isFinite(value) && value >= 0,
    ) ?? [];
  let ranges =
    continuity.lastReadFragmentRanges?.filter(
      (value) => value.trim().length > 0,
    ) ?? [];
  let sourceWindowStart = continuity.lastReadFragmentSourceWindowStart;
  let sourceWindowEnd = continuity.lastReadFragmentSourceWindowEnd;
  let fingerprint = continuity.lastReadFragmentFingerprint;
  let filter = continuity.lastReadFilter;
  let empty: boolean | undefined;
  for (const entry of continuity.lastContinuationEvidence ?? []) {
    const token = entry.trim().toLowerCase();
    if (!token) {
      continue;
    }
    if (start === undefined) {
      const match = token.match(/^read-fragment-start:(\d+)$/);
      if (match?.[1]) {
        const parsed = Number.parseInt(match[1], 10);
        if (Number.isFinite(parsed) && parsed >= 0) {
          start = parsed;
        }
      }
    }
    if (end === undefined) {
      const match = token.match(/^read-fragment-end:(\d+)$/);
      if (match?.[1]) {
        const parsed = Number.parseInt(match[1], 10);
        if (Number.isFinite(parsed) && parsed >= 0) {
          end = parsed;
        }
      }
    }
    if (lineIndexes.length === 0) {
      const match = token.match(/^read-fragment-line-indexes:([0-9,\s]+)$/);
      if (match?.[1]) {
        const parsed = normalizeReadFragmentLineIndexes(
          match[1].split(",").map((value) => Number.parseInt(value.trim(), 10)),
        );
        if (parsed.length > 0) {
          lineIndexes.push(...parsed);
        }
      }
    }
    if (ranges.length === 0) {
      const match = token.match(/^read-fragment-ranges:([0-9;,\s-]+)$/);
      if (match?.[1]) {
        ranges = match[1]
          .split(";")
          .map((value) => value.trim())
          .filter((value) => value.length > 0);
      }
    }
    if (sourceWindowStart === undefined) {
      const match = token.match(/^read-fragment-source-window-start:(\d+)$/);
      if (match?.[1]) {
        const parsed = Number.parseInt(match[1], 10);
        if (Number.isFinite(parsed) && parsed >= 0) {
          sourceWindowStart = parsed;
        }
      }
    }
    if (sourceWindowEnd === undefined) {
      const match = token.match(/^read-fragment-source-window-end:(\d+)$/);
      if (match?.[1]) {
        const parsed = Number.parseInt(match[1], 10);
        if (Number.isFinite(parsed) && parsed >= 0) {
          sourceWindowEnd = parsed;
        }
      }
    }
    if (filter === undefined) {
      const match = token.match(
        /^repair-read-filter:(none|function-definitions)$/,
      );
      if (match?.[1]) {
        filter = match[1] as "none" | "function-definitions";
      }
    }
    if (fingerprint === undefined) {
      const match = token.match(/^read-fragment-fingerprint:([0-9a-f]{64})$/);
      if (match?.[1]) {
        fingerprint = match[1];
      }
    }
    if (empty === undefined) {
      const match = token.match(/^read-fragment-empty:(true|false)$/);
      if (match?.[1]) {
        empty = match[1] === "true";
      }
    }
  }
  if (
    empty === undefined &&
    lineIndexes.length === 0 &&
    start !== undefined &&
    end !== undefined &&
    end <= start
  ) {
    empty = true;
  }
  if (ranges.length === 0 && lineIndexes.length > 0) {
    const compressed = compressLineIndexesToRanges(lineIndexes);
    if (compressed.length > 0) {
      ranges = compressed
        .split(";")
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
    }
  }
  return {
    start,
    end,
    ...(lineIndexes.length > 0 ? { lineIndexes } : {}),
    ...(ranges.length > 0 ? { ranges } : {}),
    ...(sourceWindowStart !== undefined ? { sourceWindowStart } : {}),
    ...(sourceWindowEnd !== undefined ? { sourceWindowEnd } : {}),
    ...(fingerprint ? { fingerprint } : {}),
    ...(filter ? { filter } : {}),
    ...(empty !== undefined ? { empty } : {}),
  };
}

export function normalizeReadFragmentLineIndexes(
  values: readonly number[] | undefined,
  maxExclusive?: number,
): number[] {
  const normalized: number[] = [];
  for (const value of values ?? []) {
    if (!Number.isFinite(value)) {
      continue;
    }
    const parsed = Math.floor(value);
    if (parsed < 0) {
      continue;
    }
    if (maxExclusive !== undefined && parsed >= maxExclusive) {
      continue;
    }
    if (!normalized.includes(parsed)) {
      normalized.push(parsed);
    }
  }
  normalized.sort((left, right) => left - right);
  return normalized;
}

export function compressLineIndexesToRanges(lineIndexes: readonly number[]): string {
  const normalized = normalizeReadFragmentLineIndexes(lineIndexes);
  if (normalized.length === 0) {
    return "";
  }
  const ranges: string[] = [];
  let start = normalized[0] ?? 0;
  let end = start;
  for (let index = 1; index < normalized.length; index += 1) {
    const current = normalized[index];
    if (current === undefined) {
      continue;
    }
    if (current === end + 1) {
      end = current;
      continue;
    }
    ranges.push(`${start}-${end}`);
    start = current;
    end = current;
  }
  ranges.push(`${start}-${end}`);
  return ranges.join(";");
}

export function expandReadFragmentRangesToIndexes(
  ranges: readonly string[] | undefined,
  maxExclusive?: number,
): number[] {
  const indexes: number[] = [];
  for (const token of ranges ?? []) {
    for (const piece of token.split(/[;,\s]+/)) {
      const normalized = piece.trim();
      if (!normalized) {
        continue;
      }
      const rangeMatch = normalized.match(/^(\d+)-(\d+)$/);
      if (rangeMatch?.[1] && rangeMatch[2]) {
        const left = Number.parseInt(rangeMatch[1], 10);
        const right = Number.parseInt(rangeMatch[2], 10);
        if (!Number.isFinite(left) || !Number.isFinite(right)) {
          continue;
        }
        const start = Math.max(0, Math.min(left, right));
        const end = Math.max(start, Math.max(left, right));
        for (let value = start; value <= end; value += 1) {
          indexes.push(value);
        }
        continue;
      }
      const singleMatch = normalized.match(/^(\d+)$/);
      if (singleMatch?.[1]) {
        const parsed = Number.parseInt(singleMatch[1], 10);
        if (Number.isFinite(parsed) && parsed >= 0) {
          indexes.push(parsed);
        }
      }
    }
  }
  return normalizeReadFragmentLineIndexes(indexes, maxExclusive);
}

export function resolveFragmentIndexesFromContinuityInput(
  sourceLines: readonly string[],
  indexes: readonly number[] | undefined,
  ranges: readonly string[] | undefined,
  sourceWindowStart: number | undefined,
  sourceWindowEnd: number | undefined,
  readFilter: "none" | "function-definitions" | undefined,
): number[] {
  let resolved = normalizeReadFragmentLineIndexes(indexes, sourceLines.length);
  if (resolved.length === 0 && (ranges?.length ?? 0) > 0) {
    resolved = expandReadFragmentRangesToIndexes(ranges, sourceLines.length);
  }
  if (
    resolved.length === 0 &&
    sourceWindowStart !== undefined &&
    sourceWindowEnd !== undefined
  ) {
    const start = Math.max(0, sourceWindowStart);
    const end = Math.min(sourceLines.length, Math.max(start, sourceWindowEnd));
    const recomputed: number[] = [];
    for (let index = start; index < end; index += 1) {
      if (
        readFilter === "function-definitions" &&
        !lineMatchesReadFilter(sourceLines[index] ?? "", "function-definitions")
      ) {
        continue;
      }
      recomputed.push(index);
    }
    resolved = normalizeReadFragmentLineIndexes(recomputed, sourceLines.length);
  }
  return resolved;
}

export function computeFragmentFingerprintFromIndexes(
  sourceLines: readonly string[],
  indexes: readonly number[],
): { text: string; fingerprint: string } | undefined {
  if (indexes.length === 0) {
    return undefined;
  }
  const selected = indexes
    .map((index) => sourceLines[index])
    .filter((line): line is string => line !== undefined);
  if (selected.length === 0) {
    return undefined;
  }
  const text = selected.join("\n");
  return {
    text,
    fingerprint: computeFragmentFingerprint(text),
  };
}

export function attemptSelectiveReanchorByFingerprint(input: {
  sourceLines: readonly string[];
  expectedFingerprint: string;
  readFilter: "none" | "function-definitions" | undefined;
  sourceWindowStart: number | undefined;
  sourceWindowEnd: number | undefined;
  previousFragmentIndexes?: readonly number[];
}):
  | {
      status: "matched";
      indexes: number[];
      sourceWindowStart: number;
      sourceWindowEnd: number;
      confidence: "high" | "medium";
      reason: string;
    }
  | { status: "ambiguous" }
  | { status: "not-found" } {
  if (
    input.readFilter !== "function-definitions" ||
    input.sourceWindowStart === undefined ||
    input.sourceWindowEnd === undefined
  ) {
    return { status: "not-found" };
  }
  const sourceLength = input.sourceLines.length;
  if (sourceLength <= 0) {
    return { status: "not-found" };
  }
  const normalizedStart = Math.max(0, input.sourceWindowStart);
  const normalizedEnd = Math.min(
    sourceLength,
    Math.max(normalizedStart, input.sourceWindowEnd),
  );
  const windowSize = Math.max(1, normalizedEnd - normalizedStart);
  const maxStart = Math.max(0, sourceLength - windowSize);
  const expectedRelativePattern =
    input.sourceWindowStart !== undefined
      ? normalizeReadFragmentLineIndexes(input.previousFragmentIndexes).map(
          (index) => index - Math.max(0, input.sourceWindowStart ?? 0),
        )
      : [];
  const expectedPreviousIndexes = normalizeReadFragmentLineIndexes(
    input.previousFragmentIndexes,
    sourceLength,
  );
  const matches: Array<{
    indexes: number[];
    sourceWindowStart: number;
    sourceWindowEnd: number;
  }> = [];
  for (
    let candidateStart = 0;
    candidateStart <= maxStart;
    candidateStart += 1
  ) {
    const candidateEnd = candidateStart + windowSize;
    const candidateIndexes: number[] = [];
    for (let index = candidateStart; index < candidateEnd; index += 1) {
      if (
        lineMatchesReadFilter(
          input.sourceLines[index] ?? "",
          "function-definitions",
        )
      ) {
        candidateIndexes.push(index);
      }
    }
    const candidate = computeFragmentFingerprintFromIndexes(
      input.sourceLines,
      candidateIndexes,
    );
    if (!candidate) {
      continue;
    }
    if (candidate.fingerprint === input.expectedFingerprint) {
      matches.push({
        indexes: candidateIndexes,
        sourceWindowStart: candidateStart,
        sourceWindowEnd: candidateEnd,
      });
    }
  }
  let narrowed = matches;
  if (expectedRelativePattern.length > 0) {
    const relativePatternMatches = matches.filter((candidate) => {
      const relative = candidate.indexes.map(
        (index) => index - candidate.sourceWindowStart,
      );
      if (relative.length !== expectedRelativePattern.length) {
        return false;
      }
      return relative.every(
        (value, idx) => value === expectedRelativePattern[idx],
      );
    });
    if (relativePatternMatches.length > 0) {
      narrowed = relativePatternMatches;
    }
  }
  if (narrowed.length > 1) {
    const scored = narrowed
      .map((candidate) => {
        let score = 0;
        const reasons: string[] = [];
        const relative = candidate.indexes.map(
          (index) => index - candidate.sourceWindowStart,
        );
        if (
          expectedRelativePattern.length > 0 &&
          relative.length === expectedRelativePattern.length &&
          relative.every((value, idx) => value === expectedRelativePattern[idx])
        ) {
          score += 4;
          reasons.push("relative-pattern-match");
        }
        if (input.sourceWindowStart !== undefined) {
          const drift = Math.abs(
            candidate.sourceWindowStart - input.sourceWindowStart,
          );
          if (drift <= 1) {
            score += 3;
            reasons.push("window-start-near");
          } else if (drift <= 4) {
            score += 2;
            reasons.push("window-start-close");
          } else if (drift <= 10) {
            score += 1;
            reasons.push("window-start-acceptable");
          }
        }
        if (input.sourceWindowEnd !== undefined) {
          const drift = Math.abs(
            candidate.sourceWindowEnd - input.sourceWindowEnd,
          );
          if (drift <= 1) {
            score += 2;
            reasons.push("window-end-near");
          } else if (drift <= 4) {
            score += 1;
            reasons.push("window-end-close");
          }
        }
        if (
          expectedPreviousIndexes.length > 0 &&
          candidate.indexes.length === expectedPreviousIndexes.length
        ) {
          const shifts = candidate.indexes.map(
            (index, idx) => index - (expectedPreviousIndexes[idx] ?? index),
          );
          const uniqueShifts = Array.from(new Set(shifts));
          if (uniqueShifts.length === 1) {
            score += 2;
            reasons.push("uniform-shift");
            const shift = Math.abs(uniqueShifts[0] ?? 0);
            if (shift <= 4) {
              score += 1;
              reasons.push("small-shift");
            }
          }
        }
        return { candidate, score, reasons };
      })
      .sort((left, right) => right.score - left.score);
    const best = scored[0];
    const second = scored[1];
    if (!best) {
      return { status: "ambiguous" };
    }
    const margin = best.score - (second?.score ?? Number.NEGATIVE_INFINITY);
    if (best.score >= 5 && margin >= 2) {
      return {
        status: "matched",
        indexes: best.candidate.indexes,
        sourceWindowStart: best.candidate.sourceWindowStart,
        sourceWindowEnd: best.candidate.sourceWindowEnd,
        confidence: best.score >= 7 ? "high" : "medium",
        reason:
          best.reasons.length > 0 ? best.reasons.join("+") : "score-ranked",
      };
    }
    return { status: "ambiguous" };
  }
  const matched = narrowed[0];
  if (!matched) {
    return { status: "not-found" };
  }
  return {
    status: "matched",
    indexes: matched.indexes,
    sourceWindowStart: matched.sourceWindowStart,
    sourceWindowEnd: matched.sourceWindowEnd,
    confidence: "high",
    reason: "unique-fingerprint-match",
  };
}

export function computeFragmentFingerprint(text: string): string {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

export function lineMatchesReadFilter(
  line: string,
  filter: "none" | "function-definitions",
): boolean {
  if (filter === "none") {
    return true;
  }
  return /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\b|^\s*(?:export\s+)?(?:default\s+)?const\s+\w+\s*=\s*(?:\([^)]*\)\s*=>|\w+\s*=>)|^\s*(?:export\s+)?(?:default\s+)?class\s+\w+/i.test(
    line,
  );
}

export function summarizeLineIndexSet(lineIndexes: readonly number[]): string {
  if (lineIndexes.length === 0) {
    return "lines (none)";
  }
  const sorted = [...lineIndexes].sort((left, right) => left - right);
  const ranges: string[] = [];
  let rangeStart = sorted[0] ?? 0;
  let previous = rangeStart;
  for (let index = 1; index < sorted.length; index += 1) {
    const current = sorted[index];
    if (current === undefined) {
      continue;
    }
    if (current === previous + 1) {
      previous = current;
      continue;
    }
    ranges.push(
      rangeStart === previous
        ? `${rangeStart + 1}`
        : `${rangeStart + 1}-${previous + 1}`,
    );
    rangeStart = current;
    previous = current;
  }
  ranges.push(
    rangeStart === previous
      ? `${rangeStart + 1}`
      : `${rangeStart + 1}-${previous + 1}`,
  );
  return `lines ${ranges.join(", ")}`;
}

export function resolveReadWindowDirectiveForWorkflow(
  prompt: string,
  continuity: ContinuityStateLike,
  options?: {
    localSliceExplain?: boolean;
  },
): ReadWindowDirective {
  const explicitStartLine = extractReadStartLine(prompt);
  const requestedLineCount = extractRequestedLineCount(prompt);
  const continuationLineCount = extractContinuationReadLineCount(prompt);
  const hasResetCue = hasResetReadWindowCue(prompt);
  const hasImplicitContinuationCue = hasImplicitReadContinuationCue(prompt);
  const lastDelivered = Math.max(0, continuity.lastReadDeliveredLines ?? 0);
  const lastWindow = extractLastReadWindowFromContinuity(continuity);
  const lastFragment =
    extractLastReadDeliveredFragmentFromContinuity(continuity);
  const fallbackChunkSize = lastWindow.size ?? 2;

  if (explicitStartLine !== undefined) {
    return {
      mode: "absolute",
      lineOffset: Math.max(0, explicitStartLine - 1),
      lineCount:
        requestedLineCount ?? continuationLineCount ?? fallbackChunkSize,
    };
  }
  if (requestedLineCount !== undefined || hasResetCue) {
    return {
      mode: "reset",
      lineOffset: 0,
      lineCount: requestedLineCount ?? continuationLineCount,
    };
  }
  if (continuationLineCount !== undefined) {
    return {
      mode: "continue",
      lineOffset: lastDelivered > 0 ? lastDelivered : lastWindow.end,
      lineCount: continuationLineCount,
    };
  }
  if (hasImplicitContinuationCue) {
    return {
      mode: "continue",
      lineOffset: lastDelivered > 0 ? lastDelivered : lastWindow.end,
      lineCount: fallbackChunkSize,
    };
  }
  if (
    options?.localSliceExplain &&
    (lastFragment.start !== undefined || lastWindow.start !== undefined)
  ) {
    const localStart =
      lastFragment.sourceWindowStart ??
      lastFragment.start ??
      lastWindow.start ??
      0;
    const localCount =
      lastFragment.sourceWindowStart !== undefined &&
      lastFragment.sourceWindowEnd !== undefined &&
      lastFragment.sourceWindowEnd >= lastFragment.sourceWindowStart
        ? Math.max(
            1,
            lastFragment.sourceWindowEnd - lastFragment.sourceWindowStart,
          )
        : lastFragment.start !== undefined &&
            lastFragment.end !== undefined &&
            lastFragment.end >= lastFragment.start
          ? Math.max(1, lastFragment.end - lastFragment.start)
          : fallbackChunkSize;
    return {
      mode: "absolute",
      lineOffset: localStart,
      lineCount: localCount,
    };
  }
  return { mode: "reset" };
}

