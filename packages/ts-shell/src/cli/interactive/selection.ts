import { stripAnsi } from "../../presentation/tui/text/ansi.js";
import type { MouseReport } from "../../presentation/tui/input/mouse.js";
import { lineCells, sliceWithWidth, visibleWidth } from "../../presentation/tui/text/measure.js";
import { CURSOR_MARKER } from "../../presentation/tui/render/paint.js";

/**
 * Drag-to-copy over the rows currently on screen.
 *
 * Dragging with the terminal's own selection copies screen *cells*, so every
 * gutter, rail, and indent column comes along and the pasted text arrives broken
 * up by runs of spaces. Owning the drag lets the text be rebuilt from the rows we
 * painted and then stripped back to its content: escape sequences dropped,
 * trailing cells trimmed, and the indentation that every selected row shares
 * removed once rather than repeated on each line.
 *
 * Holding Shift bypasses this and hands the drag back to the terminal, which is
 * how a selection is made across scrollback the screen no longer holds.
 *
 * A selection nobody can see is indistinguishable from no selection at all, so the
 * span is also published for the frame to paint. Owning the drag means owning that
 * too: the terminal is not tracking a selection of its own to shade in for us.
 */

/** Cells a drag must cover before it is treated as a selection rather than a click. */
const MIN_SELECTION_CELLS = 2;

/** A leading marker that is chrome rather than content. */
const RAIL = /^[▌│┃]\s?/;

/** Reverse video on and off, which is how a terminal shades a selection. */
const REVERSE = "\x1b[7m";
const REVERSE_OFF = "\x1b[27m";

export interface ScreenText {
  /** Painted rows of the whole screen, top row first. */
  rows(): readonly string[];
}

interface Anchor {
  readonly row: number;
  readonly column: number;
}

/** A selection in screen coordinates, ordered so `from` precedes `to`. */
export interface SelectionSpan {
  readonly from: Anchor;
  readonly to: Anchor;
}

export class DragSelection {
  private anchor: Anchor | undefined;
  private focus: Anchor | undefined;

  constructor(
    private readonly screen: ScreenText,
    private readonly copy: (text: string) => void,
  ) {}

  /** True while a drag is being tracked, so the frame can be left alone. */
  get dragging(): boolean {
    return this.anchor !== undefined;
  }

  /** The span under the pointer right now, for the frame to shade. */
  get span(): SelectionSpan | undefined {
    if (!this.anchor || !this.focus) return undefined;
    return order(this.anchor, this.focus);
  }

  /** Cancel any in-progress drag without copying. */
  clear(): void {
    this.anchor = undefined;
    this.focus = undefined;
  }

  /** Copy the currently selected text and clear the selection. Returns true if a selection was active. */
  copyAndClear(): boolean {
    const span = this.span;
    if (!span) {
      this.clear();
      return false;
    }
    const text = extractSelection(this.screen.rows(), span.from, span.to);
    this.clear();
    if (text) {
      this.copy(text);
    }
    return true;
  }
  /**
   * Handle one report. Returns false for anything not claimed — a Shift-held
   * drag, the wheel, a non-left button — so the caller can ignore it rather than
   * treat it as a selection.
   */
  handle(report: MouseReport): boolean {
    if (report.shift) {
      this.anchor = undefined;
      return false;
    }
    switch (report.kind) {
      case "press":
        if (report.button !== 0) return false;
        this.anchor = { row: report.row, column: report.column };
        this.focus = this.anchor;
        return true;
      case "drag":
        if (!this.anchor) return false;
        this.focus = { row: report.row, column: report.column };
        return true;
      case "release": {
        const anchor = this.anchor;
        this.anchor = undefined;
        this.focus = undefined;
        if (!anchor) return false;
        // The release carries the final position, which for a drag short enough
        // to produce no motion report is the only place it appears.
        const focus = { row: report.row, column: report.column };
        const text = extractSelection(this.screen.rows(), anchor, focus);
        if (!text) return false;
        this.copy(text);
        return true;
      }
      default:
        return false;
    }
  }
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
  anchor: { readonly row: number; readonly column: number },
  focus: { readonly row: number; readonly column: number },
): string | undefined {
  const ranges = selectedRanges(rows, order(anchor, focus));
  if (ranges.length === 0) return undefined;
  const selected = ranges.map((range) => cellRange(rows[range.row] ?? "", range.start, range.end));
  // A first row cut mid-indent has already lost part of its gutter, so it cannot
  // speak for what the rows below it share.
  const cleaned = clean(selected, ranges[0]!.start === 0 || ranges.length === 1);
  if (cleaned.length === 0) return undefined;
  const text = cleaned.join("\n");
  return text.replace(/\s/g, "").length >= MIN_SELECTION_CELLS ? text : undefined;
}

/**
 * The same rows with the span shaded, so the drag shows what it has covered.
 *
 * The shading is computed from the same ranges the copy is, which is the point:
 * what the user sees highlighted is exactly the text that reaches the clipboard,
 * rather than a second approximation of it that can drift.
 */
export function highlightSelection(rows: readonly string[], span: SelectionSpan): string[] {
  const shaded = [...rows];
  for (const range of selectedRanges(rows, span)) {
    shaded[range.row] = highlightRow(shaded[range.row] ?? "", range.start, range.end);
  }
  return shaded;
}

/** The anchor and focus of a drag in reading order. */
function order(anchor: Anchor, focus: Anchor): SelectionSpan {
  const forward =
    anchor.row < focus.row || (anchor.row === focus.row && anchor.column <= focus.column);
  return forward ? { from: anchor, to: focus } : { from: focus, to: anchor };
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
