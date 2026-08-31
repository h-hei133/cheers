import { sliceWithWidth, visibleWidth } from "./compositor.js";

/**
 * Visual Line Wrapping & Truncation Engine
 * (Benchmarked against Pi Agent's `src/modes/interactive/components/visual-truncate.ts`)
 *
 * Wraps and truncates lines based on real terminal column width, accounting
 * for ANSI escape codes and CJK characters, returning skipped line counts for
 * interactive expanding.
 */

export interface VisualTruncateResult {
  readonly visualLines: readonly string[];
  readonly skippedCount: number;
}

export function truncateToVisualLines(
  text: string,
  maxVisualLines: number,
  width: number,
): VisualTruncateResult {
  if (!text || typeof text !== "string") {
    return { visualLines: [], skippedCount: 0 };
  }

  const rawLines = text.split("\n");
  const wrappedLines: string[] = [];
  const safeWidth = Math.max(10, width);

  for (const rawLine of rawLines) {
    if (visibleWidth(rawLine) <= safeWidth) {
      wrappedLines.push(rawLine);
      continue;
    }

    let remaining = rawLine;
    while (visibleWidth(remaining) > safeWidth) {
      const slice = sliceWithWidth(remaining, 0, safeWidth);
      wrappedLines.push(slice.text);
      const consumedLen = slice.text.length;
      remaining = remaining.slice(consumedLen);
    }
    if (remaining.length > 0) {
      wrappedLines.push(remaining);
    }
  }

  if (wrappedLines.length <= maxVisualLines) {
    return { visualLines: wrappedLines, skippedCount: 0 };
  }

  return {
    visualLines: wrappedLines.slice(-maxVisualLines),
    skippedCount: wrappedLines.length - maxVisualLines,
  };
}
