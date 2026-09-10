import { stripAnsi } from "../text/ansi.js";
import { lineCells, sliceWithWidth, visibleWidth } from "../text/measure.js";
import { CURSOR_MARKER } from "../render/paint.js";

/**
 * Selection over rendered rows.
 *
 * A drag with the terminal's own selection copies screen *cells*, so every
 * gutter, rail, and indent column comes along and the pasted text arrives broken
 * up by runs of spaces. Owning the selection lets the text be rebuilt from the
 * rows we painted and then stripped back to its content: escape sequences
 * dropped, trailing cells trimmed, and the indentation that every selected row
 * shares removed once rather than repeated on each line.
 *
 * The shading is computed from the same ranges the copy is, which is the point:
 * what the user sees highlighted is exactly the text that reaches the clipboard,
 * rather than a second approximation of it that can drift.
 */

/** Cells a drag must cover before it is treated as a selection rather than a click. */
const MIN_SELECTION_CELLS = 2;

/** A leading marker that is chrome rather than content. */
const RAIL = /^[▌│┃]\s?/;

/** Reverse video on and off, which is how a terminal shades a selection. */
const REVERSE = "\x1b[7m";
const REVERSE_OFF = "\x1b[27m";

export interface SelectionPoint {
  readonly row: number;
  readonly column: number;
}

/** A selection in row/column coordinates, ordered so `from` precedes `to`. */
export interface SelectionSpan {
  readonly from: SelectionPoint;
  readonly to: SelectionPoint;
}

/** The anchor and focus of a drag in reading order. */
export function orderSpan(anchor: SelectionPoint, focus: SelectionPoint): SelectionSpan {
  const forward =
    anchor.row < focus.row || (anchor.row === focus.row && anchor.column <= focus.column);
  return forward ? { from: anchor, to: focus } : { from: focus, to: anchor };
}

/**
 * The content covered by a drag from `anchor` to `focus`, as text worth pasting.
 *
 * The span follows the terminal's own stream model — from the anchor to the end
 * of its row, whole rows through the middle, then the start of the last row — and
 * is then cleaned: a selection is content, not a screenshot.
 */
export function extractSelection(
  rows: readonly string[],
  anchor: SelectionPoint,
  focus: SelectionPoint,
): string | undefined {
  const ranges = selectedRanges(rows, orderSpan(anchor, focus));
  if (ranges.length === 0) return undefined;
  const selected = ranges.map((range) => cellRange(rows[range.row] ?? "", range.start, range.end));
  // A first row cut mid-indent has already lost part of its gutter, so it cannot
  // speak for what the rows below it share.
  const cleaned = clean(selected, ranges[0]!.start === 0 || ranges.length === 1);
  if (cleaned.length === 0) return undefined;
  const text = cleaned.join("\n");
  return text.replace(/\s/g, "").length >= MIN_SELECTION_CELLS ? text : undefined;
}

/** The same rows with the span shaded, so the drag shows what it has covered. */
export function highlightSelection(rows: readonly string[], span: SelectionSpan): string[] {
  const shaded = [...rows];
  for (const range of selectedRanges(rows, span)) {
    shaded[range.row] = highlightRow(shaded[range.row] ?? "", range.start, range.end);
  }
  return shaded;
}

/**
 * Which cells of which rows a span covers.
 *
 * The shape follows the terminal's own stream model — from the anchor to the end
 * of its row, whole rows through the middle, then the start of the last row.
 */
function selectedRanges(
  rows: readonly string[],
  span: SelectionSpan,
): readonly { readonly row: number; readonly start: number; readonly end: number }[] {
  if (rows.length === 0) return [];
  const first = Math.max(0, Math.min(span.from.row, rows.length - 1));
  const last = Math.max(0, Math.min(span.to.row, rows.length - 1));
  // A drag that ran off the bottom of the screen ends at the last row it can, and
  // the column it was released at says nothing about where that row ends.
  const endColumn = span.to.row > last ? Number.MAX_SAFE_INTEGER : span.to.column + 1;
  const ranges: { row: number; start: number; end: number }[] = [];
  for (let row = first; row <= last; row++) {
    ranges.push({
      row,
      start: row === first ? Math.max(0, span.from.column) : 0,
      // The end column is inclusive on screen, so one extra cell is taken.
      end: row === last ? endColumn : Number.MAX_SAFE_INTEGER,
    });
  }
  return ranges;
}

/**
 * One row with cells `[start, end)` in reverse video.
 *
 * Reverse video is re-armed after every escape sequence inside the span, because a
 * style reset in the middle of a shaded run would otherwise end the shading early
 * and leave the selection looking like it stopped there.
 */
function highlightRow(line: string, start: number, end: number): string {
  if (end <= start || line.includes(CURSOR_MARKER)) return line;
  // A blank row inside the span is still selected, and a paragraph break that
  // shows no shading at all makes the selection look broken in two.
  if (visibleWidth(line) === 0) return start === 0 ? `${REVERSE} ${REVERSE_OFF}` : line;
  let column = 0;
  let out = "";
  let inside = false;
  for (const cell of lineCells(line)) {
    if (cell.prefix.length > 0) {
      out += cell.prefix;
      if (inside) out += REVERSE;
    }
    if (cell.cluster === "") continue;
    const next = column + cell.width;
    const selected = column >= start && next <= end;
    if (selected !== inside) {
      out += selected ? REVERSE : REVERSE_OFF;
      inside = selected;
    }
    out += cell.cluster;
    column = next;
  }
  return inside ? out + REVERSE_OFF : out;
}

/** Plain text of the cells `[start, end)` of one painted row. */
function cellRange(line: string, start: number, end: number): string {
  if (end <= start) return "";
  const span = end === Number.MAX_SAFE_INTEGER ? Number.MAX_SAFE_INTEGER - start : end - start;
  return stripAnsi(sliceWithWidth(line, start, span).text);
}

/**
 * Turn selected cells back into text: no escape state, no trailing cells, and no
 * shared indentation. Blank rows inside the span are kept, since a paragraph
 * break is content, but blank rows at either end are not.
 */
function clean(rows: readonly string[], firstRowIsWhole: boolean): string[] {
  const trimmed = rows.map((row) => row.replace(/\s+$/, ""));
  const indent = commonIndent(firstRowIsWhole ? trimmed : trimmed.slice(1));
  const gutter = " ".repeat(indent);
  // The rail sits behind the gutter, so it only comes into view once the shared
  // indentation is gone. A row that does not carry that gutter was cut inside it
  // and has already lost it.
  const dedented = trimmed.map((row) =>
    row.startsWith(gutter) ? row.slice(indent).replace(RAIL, "") : row.replace(RAIL, ""),
  );
  let start = 0;
  let end = dedented.length;
  while (start < end && dedented[start]!.length === 0) start++;
  while (end > start && dedented[end - 1]!.length === 0) end--;
  return dedented.slice(start, end);
}

/** Leading spaces every non-empty row shares, which is layout rather than text. */
function commonIndent(rows: readonly string[]): number {
  let shared: number | undefined;
  for (const row of rows) {
    if (row.length === 0) continue;
    const width = row.length - row.replace(/^ +/, "").length;
    shared = shared === undefined ? width : Math.min(shared, width);
    if (shared === 0) break;
  }
  return shared ?? 0;
}
