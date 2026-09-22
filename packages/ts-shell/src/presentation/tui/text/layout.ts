import { lineCells, sliceWithWidth, visibleWidth } from "./measure.js";

/**
 * Width-bounded line shaping: truncation, padding, and soft wrapping.
 *
 * Every rendered row is produced at an exact cell width. Truncation trades the
 * tail for an ellipsis; wrapping preserves the whole text across as many rows as
 * it needs, breaking on word boundaries where one exists and mid-cluster never.
 */

export const ELLIPSIS = "…";

export type EllipsisMode = "start" | "middle" | "end";

/** `line` cut to at most `cells` visible columns, ellipsised when it does not fit. */
export function truncateToWidth(line: string, cells: number): string {
  if (cells <= 0) return "";
  if (visibleWidth(line) <= cells) return line;
  if (cells === 1) return ELLIPSIS;
  return sliceWithWidth(line, 0, cells - 1).text + ELLIPSIS;
}

/** `line` cut to `cells` columns with the ellipsis placed at the chosen end. */
export function truncateToWidthWithMode(line: string, cells: number, mode: EllipsisMode = "end"): string {
  const width = visibleWidth(line);
  if (cells <= 0) return "";
  if (width <= cells) return line;
  if (cells === 1) return ELLIPSIS;
  if (mode === "start") {
    return ELLIPSIS + sliceWithWidth(line, width - (cells - 1), cells - 1).text;
  }
  if (mode === "middle") {
    const left = Math.floor((cells - 1) / 2);
    const right = cells - 1 - left;
    return `${sliceWithWidth(line, 0, left).text}${ELLIPSIS}${sliceWithWidth(line, width - right, right).text}`;
  }
  return truncateToWidth(line, cells);
}

/** Spaces needed to bring `line` up to `cells` visible columns. */
export function widthPad(line: string, cells: number): string {
  return " ".repeat(Math.max(0, cells - visibleWidth(line)));
}

/** `line` padded with spaces to exactly `cells` columns, truncating if longer. */
export function padToWidth(line: string, cells: number): string {
  const width = visibleWidth(line);
  if (width === cells) return line;
  if (width > cells) return truncateToWidth(line, cells);
  return line + " ".repeat(cells - width);
}

/**
 * `line` soft-wrapped into rows of at most `cells` columns.
 *
 * Breaks after the last space that fits when the row contains one, otherwise at
 * the cell boundary. A cluster wider than the whole row is emitted alone rather
 * than split. Escape sequences preceding a break are carried into the
 * continuation row, so colour state does not reset mid-paragraph.
 */
export function wrapToWidth(line: string, cells: number): string[] {
  if (cells <= 0) return [""];
  const total = visibleWidth(line);
  if (total <= cells) return [line];

  const rows: string[] = [];
  let rowStart = 0;
  let column = 0;
  let lastSpaceEnd = -1;

  for (const cell of lineCells(line)) {
    if (cell.cluster === "") continue;
    const end = column + cell.width;
    if (end > rowStart + cells) {
      let cut = lastSpaceEnd > rowStart ? lastSpaceEnd : column;
      if (cut <= rowStart) cut = end;
      rows.push(sliceWithWidth(line, rowStart, cut - rowStart).text);
      rowStart = cut;
      lastSpaceEnd = -1;
    }
    if (cell.cluster === " ") lastSpaceEnd = end;
    column = end;
  }

  if (column > rowStart || rows.length === 0) {
    rows.push(sliceWithWidth(line, rowStart, column - rowStart).text);
  }
  return rows;
}

/** `text` wrapped at `cells`, reduced to its last `maxRows` rows plus the dropped count. */
export function truncateToVisualLines(
  text: string,
  cells: number,
  maxRows: number,
): { readonly rows: string[]; readonly skipped: number } {
  const rows: string[] = [];
  for (const source of text.split("\n")) rows.push(...wrapToWidth(source, cells));
  if (maxRows <= 0) return { rows: [], skipped: rows.length };
  if (rows.length <= maxRows) return { rows, skipped: 0 };
  return { rows: rows.slice(rows.length - maxRows), skipped: rows.length - maxRows };
}
