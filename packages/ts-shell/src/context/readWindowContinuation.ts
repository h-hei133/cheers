import type { ContinuityStateLike } from "../orchestration/runtimeHandoffProjection.js";
import {
  extractContinuationReadLineCount,
  extractReadStartLine,
  extractRequestedLineCount,
  hasImplicitReadContinuationCue,
  hasResetReadWindowCue,
} from "./readWindow/cue.js";
import {
  compressLineIndexesToRanges,
  normalizeReadFragmentLineIndexes,
} from "./readWindow/fingerprint.js";

export * from "./readWindow/cue.js";
export * from "./readWindow/fingerprint.js";

export type ReadWindowMode = "reset" | "continue" | "absolute";

export interface ReadWindowDirective {
  readonly lineCount?: number;
  readonly lineOffset?: number;
  readonly mode: ReadWindowMode;
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
