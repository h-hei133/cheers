import { wrapSegments } from "../text/layout.js";
import { lineCells, visibleWidth, type LineCell } from "../text/measure.js";
import type { SourceCell } from "../composer/contract.js";

export interface VisualRow {
  readonly text: string;
  readonly row: number;
  readonly start: number;
  readonly width: number;
  readonly cells: readonly SourceCell[];
  readonly sourceStart: number;
  readonly sourceEnd: number;
  readonly breakAfter: "soft" | "logical" | "none";
}

export interface EditorLayout {
  readonly source: string;
  readonly sourceRevision: number;
  readonly viewportStart: number;
  readonly rows: readonly (VisualRow & { readonly rendered: string })[];
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
  let sourceOffset = 0;
  for (let row = 0; row < lines.length; row++) {
    const cells = [...editorCells(lines[row]!)];
    const segments = wrapSegments(cells, width);
    let cellIndex = 0;
    let column = 0;
    for (let index = 0; index < segments.length; index++) {
      const segment = segments[index]!;
      const sourceStart = sourceOffset;
      const mapped: SourceCell[] = [];
      let text = "";
      for (; cellIndex < cells.length; cellIndex++) {
        const cell = cells[cellIndex]!;
        if (column >= segment.start + segment.width && cell.width > 0) break;
        const start = sourceOffset;
        sourceOffset += cell.prefix.length + cell.cluster.length;
        const rendered = cell.cluster === "\t" ? " ".repeat(Math.min(TAB_CELLS, width))
          : cell.width > width ? "�" : cell.cluster;
        text += cell.prefix + rendered;
        if (cell.cluster) mapped.push({
          columnStart: column - segment.start,
          columnEnd: column - segment.start + Math.min(cell.width, width),
          sourceStart: start, sourceEnd: sourceOffset,
        });
        column += cell.width;
      }
      rows.push({
        ...segment, row, text, cells: mapped, sourceStart, sourceEnd: sourceOffset,
        breakAfter: index < segments.length - 1 ? "soft" : row < lines.length - 1 ? "logical" : "none",
      });
    }
    sourceOffset += 1;
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
