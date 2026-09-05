import { defaultTheme } from "../../theme/theme.js";
import { formatCommandLine } from "../../theme/commandHighlight.js";
import { padToWidth, truncateToWidth, wrapToWidth } from "../text/layout.js";
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
const TABLE_ROW = /^\s*\|(.+)\|\s*$/;
const TABLE_RULE = /^\s*\|[\s:|-]+\|\s*$/;

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
    .replace(/`([^`]+)`/g, (_match, code: string) => {
      if (code.includes("/") || code.includes("\\") || /\.[a-zA-Z0-9_-]+$/.test(code)) {
        return defaultTheme.fg("filename", code);
      }
      return defaultTheme.fg("mdCode", code);
    })
    .replace(/\*\*([^*]+)\*\*/g, (_match, body: string) => defaultTheme.bold(body))
    .replace(/(^|[^*])\*([^*\n]+)\*/g, (_match, lead: string, body: string) => `${lead}\x1b[3m${body}\x1b[23m`)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label: string, href: string) =>
      `${defaultTheme.fg("mdLink", label)}${defaultTheme.dim(` (${href})`)}`,
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
    if (TABLE_ROW.test(line) && TABLE_RULE.test(lines[index + 1] ?? "")) {
      const body: string[] = [];
      let cursor = index + 2;
      while (cursor < lines.length && TABLE_ROW.test(lines[cursor]!)) {
        body.push(lines[cursor]!);
        cursor += 1;
      }
      rows.push(...renderTable(line, body, cells));
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
      index += 1;
      rows.push(...renderFence(body, fence[2] ?? "", cells));
      continue;
    }
    rows.push(...renderLine(line, cells));
    index += 1;
  }
  return rows;
}

/**
 * A pipe table, laid out in aligned columns.
 *
 * Left as source text a table is the least readable thing in a terminal — the
 * pipes carry no alignment and every row wraps differently. Columns are sized to
 * their content and then squeezed proportionally to fit the frame, because a
 * table that overflows is worse than one with a truncated cell.
 */
function renderTable(header: string, body: readonly string[], cells: number): string[] {
  const head = splitRow(header);
  const rowsOfCells = body.map(splitRow);
  const widths = columnWidths([head, ...rowsOfCells], cells);
  const line = defaultTheme.fg("border", widths.map((width) => "─".repeat(width)).join("─┼─"));
  const rows = [formatRow(head, widths, true), line];
  for (const row of rowsOfCells) rows.push(formatRow(row, widths, false));
  return rows;
}

function splitRow(line: string): string[] {
  const inner = TABLE_ROW.exec(line)?.[1] ?? "";
  return inner.split("|").map((cell) => cell.trim());
}

/** Column widths sized to content, then scaled down to fit the frame. */
function columnWidths(rows: readonly string[][], cells: number): number[] {
  const count = Math.max(...rows.map((row) => row.length));
  const widths = new Array<number>(count).fill(0);
  for (const row of rows) {
    for (let column = 0; column < count; column++) {
      widths[column] = Math.max(widths[column]!, visibleWidth(row[column] ?? ""));
    }
  }
  const separators = (count - 1) * 3;
  const total = widths.reduce((sum, width) => sum + width, 0) + separators;
  if (total <= cells) return widths;
  const budget = Math.max(count * 3, cells - separators);
  const scale = budget / (total - separators);
  return widths.map((width) => Math.max(3, Math.floor(width * scale)));
}

function formatRow(row: readonly string[], widths: readonly number[], header: boolean): string {
  const cellsText = widths.map((width, column) => {
    const text = row[column] ?? "";
    return padToWidth(truncateToWidth(header ? defaultTheme.bold(text) : renderInline(text), width), width);
  });
  return cellsText.join(defaultTheme.fg("border", " │ "));
}

/** One non-fence line, resolved to its block kind. */
function renderLine(line: string, cells: number): string[] {
  if (RULE.test(line)) return [defaultTheme.fg("border", "─".repeat(cells))];
  const heading = HEADING.exec(line);
  if (heading) {
    return wrapWithIndent(defaultTheme.bold(defaultTheme.fg("mdHeading", renderInline(heading[2]!))), "", cells);
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
  const isBash = language === "bash" || language === "sh" || language === "zsh";
  for (const line of body) {
    for (const wrapped of wrapToWidth(line, Math.max(1, cells - 4))) {
      const styled = isBash ? formatCommandLine(wrapped) : defaultTheme.fg("text", wrapped);
      rows.push(`${defaultTheme.fg("border", "│")} ${styled}`);
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
