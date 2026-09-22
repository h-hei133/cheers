import { graphemeBoundaries } from "./measure.js";

/**
 * Caret motion offsets within a single plain-text line.
 *
 * Cluster steps keep the caret on grapheme boundaries, so one keypress never
 * lands inside a surrogate pair or between a base character and its combining
 * marks. Word steps use the conventional shell semantics: skip the run of
 * whitespace adjacent to the caret, then the run of non-whitespace beyond it.
 */

const WHITESPACE = /\s/;

/** Offset of the cluster boundary immediately before `offset`. */
export function previousCluster(line: string, offset: number): number {
  const boundaries = graphemeBoundaries(line);
  for (let index = boundaries.length - 1; index >= 0; index--) {
    if (boundaries[index]! < offset) return boundaries[index]!;
  }
  return 0;
}

/** Offset of the cluster boundary immediately after `offset`. */
export function nextCluster(line: string, offset: number): number {
  for (const boundary of graphemeBoundaries(line)) {
    if (boundary > offset) return boundary;
  }
  return line.length;
}

/** Start of the word preceding `offset`. */
export function wordStart(line: string, offset: number): number {
  let index = offset;
  while (index > 0 && WHITESPACE.test(line[index - 1]!)) index -= 1;
  while (index > 0 && !WHITESPACE.test(line[index - 1]!)) index -= 1;
  return index;
}

/** End of the word following `offset`, including the whitespace after it. */
export function wordEnd(line: string, offset: number): number {
  let index = offset;
  while (index < line.length && !WHITESPACE.test(line[index]!)) index += 1;
  while (index < line.length && WHITESPACE.test(line[index]!)) index += 1;
  return index;
}
