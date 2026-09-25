/**
 * Markdown split into blocks, without deciding how they look.
 *
 * The terminal renderer and the exported page show the same conversation, and
 * they must agree on what the text *is* — where a table starts, which lines are
 * a fenced block, what a heading says. Only the presentation differs: one draws
 * coloured rows fitted to a terminal width, the other emits semantic markup.
 *
 * Keeping the decision in one place is the point. Two scanners would drift, and
 * the drift would be invisible until someone noticed the same answer reading
 * differently in the two views. So this answers "what is this" and nothing else;
 * neither renderer's concerns appear here.
 */

/** One line that carries no structure of its own. */
export interface TextBlock {
  readonly kind: "text";
  readonly line: string;
}

export interface HeadingBlock {
  readonly kind: "heading";
  /** The marker's own length, which is the level. */
  readonly level: number;
  readonly text: string;
}

export interface RuleBlock {
  readonly kind: "rule";
}

/** A fenced block, with the language from its opening line when it named one. */
export interface FenceBlock {
  readonly kind: "fence";
  readonly language: string;
  readonly lines: readonly string[];
}

export interface TableBlock {
  readonly kind: "table";
  readonly header: string;
  readonly rows: readonly string[];
}

/** A list item, with the marker kept because its shape is what a reader sees. */
export interface ListBlock {
  readonly kind: "list";
  readonly indent: string;
  readonly marker: string;
  readonly text: string;
}

export interface QuoteBlock {
  readonly kind: "quote";
  readonly text: string;
}

export type MarkdownBlock =
  | TextBlock
  | HeadingBlock
  | RuleBlock
  | FenceBlock
  | TableBlock
  | ListBlock
  | QuoteBlock;

const FENCE = /^\s*(`{3,}|~{3,})\s*([\w+-]*)\s*$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^(\s*)([-*+])\s+(.*)$/;
const ORDERED = /^(\s*)(\d+)[.)]\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;
const RULE = /^\s*([-*_])\1{2,}\s*$/;
const TABLE_ROW = /^\s*\|(.+)\|\s*$/;
const TABLE_RULE = /^\s*\|[\s:|-]+\|\s*$/;

/**
 * `text` as blocks, in order.
 *
 * A table is recognised by its rule line rather than by its pipes, because a
 * single line with pipes in it is ordinary prose far more often than it is a
 * one-row table. A fence runs to its closing marker or to the end of the text,
 * which is what makes an unterminated fence render as code rather than as a
 * paragraph that happens to start with backticks.
 */
export function scanBlocks(text: string): readonly MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const lines = text.split("\n");
  let index = 0;
  while (index < lines.length) {
    const line = lines[index]!;

    if (TABLE_ROW.test(line) && TABLE_RULE.test(lines[index + 1] ?? "")) {
      const rows: string[] = [];
      let cursor = index + 2;
      while (cursor < lines.length && TABLE_ROW.test(lines[cursor]!)) {
        rows.push(lines[cursor]!);
        cursor += 1;
      }
      blocks.push({ kind: "table", header: line, rows });
      index = cursor;
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence) {
      const closing = fence[1]!;
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index]!.trimStart().startsWith(closing)) {
        body.push(lines[index]!);
        index += 1;
      }
      // Past the closing marker when there was one; at the end otherwise.
      index += 1;
      blocks.push({ kind: "fence", language: fence[2] ?? "", lines: body });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1]!.length, text: heading[2]! });
      index += 1;
      continue;
    }

    if (RULE.test(line)) {
      blocks.push({ kind: "rule" });
      index += 1;
      continue;
    }

    const bullet = BULLET.exec(line);
    if (bullet) {
      blocks.push({ kind: "list", indent: bullet[1]!, marker: bullet[2]!, text: bullet[3]! });
      index += 1;
      continue;
    }

    const ordered = ORDERED.exec(line);
    if (ordered) {
      blocks.push({ kind: "list", indent: ordered[1]!, marker: `${ordered[2]}.`, text: ordered[3]! });
      index += 1;
      continue;
    }

    const quote = QUOTE.exec(line);
    if (quote) {
      blocks.push({ kind: "quote", text: quote[1]! });
      index += 1;
      continue;
    }

    blocks.push({ kind: "text", line });
    index += 1;
  }
  return blocks;
}

/** Whether a block's rendering is complete on its own line. */
export function isBlankText(block: MarkdownBlock): boolean {
  return block.kind === "text" && block.line.trim() === "";
}
