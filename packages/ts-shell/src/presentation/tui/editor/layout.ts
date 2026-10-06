import { wrapSegments } from "../text/layout.js";
import { lineCells, sliceWithWidth, visibleWidth, type LineCell } from "../text/measure.js";

interface VisualRow {
  readonly text: string;
  readonly row: number;
  readonly start: number;
  readonly width: number;
}

const TAB_CELLS = 2;

/** Display expansion never changes the editor's source or cursor offsets. */
function displayText(text: string): string {
  return text.replace(/\t/g, " ".repeat(TAB_CELLS));
}

function* editorCells(line: string): Generator<LineCell> {
  for (const cell of lineCells(line)) {
    yield cell.cluster === "\t" ? { ...cell, width: TAB_CELLS } : cell;
  }
}

/** One cell map shared by rendering and vertical navigation. */
export function editorRows(lines: readonly string[], width: number): VisualRow[] {
  const rows: VisualRow[] = [];
  for (let row = 0; row < lines.length; row++) {
    const text = displayText(lines[row]!);
    const segments = wrapSegments(editorCells(lines[row]!), width);
    for (const segment of segments) {
      rows.push({
        ...segment, row,
        text: segments.length === 1 ? text : sliceWithWidth(text, segment.start, segment.width).text,
      });
    }
  }
  return rows;
}

/** A boundary between wrapped rows belongs to the following row. */
export function visualCaret(rows: readonly VisualRow[], row: number, line: string, column: number): {
  readonly index: number;
  readonly column: number;
} {
  const offset = visibleWidth(displayText(line.slice(0, column)));
  const index = rows.findIndex((entry, index) => entry.row === row &&
    (offset < entry.start + entry.width || rows[index + 1]?.row !== row));
  return { index, column: offset - rows[index]!.start };
}

/** Keep a preferred cell column through short rows, always landing on a grapheme. */
export function verticalCaret(
  lines: readonly string[], width: number, row: number, column: number,
  direction: -1 | 1, preferred?: number,
): { readonly row: number; readonly column: number; readonly preferred: number } | undefined {
  const rows = editorRows(lines, width);
  const caret = visualCaret(rows, row, lines[row]!, column);
  const targetIndex = caret.index + direction;
  const target = rows[targetIndex];
  if (!target) return undefined;
  const goal = preferred ?? caret.column;
  const final = rows[targetIndex + 1]?.row !== target.row;
  // The end of a non-final segment is the next row's first column. Clamp before
  // it so an arrow always moves onto the requested row, including wide glyphs.
  const wanted = target.start + Math.min(goal, Math.max(0, target.width - (final ? 0 : 1)));
  let cells = 0;
  let codeUnits = 0;
  for (const cell of editorCells(lines[target.row]!)) {
    if (cells + cell.width > wanted) break;
    cells += cell.width;
    codeUnits += cell.prefix.length + cell.cluster.length;
  }
  return { row: target.row, column: codeUnits, preferred: goal };
}
