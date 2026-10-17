import { wrapToWidth } from "../text/layout.js";
import type { Block } from "./blocks.js";

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
  for (const line of lines) {
    text += line.text;
    if (line.breakAfter === "logical") text += "\n";
  }
  return text.replace(/\n+$/, "");
}
