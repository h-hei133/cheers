import type { SelectionPoint, SelectionSpan } from "../../presentation/tui/transcript/selection.js";
import { lineCells } from "../../presentation/tui/text/measure.js";

/**
 * What a click selects, decided by how many times it was pressed in a row.
 *
 * One click starts a free drag, two take the word under the pointer, three take the
 * whole line. The counts are the convention every editor already has, so a user who
 * has used one knows what these do without being told — which is the only reason to
 * pick these particular numbers.
 *
 * Every column this module answers with — and every column it is asked about — is a
 * cell on screen, not an offset into the line's raw string. A rendered line carries
 * its styling as escape sequences between the characters: ten or more code units
 * each, zero cells on screen. A pointer that names a cell therefore has nothing to
 * do with the string offset at the same number, and the two drift apart further
 * right the user clicks. Reading the raw string at a pointer's column is what made a
 * word come back sliced into a fragment ("ove" for "over") once the click passed the
 * line's first style change, while a plain drag over the same line stayed correct —
 * the extraction path was already speaking cells, and only the word and line
 * boundaries were not.
 */

/** How long a second press counts as a continuation rather than a new click. */
export const MULTI_CLICK_INTERVAL_MS = 500;

export type ClickGranularity = "word" | "line";

export interface ClickRecord {
  readonly row: number;
  readonly column: number;
  readonly at: number;
  readonly count: number;
}

/**
 * The click count for a press at this point, given the last one.
 *
 * A press continues the previous run when it lands on the same cell in time. Same
 * cell rather than nearby: a slightly moved pointer is a drag, and counting it as a
 * double click would select a word when the user was trying to select a phrase.
 *
 * The count runs 1, 2, 3 and then starts again, so a fourth press begins a new
 * drag rather than cycling to something with no meaning.
 */
export function nextClickCount(
  previous: ClickRecord | undefined,
  point: { readonly row: number; readonly column: number },
  now: number,
): number {
  if (
    previous &&
    previous.row === point.row &&
    previous.column === point.column &&
    now - previous.at <= MULTI_CLICK_INTERVAL_MS
  ) {
    return previous.count >= 3 ? 1 : previous.count + 1;
  }
  return 1;
}

/** The cells of a rendered line, addressed by the column where each one starts. */
function cellsAt(line: string, column: number): { readonly index: number; readonly at: number } | undefined {
  const cells = [...lineCells(line)];
  if (cells.length === 0) return undefined;

  // The cell whose span of columns contains the pointer's. A click past the end of
  // the line is clamped to its own last cell, so it still answers with real text
  // rather than with nothing.
  let at = 0;
  let index = Math.min(cells.length - 1, Math.max(0, Math.floor(column)));
  for (let scan = 0; scan < index; scan += 1) at += cells[scan]!.width;
  while (index > 0 && at > column) {
    index -= 1;
    at -= cells[index]!.width;
  }
  return { index, at };
}

/**
 * The characters around a visible column that share its word-or-whitespace class.
 *
 * The run is found among the line's visible clusters, and the answer is a span of
 * cell columns. A wide cluster owns two columns and is one character to this scan:
 * the run crosses it in a single step, and it can never end between its halves.
 */
function runBounds(
  line: string,
  column: number,
): { readonly start: number; readonly end: number; readonly wordLike: boolean } | undefined {
  const cells = [...lineCells(line)];
  const located = cellsAt(line, column);
  if (cells.length === 0 || !located) return undefined;

  const wordLike = isWordCharacter(cells[located.index]!.cluster);
  let start = located.index;
  let end = located.index;
  let startColumn = located.at;
  let endColumn = located.at + cells[located.index]!.width;
  while (start > 0 && isWordCharacter(cells[start - 1]!.cluster) === wordLike) {
    start -= 1;
    startColumn -= cells[start]!.width;
  }
  while (end + 1 < cells.length && isWordCharacter(cells[end + 1]!.cluster) === wordLike) {
    end += 1;
    endColumn += cells[end]!.width;
  }
  return { start: startColumn, end: endColumn - 1, wordLike };
}

/** The word characters around a visible column, or nothing when it sits on a gap. */
function wordBounds(line: string, column: number): { readonly start: number; readonly end: number } | undefined {
  const run = runBounds(line, column);
  return run?.wordLike ? { start: run.start, end: run.end } : undefined;
}

/**
 * Whether a visible cluster belongs to a word.
 *
 * Whitespace separates words; everything else does not. Punctuation sticks to the
 * word it is attached to, so double-clicking `run()` takes the whole call rather
 * than the name — which is what makes the gesture useful on code. It is asked about
 * clusters, not code units: an escape sequence is not a cluster and never reaches
 * it.
 */
function isWordCharacter(cluster: string): boolean {
  return !/\s/.test(cluster);
}

/** The whole row as a span, in the cells the row actually occupies. */
function lineSpan(row: number, line: string): SelectionSpan {
  // To the start of the next row rather than its end: the line break belongs to
  // the line, which is what makes three clicks take a whole line rather than a
  // line and a half. The width is counted in cells for the same reason as every
  // other boundary here: the raw string is longer than the row by however much
  // styling its characters carry.
  const cells = [...lineCells(line)];
  const width = cells.reduce((total, cell) => total + cell.width, 0);
  return { from: { row, column: 0 }, to: { row, column: Math.max(0, width - 1) } };
}

/**
 * What a click of this many presses selects.
 *
 * A word click on whitespace selects nothing rather than the whitespace run: there
 * is no word there, and selecting the gap would look like the gesture failed at
 * random. Returned as a span so the caller can hand it straight to the drag.
 */
export function spanForClick(
  rows: readonly string[],
  point: SelectionPoint,
  granularity: ClickGranularity,
): SelectionSpan | undefined {
  const line = rows[point.row];
  if (line === undefined) return undefined;

  if (granularity === "line") return lineSpan(point.row, line);

  const bounds = wordBounds(line, point.column);
  if (!bounds) return undefined;
  return {
    from: { row: point.row, column: bounds.start },
    to: { row: point.row, column: bounds.end },
  };
}

/**
 * The unit a drag covers at a point, so a word or line selection keeps following
 * the pointer.
 *
 * Separate from `spanForClick` because the two answer different questions. A click
 * on whitespace takes nothing — a gap is not a word, and taking it would look like
 * the gesture failed at random. A drag across a gap still has to move: keeping the
 * last word's bounds would freeze the selection under a pointer that is plainly
 * moving, so the gap is a unit here too. The bounds are always whole units, so a
 * drag never leaves a selection ending mid-word.
 */
export function spanForDrag(
  rows: readonly string[],
  point: SelectionPoint,
  granularity: ClickGranularity,
): SelectionSpan | undefined {
  const line = rows[point.row];
  if (line === undefined) return undefined;
  if (granularity === "line") return lineSpan(point.row, line);

  const run = runBounds(line, point.column);
  if (!run) return undefined;
  return {
    from: { row: point.row, column: run.start },
    to: { row: point.row, column: run.end },
  };
}
