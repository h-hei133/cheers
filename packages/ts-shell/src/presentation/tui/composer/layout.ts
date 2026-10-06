import { defaultTheme } from "../../theme/theme.js";
import type { Editor } from "../editor.js";
import { CURSOR_MARKER } from "../render/paint.js";
import { sliceWithWidth, visibleWidth } from "../text/measure.js";
import type { ComposerLayout, ComposerLayoutRow } from "./contract.js";

const CUE = "╰─ ";

/** Shrink decoration first, then reduce both padding sides together. */
function geometry(width: number): { readonly width: number; readonly gutter: number; readonly padding: number; readonly text: number } {
  const bounded = Math.max(0, Math.floor(width));
  const gutter = Math.min(visibleWidth(CUE), Math.max(0, bounded - 5));
  const padding = Math.min(2, Math.max(0, Math.floor((bounded - gutter - 1) / 2)));
  return { width: bounded, gutter, padding, text: bounded - gutter - 2 * padding };
}

/** Cells actually available to the editor, including at very narrow widths. */
export function composerTextWidth(width: number): number {
  return geometry(width).text;
}

/** A final-column caret remains in the physical terminal on unpadded rows. */
function boundCaret(rendered: string, width: number): string {
  const marker = rendered.indexOf(CURSOR_MARKER);
  if (marker < 0 || visibleWidth(rendered.slice(0, marker)) < width) return rendered;
  const plain = rendered.replace(CURSOR_MARKER, "");
  const head = sliceWithWidth(plain, 0, width - 1).text;
  return `${head}${CURSOR_MARKER}${plain.slice(head.length)}`;
}

/** The current prompt band decorates the editor's own visible source rows. */
export function layoutComposer(
  editor: Editor, state: { readonly busy: boolean }, width: number, maxRows?: number,
): ComposerLayout {
  const frame = geometry(width);
  const editorLayout = editor.layout(frame.text, maxRows);
  const cue = defaultTheme.fg(state.busy ? "warning" : "accent", sliceWithWidth(CUE, 0, frame.gutter).text);
  const padding = " ".repeat(frame.padding);
  const contentColumn = frame.gutter + frame.padding;
  const rows: ComposerLayoutRow[] = editorLayout.rows.map((row, screenRow) => {
    const gutter = screenRow === 0 ? cue : " ".repeat(frame.gutter);
    const content = editorLayout.source === "" ? defaultTheme.dim(row.rendered) : row.rendered;
    return {
      kind: "content", screenRow,
      rendered: boundCaret(gutter + padding + content + padding, frame.width),
      contentColumn, contentCells: frame.text,
      cells: row.cells.map((cell) => ({
        ...cell, columnStart: contentColumn + cell.columnStart, columnEnd: contentColumn + cell.columnEnd,
      })),
      sourceStart: row.sourceStart, sourceEnd: row.sourceEnd, breakAfter: row.breakAfter,
    };
  });
  return {
    source: editorLayout.source, sourceRevision: editorLayout.sourceRevision,
    viewportStart: editorLayout.viewportStart, width: frame.width, rows, height: rows.length,
  };
}
