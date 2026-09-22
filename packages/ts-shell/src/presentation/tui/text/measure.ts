import { ESC, ansiSequenceEnd, hasAnsi } from "./ansi.js";
import { getClusterWidth } from "./width.js";

/**
 * Cell measurement and cell-accurate slicing for rendered terminal lines.
 *
 * Lines carry escape sequences interleaved with text. Measurement counts only
 * grapheme clusters; slicing carries every escape sequence in the traversed
 * span through to the result so colour state survives a cut, and never splits a
 * cluster or a wide cell.
 */

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

const ASCII_PRINTABLE = /^[\x20-\x7e]*$/;

export interface LineCell {
  /** Grapheme cluster text, without escape sequences. */
  readonly cluster: string;
  /** Cells the cluster occupies: 0, 1, or 2. */
  readonly width: number;
  /** Escape sequences that immediately precede the cluster. */
  readonly prefix: string;
}

/** Visible cells occupied by a rendered line. */
export function visibleWidth(line: string): number {
  if (!line) return 0;
  if (!hasAnsi(line) && ASCII_PRINTABLE.test(line)) return line.length;
  let width = 0;
  for (const cell of lineCells(line)) width += cell.width;
  return width;
}

/**
 * Code-unit offsets at which grapheme clusters begin in plain text, plus the
 * end offset. Cursor motion steps between these so it can never land inside a
 * surrogate pair or between a base character and its combining marks.
 */
export function graphemeBoundaries(text: string): number[] {
  const boundaries: number[] = [];
  for (const { index } of segmenter.segment(text)) boundaries.push(index);
  boundaries.push(text.length);
  return boundaries;
}

/** Ordered visible cells of a rendered line, each carrying its escape prefix. */
export function* lineCells(line: string): Generator<LineCell> {
  let index = 0;
  let prefix = "";
  while (index < line.length) {
    if (line.charCodeAt(index) === 0x1b) {
      const end = ansiSequenceEnd(line, index);
      prefix += line.slice(index, end);
      index = end;
      continue;
    }
    const nextEsc = line.indexOf(ESC, index);
    const plain = nextEsc < 0 ? line.slice(index) : line.slice(index, nextEsc);
    index = nextEsc < 0 ? line.length : nextEsc;
    for (const { segment } of segmenter.segment(plain)) {
      yield { cluster: segment, width: getClusterWidth(segment), prefix };
      prefix = "";
    }
  }
  if (prefix) yield { cluster: "", width: 0, prefix };
}

export interface SliceResult {
  readonly text: string;
  readonly width: number;
}

/**
 * The span of `line` covering visible columns `[startCol, startCol + cells)`.
 *
 * Escape sequences from the skipped prefix are retained so the slice renders
 * with the same colour state it had in place. A wide cluster straddling either
 * boundary is dropped rather than half-rendered.
 */
export function sliceWithWidth(line: string, startCol: number, cells: number): SliceResult {
  if (cells <= 0) return { text: "", width: 0 };
  const endCol = startCol + cells;
  let column = 0;
  let carried = "";
  let text = "";
  let taken = 0;
  let started = false;

  for (const cell of lineCells(line)) {
    if (!started) carried += cell.prefix;
    else text += cell.prefix;
    if (cell.cluster === "") continue;
    const next = column + cell.width;
    if (next <= startCol) {
      column = next;
      continue;
    }
    if (column < startCol || next > endCol) {
      if (column >= endCol) break;
      column = next;
      continue;
    }
    if (!started) {
      text = carried;
      started = true;
    }
    text += cell.cluster;
    taken += cell.width;
    column = next;
    if (column >= endCol) break;
  }

  if (!started) return { text: carried, width: 0 };
  return { text, width: taken };
}
