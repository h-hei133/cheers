import { visibleWidth } from "../text/measure.js";
import { truncateToWidth } from "../text/layout.js";
import { coalesceAdjacentSgr, LINE_TERMINATOR } from "../text/sgr.js";

/**
 * Escape-sequence construction for one painted frame.
 *
 * The engine decides *what* the screen should hold; this module turns that into
 * bytes. Two paint shapes exist. A diff paint addresses changed rows absolutely
 * and is used whenever geometry is stable and no history is being retired. A
 * scroll paint writes rows separated by CR/LF from an anchor, letting the
 * terminal scroll naturally so retired rows travel into its own scrollback.
 */

/** Zero-width marker a focused component emits where the hardware cursor belongs. */
export const CURSOR_MARKER = "\x1b_c\x07";

const HIDE_CURSOR = "\x1b[?25l";
const SHOW_CURSOR = "\x1b[?25h";
const SYNC_BEGIN = "\x1b[?2026h";
const SYNC_END = "\x1b[?2026l";
const AUTOWRAP_OFF = "\x1b[?7l";
const AUTOWRAP_ON = "\x1b[?7h";
const ERASE_TO_END_OF_LINE = "\x1b[K";
export const ERASE_TO_END_OF_SCREEN = "\x1b[J";

/** Frame prologue: hide the cursor, hold the paint, and stop the terminal wrapping. */
export function paintBegin(synchronized: boolean): string {
  return synchronized ? `${HIDE_CURSOR}${SYNC_BEGIN}${AUTOWRAP_OFF}` : `${HIDE_CURSOR}${AUTOWRAP_OFF}`;
}

/** Frame epilogue, mirroring {@link paintBegin}. */
export function paintEnd(synchronized: boolean): string {
  return synchronized ? `${AUTOWRAP_ON}${SYNC_END}` : AUTOWRAP_ON;
}

/** Absolute cursor placement, 0-based row and column. */
export function moveTo(row: number, column: number): string {
  return `\x1b[${row + 1};${column + 1}H`;
}

/** Erase every cell from `row` to the bottom of the screen. */
export function eraseFromRow(row: number, height: number): string {
  if (row >= height) return "";
  return `${moveTo(row, 0)}${ERASE_TO_END_OF_SCREEN}`;
}

/**
 * One row's worth of bytes: content truncated to the frame width, closed with an
 * attribute reset, and cleared to the right edge so a shorter row cannot leave
 * the previous frame's tail behind.
 */
export function prepareRow(raw: string, width: number): string {
  const fitted = visibleWidth(raw) > width ? truncateToWidth(raw, width) : raw;
  const coalesced = coalesceAdjacentSgr(fitted);
  return coalesced.length === 0 ? "" : `${coalesced}${LINE_TERMINATOR}`;
}

/** {@link prepareRow} across a frame, with the cursor marker stripped out. */
export function prepareRows(rows: readonly string[], width: number): string[] {
  const prepared: string[] = [];
  for (const row of rows) {
    prepared.push(prepareRow(row.includes(CURSOR_MARKER) ? row.split(CURSOR_MARKER).join("") : row, width));
  }
  return prepared;
}

export interface CursorTarget {
  readonly row: number;
  readonly column: number;
}

/**
 * Screen position of the cursor marker within `rows`, or null when no row
 * carries one. `top` is the screen row the frame starts on.
 */
export function cursorTarget(rows: readonly string[], top: number, height: number): CursorTarget | null {
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index]!;
    const marker = row.indexOf(CURSOR_MARKER);
    if (marker < 0) continue;
    const screenRow = top + index;
    if (screenRow < 0 || screenRow >= height) return null;
    return { row: screenRow, column: visibleWidth(row.slice(0, marker)) };
  }
  return null;
}

/** The trailing `height` rows of a frame, so a frame can never overrun the screen. */
export function clampToHeight(rows: readonly string[], height: number): readonly string[] {
  if (height <= 0) return [];
  return rows.length <= height ? rows : rows.slice(rows.length - height);
}

/** Rows padded to exactly `height`, so a short frame still clears what it replaced. */
export function padToHeight(rows: readonly string[], height: number): string[] {
  const padded = [...rows.slice(0, height)];
  while (padded.length < height) padded.push("");
  return padded;
}

/** Absolute rewrites for the rows that differ between two prepared frames. */
export function diffPaint(previous: readonly string[], next: readonly string[], top: number, height: number): string {
  let buffer = "";
  for (let index = 0; index < next.length; index++) {
    if (previous[index] === next[index]) continue;
    buffer += `${moveTo(top + index, 0)}${next[index] ?? ""}${ERASE_TO_END_OF_LINE}`;
  }
  if (previous.length > next.length && top + next.length < height) {
    buffer += eraseFromRow(top + next.length, height);
  }
  return buffer;
}

export const ENTER_ALT_SCREEN = "\x1b[?1049h";
export const EXIT_ALT_SCREEN = "\x1b[?1049l";

/** Every row rewritten from the top, for a frame with no previous state to diff. */
export function fullPaint(rows: readonly string[], height: number): string {
  let buffer = `${moveTo(0, 0)}${ERASE_TO_END_OF_SCREEN}`;
  for (let index = 0; index < Math.min(rows.length, height); index++) {
    buffer += `${moveTo(index, 0)}${rows[index] ?? ""}${ERASE_TO_END_OF_LINE}`;
  }
  return buffer;
}

/** Cursor epilogue: pin and reveal at `target`, or park it hidden at `parkRow`. */
export function cursorPaint(target: CursorTarget | null, parkRow: number): string {
  if (target) return `${moveTo(target.row, target.column)}${SHOW_CURSOR}`;
  return `${HIDE_CURSOR}${moveTo(parkRow, 0)}`;
}
