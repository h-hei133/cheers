import { visibleWidth } from "../text/measure.js";
import { truncateToWidth } from "../text/layout.js";
import { coalesceAdjacentSgr, LINE_TERMINATOR } from "../text/sgr.js";

/**
 * Escape-sequence construction for one painted frame.
 *
 * The engine decides *what* the screen should hold; this module turns that into
 * bytes. Two paint shapes exist while the session runs: a diff paint addresses
 * changed rows absolutely and is used whenever geometry is stable, and a full
 * paint rewrites every row after a resize or a forced frame. A third shape runs
 * once, on leaving: the screen is given back and the document is written below
 * whatever the terminal had, so it lands in scrollback the user keeps.
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
const ERASE_LINE = "\x1b[2K";
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

/**
 * Give the screen back and leave `rows` under whatever the terminal had.
 *
 * The alternate screen has no scrollback, so everything on it is lost the moment
 * it is left; the document written here is what the user gets to scroll back to
 * and copy from once the session is over. Autowrap is off while the rows go out
 * so a row that fills the width cannot spill into an empty line, and each row
 * erases its line first because the restored screen may still hold the tail of
 * what was there before the session began. The rows must already be prepared.
 */
export function leaveScreen(rows: readonly string[], synchronized: boolean): string {
  if (rows.length === 0) return EXIT_ALT_SCREEN;
  let buffer = `${synchronized ? SYNC_BEGIN : ""}${EXIT_ALT_SCREEN}${AUTOWRAP_OFF}`;
  for (let index = 0; index < rows.length; index++) {
    if (index > 0) buffer += "\r\n";
    buffer += `\r${ERASE_LINE}${rows[index] ?? ""}`;
  }
  return `${buffer}\x1b[0m${AUTOWRAP_ON}\r\n${SHOW_CURSOR}${synchronized ? SYNC_END : ""}`;
}

/** Cursor epilogue: pin and reveal at `target`, or park it hidden at `parkRow`. */
export function cursorPaint(target: CursorTarget | null, parkRow: number): string {
  if (target) return `${moveTo(target.row, target.column)}${SHOW_CURSOR}`;
  return `${HIDE_CURSOR}${moveTo(parkRow, 0)}`;
}
