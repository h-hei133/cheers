import { wrapToWidth } from "../text/layout.js";
import { stripAnsi } from "../text/ansi.js";
import type { Block } from "./blocks.js";
import { layoutSideBySide } from "./diff.js";
import { renderMarkdownWithSources } from "./markdown.js";

/**
 * Semantic source behind a rendered row.
 *
 * Rows are a projection: gutters, rails, box drawing and soft wrapping are
 * decoration. Copying must return the text the author wrote — with logical line
 * breaks intact and without the wrap points the terminal happened to choose.
 * Only renderers that can state their source produce fragments; a custom row
 * renderer returns nothing rather than letting the copy path guess.
 */
export interface SourceLine {
  /** Index of the block that produced this line, so a selection can stay in one block. */
  readonly block: number;
  /** The source text of this visual line, without its trailing newline. */
  readonly text: string;
  /** `soft` continues the same source line; `logical` ends it. */
  readonly breakAfter: "soft" | "logical";
  /** Old-side source for a side-by-side diff row. */
  readonly left?: string;
  /** New-side source for a side-by-side diff row. */
  readonly right?: string;
  /** Divider column; a selection left of it copies old, right copies new. */
  readonly split?: number;
  /** Stable source node for structured rows that share one source line. */
  readonly node?: number;
  /** Visual row within that source node. */
  readonly nodeRow?: number;
  /** Total visual rows for the source node. */
  readonly nodeRows?: number;
}

interface Projection {
  readonly width: number;
  readonly lines: readonly Omit<SourceLine, "block">[];
}

/** Source text and the wrap width a block's body is laid out at, when known. */
function bodyOf(block: Block, width: number): { text: string; width: number } | undefined {
  if (block.rows) return undefined;
  switch (block.kind) {
    case "user":
      return { text: block.text, width: Math.max(1, width - 4) };
    case "notice":
      return { text: block.text, width: Math.max(1, width) };
    case "assistant":
      // A streaming answer can still gain a fence; only a finalized body has a
      // stable projection, and the markdown renderer may change the row count.
      return block.finalized ? { text: block.text.replace(/\s+$/, ""), width: Math.max(8, width) } : undefined;
    default:
      return undefined;
  }
}

/** Wrap `text` the same way the block renderer does, keeping source offsets. */
export function projectText(text: string, width: number): readonly Omit<SourceLine, "block">[] {
  const lines: Omit<SourceLine, "block">[] = [];
  const body = text.replace(/\s+$/, "");
  if (!body) return lines;
  for (const line of body.split("\n")) {
    const wrapped = wrapToWidth(line, Math.max(1, width));
    for (let index = 0; index < wrapped.length; index++) {
      lines.push({ text: wrapped[index]!, breakAfter: index === wrapped.length - 1 ? "logical" : "soft" });
    }
  }
  return lines;
}

/**
 * One source entry per rendered row.
 *
 * Alignment is checked, not assumed: when the rendered row count differs from
 * the projected count (markdown lists, tables, a collapsed block), the block
 * contributes no source and the caller falls back to rendered-text copying.
 */
export function sourceLinesFor(
  block: Block,
  blockIndex: number,
  width: number,
  rows: readonly string[],
): readonly (SourceLine | undefined)[] {
  if (block.kind === "assistant" && block.finalized) {
    const projected = renderMarkdownWithSources(block.text.replace(/\s+$/, ""), Math.max(8, width));
    const separator = rows.length > 0 && rows[rows.length - 1] === "" ? 1 : 0;
    if (rows.length - separator === projected.rows.length
      && projected.rows.every((row, index) => stripAnsi(row) === stripAnsi(rows[index] ?? ""))) {
      return rows.map((_, index) => {
        const line = projected.sources[index];
        return line ? { ...line, block: blockIndex } : undefined;
      });
    }
  }
  if ((block.kind === "command" || block.kind === "error") && !block.report && !block.diff) {
    const projected = renderMarkdownWithSources(block.text.replace(/\s+$/, ""), Math.max(8, width));
    const separator = rows.length > 0 && rows[rows.length - 1] === "" ? 1 : 0;
    const bodyRows = rows.slice(1, 1 + projected.rows.length);
    if (rows.length - separator === projected.rows.length + 1
      && projected.rows.every((row, index) => stripAnsi(row) === stripAnsi(bodyRows[index] ?? ""))) {
      return rows.map((_, index) => {
        const line = projected.sources[index - 1];
        return line ? { ...line, block: blockIndex } : undefined;
      });
    }
  }
  if (block.diff) {
    // Tool cards frame the diff in a box and use the inner width; command and
    // error blocks render it at full width. The split column is shifted by the
    // card's two-character prefix.
    const framed = block.kind === "tool" && block.collapsed !== true;
    const diffWidth = framed ? Math.max(8, Math.max(16, width - 2) - 2) : Math.max(1, width);
    const layout = layoutSideBySide(block.diff, diffWidth, { sideBySide: diffWidth >= 100 });
    const visible = (row: string): string => {
      const text = stripAnsi(row);
      return (framed ? text.slice(2, 2 + diffWidth) : text).trimEnd();
    };
    // A tool card has its own header rows before the diff; find the block of
    // rows that matches the layout instead of assuming it starts at a fixed offset.
    let offset = -1;
    for (let candidate = 0; candidate + layout.rows.length <= rows.length; candidate++) {
      if (layout.rows.every((row, index) => visible(rows[candidate + index] ?? "") === stripAnsi(row).trimEnd())) { offset = candidate; break; }
    }
    if (offset < 0) return rows.map(() => undefined);
    return rows.map((_, index) => {
      const source = layout.sources[index - offset];
      return source ? { block: blockIndex, text: source.left ?? source.right ?? "", breakAfter: "logical" as const,
        ...source, ...(framed ? { split: source.split + 2 } : {}) } : undefined;
    });
  }
  const body = bodyOf(block, width);
  if (!body) return rows.map(() => undefined);
  const projected = projectText(body.text, body.width);
  const separator = rows.length > 0 && rows[rows.length - 1] === "" ? 1 : 0;
  if (rows.length - separator !== projected.length) return rows.map(() => undefined);
  return rows.map((_, index) => {
    const line = projected[index];
    return line ? { ...line, block: blockIndex } : undefined;
  });
}

/** Join fully selected source lines, honouring soft and logical breaks. */
export function joinSourceLines(lines: readonly SourceLine[]): string {
  let text = "";
  let previousNode: number | undefined;
  for (const line of lines) {
    if (line.node !== undefined && line.node === previousNode) {
      if (line.breakAfter === "logical") text += "\n";
      continue;
    }
    text += line.text;
    if (line.breakAfter === "logical") text += "\n";
    previousNode = line.node;
  }
  return text.replace(/\n+$/, "");
}
