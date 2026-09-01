import { defaultTheme } from "../../theme/theme.js";
import { wrapToWidth } from "../text/layout.js";
import { visibleWidth } from "../text/measure.js";

/**
 * Markdown rendering for assistant prose.
 *
 * Models answer in Markdown, so showing the source verbatim leaves the reader to
 * parse `**` and backticks by eye. This covers the constructs that actually carry
 * meaning in an answer — headings, lists, quotes, inline code, emphasis, and
 * fenced blocks — and deliberately stops there: anything more needs a real
 * CommonMark parser, and guessing at the rest produces worse output than leaving
 * it as text.
 *
 * Inline styling is applied before wrapping. Width is measured ignoring escape
 * sequences, so a styled span wraps on its visible cells rather than its markup.
 */

const FENCE = /^\s*(`{3,}|~{3,})\s*([\w+-]*)\s*$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^(\s*)([-*+])\s+(.*)$/;
const ORDERED = /^(\s*)(\d+)[.)]\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;
const RULE = /^\s*([-*_])\1{2,}\s*$/;

/** Drop a trailing partial code fence so a streaming block does not flicker. */
export function trimPartialFence(text: string): string {
  const lines = text.split("\n");
  const last = lines[lines.length - 1] ?? "";
  if (/^\s*(`{1,2}|~{1,2})\s*$/.test(last)) {
    lines.pop();
    return lines.join("\n");
  }
  return text;
}

/** Inline emphasis, code spans, and link labels for one line. */
export function renderInline(text: string): string {
  return text
    .replace(/`([^`]+)`/g, (_match, code: string) => `\x1b[48;5;238m ${code} \x1b[49m`)
    .replace(/\*\*([^*]+)\*\*/g, (_match, body: string) => defaultTheme.bold(body))
    .replace(/(^|[^*])\*([^*\n]+)\*/g, (_match, lead: string, body: string) => `${lead}\x1b[3m${body}\x1b[23m`)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label: string, href: string) =>
      `${defaultTheme.fg("accent", label)}${defaultTheme.dim(` (${href})`)}`,
    );
}

/** Rows for Markdown `text` fitted to `width` cells. */
export function renderMarkdown(text: string, width: number): string[] {
  const cells = Math.max(8, width);
  const rows: string[] = [];
  const lines = text.split("\n");
  let index = 0;
  while (index < lines.length) {
    const line = lines[index]!;
    const fence = FENCE.exec(line);
    if (fence) {
      const closing = fence[1]!;
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index]!.trimStart().startsWith(closing)) {
        body.push(lines[index]!);
        index += 1;
      }
      index += 1;
      rows.push(...renderFence(body, fence[2] ?? "", cells));
      continue;
    }
    rows.push(...renderLine(line, cells));
    index += 1;
  }
  return rows;
}

/** One non-fence line, resolved to its block kind. */
function renderLine(line: string, cells: number): string[] {
  if (RULE.test(line)) return [defaultTheme.fg("border", "─".repeat(cells))];
  const heading = HEADING.exec(line);
  if (heading) {
    return wrapWithIndent(defaultTheme.bold(defaultTheme.fg("accent", renderInline(heading[2]!))), "", cells);
  }
  const quote = QUOTE.exec(line);
  if (quote) {
    return wrapWithIndent(defaultTheme.dim(renderInline(quote[1]!)), `${defaultTheme.fg("border", "▏")} `, cells);
  }
  const bullet = BULLET.exec(line);
  if (bullet) {
    const indent = bullet[1] ?? "";
    return wrapWithIndent(renderInline(bullet[3]!), `${indent}${defaultTheme.fg("accent", "•")} `, cells);
  }
  const ordered = ORDERED.exec(line);
  if (ordered) {
    const indent = ordered[1] ?? "";
    return wrapWithIndent(renderInline(ordered[3]!), `${indent}${defaultTheme.fg("accent", `${ordered[2]}.`)} `, cells);
  }
  if (line.trim() === "") return [""];
  return wrapWithIndent(renderInline(line), "", cells);
}

/** A fenced block, framed so its boundaries and language are unmistakable. */
function renderFence(body: readonly string[], language: string, cells: number): string[] {
  const label = language ? ` ${language} ` : " code ";
  const head = defaultTheme.fg("border", `┌${label}${"─".repeat(Math.max(0, cells - visibleWidth(label) - 2))}┐`);
  const rows = [head];
  for (const line of body) {
    for (const wrapped of wrapToWidth(line, Math.max(1, cells - 4))) {
      rows.push(`${defaultTheme.fg("border", "│")} ${wrapped}`);
    }
  }
  rows.push(defaultTheme.fg("border", `└${"─".repeat(Math.max(0, cells - 2))}┘`));
  return rows;
}

/** Wrap `text` behind `marker`, aligning continuation rows under the text. */
function wrapWithIndent(text: string, marker: string, cells: number): string[] {
  const markerWidth = visibleWidth(marker);
  const body = wrapToWidth(text, Math.max(1, cells - markerWidth));
  const continuation = " ".repeat(markerWidth);
  return body.map((row, index) => (index === 0 ? marker : continuation) + row);
}
