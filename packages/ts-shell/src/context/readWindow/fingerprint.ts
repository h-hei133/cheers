import crypto from "node:crypto";

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
