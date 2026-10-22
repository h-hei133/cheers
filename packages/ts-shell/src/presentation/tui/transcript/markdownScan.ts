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
  readonly sourceStart: number;
  readonly sourceEnd: number;
}

export interface HeadingBlock {
  readonly kind: "heading";
  /** The marker's own length, which is the level. */
  readonly level: number;
  readonly text: string;
  readonly sourceStart: number;
  readonly sourceEnd: number;
}

export interface RuleBlock {
  readonly kind: "rule";
  readonly sourceStart: number;
  readonly sourceEnd: number;
}

/** A fenced block, with the language from its opening line when it named one. */
export interface FenceBlock {
  readonly kind: "fence";
  readonly language: string;
  readonly lines: readonly string[];
  readonly sourceStart: number;
  readonly sourceEnd: number;
}

export interface TableBlock {
  readonly kind: "table";
  readonly header: string;
  readonly rows: readonly string[];
  readonly sourceStart: number;
  readonly sourceEnd: number;
}

export interface MathBlock {
  readonly kind: "math";
  readonly body: string;
  /** Complete source including delimiters, used when projection is unavailable. */
  readonly raw: string;
  readonly sourceStart: number;
  readonly sourceEnd: number;
}

/** A list item, with the marker kept because its shape is what a reader sees. */
export interface ListBlock {
  readonly kind: "list";
  readonly indent: string;
  readonly marker: string;
  readonly text: string;
  readonly sourceStart: number;
  readonly sourceEnd: number;
}

export interface QuoteBlock {
  readonly kind: "quote";
  readonly text: string;
  readonly sourceStart: number;
  readonly sourceEnd: number;
}

export type MarkdownBlock =
  | TextBlock
  | HeadingBlock
  | RuleBlock
  | FenceBlock
  | TableBlock
  | MathBlock
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
    const sourceStart = index;

    const displayMath = /^\s*(\$\$|\\\[)\s*$/.exec(line);
    if (displayMath) {
      const closing = displayMath[1] === "$$" ? /^\s*\$\$\s*$/ : /^\s*\\\]\s*$/;
      let closingIndex = index + 1;
      while (closingIndex < lines.length && !closing.test(lines[closingIndex]!)) closingIndex += 1;
      if (closingIndex < lines.length) {
        blocks.push({
          kind: "math",
          body: lines.slice(index + 1, closingIndex).join("\n"),
          raw: lines.slice(index, closingIndex + 1).join("\n"),
          sourceStart,
          sourceEnd: closingIndex,
        });
        index = closingIndex + 1;
        continue;
      }
      // An opening delimiter without its pair is ordinary source text. Treating
      // it as math would consume the rest of the answer and drop the delimiter
      // the reader needs to copy.
      while (index < lines.length) {
        blocks.push({ kind: "text", line: lines[index]!, sourceStart: index, sourceEnd: index });
        index += 1;
      }
      break;
    }

    if (TABLE_ROW.test(line) && TABLE_RULE.test(lines[index + 1] ?? "")) {
      const rows: string[] = [];
      let cursor = index + 2;
      while (cursor < lines.length && TABLE_ROW.test(lines[cursor]!)) {
        rows.push(lines[cursor]!);
        cursor += 1;
      }
      blocks.push({ kind: "table", header: line, rows, sourceStart, sourceEnd: cursor - 1 });
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
      const sourceEnd = index < lines.length ? index : lines.length - 1;
      // Past the closing marker when there was one; at the end otherwise.
      index += 1;
      blocks.push({ kind: "fence", language: fence[2] ?? "", lines: body, sourceStart, sourceEnd });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1]!.length, text: heading[2]!, sourceStart, sourceEnd: index });
      index += 1;
      continue;
    }

    if (RULE.test(line)) {
      blocks.push({ kind: "rule", sourceStart, sourceEnd: index });
      index += 1;
      continue;
    }

    const bullet = BULLET.exec(line);
    if (bullet) {
      blocks.push({ kind: "list", indent: bullet[1]!, marker: bullet[2]!, text: bullet[3]!, sourceStart, sourceEnd: index });
      index += 1;
      continue;
    }

    const ordered = ORDERED.exec(line);
    if (ordered) {
      blocks.push({ kind: "list", indent: ordered[1]!, marker: `${ordered[2]}.`, text: ordered[3]!, sourceStart, sourceEnd: index });
      index += 1;
      continue;
    }

    const quote = QUOTE.exec(line);
    if (quote) {
      blocks.push({ kind: "quote", text: quote[1]!, sourceStart, sourceEnd: index });
      index += 1;
      continue;
    }

    blocks.push({ kind: "text", line, sourceStart, sourceEnd: index });
    index += 1;
  }
  return blocks;
}

/** Whether a block's rendering is complete on its own line. */
export function isBlankText(block: MarkdownBlock): boolean {
  return block.kind === "text" && block.line.trim() === "";
}
