import { graphemeBoundaries } from "./measure.js";

/**
 * Caret motion offsets within a single plain-text line.
 *
 * Cluster steps keep the caret on grapheme boundaries, so one keypress never
 * lands inside a surrogate pair or between a base character and its combining
 * marks. Word steps follow Unicode word boundaries, so scripts without spaces
 * remain navigable. Consecutive punctuation stays one motion unit.
 */

const WHITESPACE = /\s/;
const wordSegmenter = new Intl.Segmenter(undefined, { granularity: "word" });

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
  const segments = [...wordSegmenter.segment(line.slice(0, offset))];
  while (segments.length && WHITESPACE.test(segments.at(-1)!.segment)) segments.pop();
  const last = segments.pop();
  if (!last) return 0;
  let start = last.index;
  if (!last.isWordLike) {
    while (segments.length && !segments.at(-1)!.isWordLike && !WHITESPACE.test(segments.at(-1)!.segment)) {
      start = segments.pop()!.index;
    }
  }
  return start;
}

/** End of the word following `offset`, including the whitespace after it. */
export function wordEnd(line: string, offset: number): number {
  const segments = [...wordSegmenter.segment(line.slice(offset))];
  const first = segments[0];
  if (!first) return line.length;
  let index = 0;
  if (!WHITESPACE.test(first.segment)) {
    index = 1;
    if (!first.isWordLike) {
      while (index < segments.length && !segments[index]!.isWordLike && !WHITESPACE.test(segments[index]!.segment)) index++;
    }
  }
  // Keep the editor's existing forward-motion contract: include trailing space.
  while (index < segments.length && WHITESPACE.test(segments[index]!.segment)) index++;
  return offset + (segments[index]?.index ?? line.length - offset);
}
