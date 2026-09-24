import type { SelectionPoint, SelectionSpan } from "./selection.js";

/**
 * What a click selects, decided by how many times it was pressed in a row.
 *
 * One click starts a free drag, two take the word under the pointer, three take the
 * whole line. The counts are the convention every editor already has, so a user who
 * has used one knows what these do without being told — which is the only reason to
 * pick these particular numbers.
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

/** The word characters around a column, or nothing when it sits on whitespace. */
function wordBounds(line: string, column: number): { readonly start: number; readonly end: number } | undefined {
  if (line.length === 0) return undefined;
  const clamped = Math.max(0, Math.min(line.length - 1, column));
  if (!isWordCharacter(line[clamped]!)) return undefined;
  let start = clamped;
  let end = clamped;
  while (start > 0 && isWordCharacter(line[start - 1]!)) start -= 1;
  while (end + 1 < line.length && isWordCharacter(line[end + 1]!)) end += 1;
  return { start, end };
}

/**
 * Whether a character belongs to a word.
 *
 * Whitespace separates words; everything else does not. Punctuation sticks to the
 * word it is attached to, so double-clicking `run()` takes the whole call rather
 * than the name — which is what makes the gesture useful on code.
 */
function isWordCharacter(character: string): boolean {
  return !/\s/.test(character);
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

  if (granularity === "line") {
    // To the start of the next row rather than its end: the line break belongs to
    // the line, which is what makes three clicks take a whole line rather than a
    // line and a half.
    return {
      from: { row: point.row, column: 0 },
      to: { row: point.row, column: Math.max(0, line.length - 1) },
    };
  }

  const bounds = wordBounds(line, point.column);
  if (!bounds) return undefined;
  return {
    from: { row: point.row, column: bounds.start },
    to: { row: point.row, column: bounds.end },
  };
}
