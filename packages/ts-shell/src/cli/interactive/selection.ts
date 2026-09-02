import { stripAnsi } from "../../presentation/tui/text/ansi.js";
import type { MouseReport } from "../../presentation/tui/input/mouse.js";
import { sliceWithWidth } from "../../presentation/tui/text/measure.js";

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
 */

/** Cells a drag must cover before it is treated as a selection rather than a click. */
const MIN_SELECTION_CELLS = 2;

/** A leading marker that is chrome rather than content. */
const RAIL = /^[▌│┃]\s?/;

export interface ScreenText {
  /** Painted rows of the whole screen, top row first. */
  rows(): readonly string[];
}

interface Anchor {
  readonly row: number;
  readonly column: number;
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
  const forward =
    anchor.row < focus.row || (anchor.row === focus.row && anchor.column <= focus.column);
  const from = forward ? anchor : focus;
  const to = forward ? focus : anchor;
  if (rows.length === 0) return undefined;
  const first = Math.max(0, Math.min(from.row, rows.length - 1));
  const last = Math.max(0, Math.min(to.row, rows.length - 1));
  // A drag that ran off the bottom of the screen ends at the last row it can, and
  // the column it was released at says nothing about where that row ends.
  const endColumn = to.row > last ? Number.MAX_SAFE_INTEGER : to.column + 1;

  const selected: string[] = [];
  for (let row = first; row <= last; row++) {
    const line = rows[row] ?? "";
    const start = row === first && from.row >= 0 ? from.column : 0;
    // The end column is inclusive on screen, so one extra cell is taken.
    const end = row === last ? endColumn : Number.MAX_SAFE_INTEGER;
    selected.push(cellRange(line, start, end));
  }
  // A first row cut mid-indent has already lost part of its gutter, so it cannot
  // speak for what the rows below it share.
  const cleaned = clean(selected, from.column === 0 || first === last);
  if (cleaned.length === 0) return undefined;
  const text = cleaned.join("\n");
  return text.replace(/\s/g, "").length >= MIN_SELECTION_CELLS ? text : undefined;
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
