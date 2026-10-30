import { highlightSelection, orderSpan, type SelectionPoint } from "../transcript/selection.js";
import type { ComposerLayout, ComposerLayoutRow, SourceSelection } from "./contract.js";

type ContentRow = Extract<ComposerLayoutRow, { readonly kind: "content" }>;

/** Resolve a screen endpoint to a boundary of an entire source grapheme. */
export function sourceBoundary(layout: ComposerLayout, point: SelectionPoint, edge: "start" | "end"): number {
  const content = layout.rows.filter((row): row is ContentRow => row.kind === "content");
  const first = content[0];
  const last = content[content.length - 1];
  if (!first || !last) return 0;
  if (point.row < first.screenRow) return first.sourceStart;
  if (point.row > last.screenRow) return last.sourceEnd;
  const row = content.find((entry) => entry.screenRow === point.row);
  if (!row) {
    return edge === "start" ? content.find((entry) => entry.screenRow > point.row)!.sourceStart
      : content.filter((entry) => entry.screenRow < point.row).at(-1)!.sourceEnd;
  }
  if (point.column < row.contentColumn) return row.sourceStart;
  for (const cell of row.cells) {
    if (point.column < cell.columnStart) return cell.sourceStart;
    if (point.column < cell.columnEnd) return edge === "start" ? cell.sourceStart : cell.sourceEnd;
  }
  return row.sourceEnd;
}

/** Inclusive mouse endpoints become a half-open range in the unchanged source. */
export function selectionFromPoints(layout: ComposerLayout, anchor: SelectionPoint, focus: SelectionPoint): SourceSelection {
  const { from, to } = orderSpan(anchor, focus);
  const start = sourceBoundary(layout, from, "start");
  const end = sourceBoundary(layout, to, "end");
  return { sourceRevision: layout.sourceRevision, start, end: Math.max(start, end) };
}

/** Only mapped source cells are shaded; all chrome and padding remain untouched. */
export function highlightComposer(layout: ComposerLayout, selection?: SourceSelection): string[] {
  return layout.rows.map((row) => {
    if (row.kind !== "content" || !selection || selection.sourceRevision !== layout.sourceRevision || selection.start >= selection.end) {
      return row.rendered;
    }
    const selected = row.cells.filter((cell) => cell.sourceStart < selection.end && cell.sourceEnd > selection.start && cell.columnEnd > cell.columnStart);
    const first = selected[0];
    const last = selected[selected.length - 1];
    if (!first || !last) return row.rendered;
    return highlightSelection([row.rendered], {
      from: { row: 0, column: first.columnStart }, to: { row: 0, column: last.columnEnd - 1 },
    }, true)[0]!;
  });
}
