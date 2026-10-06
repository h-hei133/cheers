import { defaultTheme } from "../../theme/theme.js";
import type { EditorLayout } from "../editor/layout.js";
import { CURSOR_MARKER } from "../render/paint.js";
import { sliceWithWidth, visibleWidth } from "../text/measure.js";
import type { ComposerLayoutRow, ComposerState } from "./contract.js";
import type { ComposerFrame } from "./frame.js";
import type { ComposerShape } from "./shapes.js";

export type EditorRow = EditorLayout["rows"][number];

/** A source EOL caret owns the otherwise empty space to its right for IME. */
export function hasCursorTail(row: EditorRow, source: string): boolean {
  const marker = row.rendered.indexOf(CURSOR_MARKER);
  if (marker < 0) return false;
  return visibleWidth(row.rendered.slice(marker + CURSOR_MARKER.length)) === 0 || source.length === 0;
}

/** Reserve one hardware cursor cell without placing it beyond the terminal. */
function boundCaret(rendered: string, width: number): string {
  const marker = rendered.indexOf(CURSOR_MARKER);
  if (marker < 0 || visibleWidth(rendered.slice(0, marker)) < width) return rendered;
  const plain = rendered.replace(CURSOR_MARKER, "");
  const head = sliceWithWidth(plain, 0, width - 1).text;
  return `${head}${CURSOR_MARKER}${plain.slice(head.length)}`;
}

function sideGlyph(shape: ComposerShape, left: boolean, merged: boolean): string {
  if (shape.side === "caps") return left ? "▐" : "▌";
  if (shape.side === "rail") return left ? "▎" : "│";
  if (shape.side === "round") return merged ? left ? "╰" : "╯" : "│";
  return "";
}

/** Shape rendering and the source cell map are built from the same row geometry. */
export function contentRow(
  row: EditorRow, source: string, shape: ComposerShape, frame: ComposerFrame, state: ComposerState,
  screenRow: number, first: boolean, last: boolean, scrollbarThumb: boolean,
): ComposerLayoutRow {
  const content = source === "" ? defaultTheme.dim(row.rendered) : row.rendered;
  const marker = content.indexOf(CURSOR_MARKER);
  const cursorOverflow = marker < 0 ? 0 : Math.max(0, visibleWidth(content.slice(0, marker)) + 1 - frame.text);
  const imeSafeCursorTail = frame.left > 0 && hasCursorTail(row, source);
  const merged = shape.bottom === "merge" && last && !imeSafeCursorTail;
  const accent = state.busy ? "warning" : "accent";
  const gutter = first ? defaultTheme.fg(accent, sliceWithWidth(shape.gutter, 0, frame.gutter).text) : " ".repeat(frame.gutter);
  const left = frame.left ? defaultTheme.fg(shape.filled ? accent : "border", sideGlyph(shape, true, merged)) : "";
  const padding = " ".repeat(frame.padding);
  const contentColumn = frame.left + frame.gutter + frame.padding;
  const fill = " ".repeat(Math.max(0, frame.text - visibleWidth(content)));
  let interior = gutter + padding + content;
  if (!imeSafeCursorTail) interior += merged ? padding + "─".repeat(fill.length) : fill + padding;
  if (shape.filled && frame.left > 0) interior = defaultTheme.bg("statusBandBg", interior);
  const right = !imeSafeCursorTail && frame.right > 0
    ? defaultTheme.fg(scrollbarThumb ? "scrollbarThumb" : shape.filled ? accent : "border", scrollbarThumb ? "█" : sideGlyph(shape, false, merged)) : "";
  return {
    kind: "content", screenRow, rendered: boundCaret(left + interior + right, frame.width),
    contentColumn, contentCells: frame.text,
    cells: row.cells.map((cell) => ({ ...cell, columnStart: contentColumn + cell.columnStart, columnEnd: contentColumn + cell.columnEnd })),
    sourceStart: row.sourceStart, sourceEnd: row.sourceEnd, breakAfter: row.breakAfter,
    cursorOverflow, imeSafeCursorTail, scrollbarThumb: scrollbarThumb && !imeSafeCursorTail,
  };
}

/** Scrollbar size and position use the editor's total rows and actual viewport. */
export function scrollbarRows(layout: EditorLayout, shape: ComposerShape, frame: ComposerFrame): ReadonlySet<number> {
  if (!frame.right || layout.totalRows <= layout.rows.length) return new Set();
  const eligible = layout.rows.flatMap((row, index) => hasCursorTail(row, layout.source) || (shape.bottom === "merge" && index === layout.rows.length - 1) ? [] : [index]);
  if (eligible.length === 0) return new Set();
  const size = Math.max(1, Math.round(eligible.length * layout.rows.length / layout.totalRows));
  const start = Math.round((eligible.length - size) * layout.viewportStart / (layout.totalRows - layout.rows.length));
  return new Set(eligible.slice(start, start + size));
}
