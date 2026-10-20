import { defaultTheme } from "../../theme/theme.js";
import { highlightCode } from "../../theme/syntax.js";
import { padToWidth, truncateToWidth, wrapToWidth } from "../text/layout.js";
import { graphemeBoundaries, visibleWidth } from "../text/measure.js";
import { DIAGRAM_LANGUAGE, renderDiagram } from "./mermaid.js";
import { scanBlocks } from "./markdownScan.js";
import { latexToText, projectMath } from "./math.js";
import { splitTableRow } from "./table.js";
import { inlineWithinBudget, transformInline, type InlineContext } from "../text/inline.js";
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

/** Bounds that keep one table from becoming the whole frame. */
const MAX_TABLE_COLUMNS = 16;
const MAX_TABLE_ROWS = 200;
const MAX_CELL_BYTES = 4096;
const MAX_CELL_LINES = 8;
const MAX_RAW_TABLE_ROWS = 400;
const MAX_RAW_TABLE_BYTES = 64 * 1024;

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
  return renderInlineAt(text);
}

function renderInlineAt(text: string, context?: InlineContext): string {
  if (!inlineWithinBudget(text, context)) return text;
  return transformInline(projectMath(text), {
    renderCode: (code) => {
      if (code.includes("/") || code.includes("\\") || /\.[a-zA-Z0-9_-]+$/.test(code)) {
        return defaultTheme.fg("filename", code);
      }
      return defaultTheme.fg("mdCode", code);
    },
    renderText: renderPlainInline,
    renderLink: (label, href, next) =>
      `${defaultTheme.fg("mdLink", renderInlineAt(label, next))}${defaultTheme.fg("mdLinkUrl", ` (${href})`)}`,
  }, context);
}

function renderPlainInline(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, (_match, body: string) => defaultTheme.bold(body))
    .replace(/(^|[^*])\*([^*\n]+)\*/g, (_match, lead: string, body: string) => `${lead}\x1b[3m${body}\x1b[23m`);
}

/**
 * Rows for Markdown `text` fitted to `width` cells.
 *
 * The block kinds come from `scanBlocks`, so this decides only how each one
 * looks. The exported page uses the same scan and a different renderer, which is
 * what keeps one answer reading the same in both.
 */
export function renderMarkdown(text: string, width: number): string[] {
  const cells = Math.max(8, width);
  const rows: string[] = [];
  for (const block of scanBlocks(text)) {
    switch (block.kind) {
      case "table":
        rows.push(...renderTable(block.header, block.rows, cells));
        break;
      case "math": {
        const projected = latexToText(block.body) ?? block.raw;
        rows.push(...wrapWithIndent(defaultTheme.fg("mdHeading", projected), "", cells));
        break;
      }
      case "fence":
        rows.push(...renderFence(block.lines, block.language, cells));
        break;
      case "heading":
        rows.push(...wrapWithIndent(
          defaultTheme.bold(defaultTheme.fg("mdHeading", renderInline(block.text))), "", cells,
        ));
        break;
      case "rule":
        rows.push(defaultTheme.fg("mdRule", "─".repeat(cells)));
        break;
      case "list": {
        const glyph = /^\d+$/.test(block.marker.replace(/\.$/, "")) ? `${block.marker}` : "•";
        rows.push(...wrapWithIndent(
          renderInline(block.text), `${block.indent}${defaultTheme.fg("mdListBullet", glyph)} `, cells,
        ));
        break;
      }
      case "quote":
        rows.push(...wrapWithIndent(
          defaultTheme.fg("mdQuoteText", renderInline(block.text)), `${defaultTheme.fg("mdQuoteBorder", "▏")} `, cells,
        ));
        break;
      default:
        rows.push(...wrapWithIndent(
          block.line.trim() === "" ? "" : renderInline(block.line), "", cells,
        ));
        break;
    }
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
  const head = splitTableRow(header);
  const rowsOfCells = body.map(splitTableRow);
  const columns = Math.max(head.length, ...rowsOfCells.map(row => row.length));
  const bytes = [header, ...body].reduce((sum, line) => sum + Buffer.byteLength(line, "utf8"), 0);
  const separators = (columns - 1) * 3;
  // A table that cannot keep three readable cells per column, or that exceeds
  // the column/row/byte budget, is shown as its own source instead of losing
  // the tail of every cell.
  if (columns > MAX_TABLE_COLUMNS || rowsOfCells.length > MAX_TABLE_ROWS || bytes > MAX_CELL_BYTES * 4
    || columns * 5 + separators > cells) return rawTable(header, body, cells);
  const rows = [head, ...rowsOfCells];
  if (rows.some(row => row.some(cell => Buffer.byteLength(cell, "utf8") > MAX_CELL_BYTES))) {
    return rawTable(header, body, cells);
  }
  const widths = columnWidths(rows, cells);
  if (!tableCellsFit(rows, widths)) return rawTable(header, body, cells);
  const line = defaultTheme.fg("border", widths.map((width) => "─".repeat(width)).join("─┼─"));
  const rendered = [...formatRow(head, widths, true), line];
  for (const row of rowsOfCells) rendered.push(...formatRow(row, widths, false));
  return rendered;
}

function tableCellsFit(rows: readonly string[][], widths: readonly number[]): boolean {
  for (const row of rows) {
    for (let column = 0; column < widths.length; column++) {
      let lines = 0;
      for (const segment of (row[column] ?? "").split(/<br\s*\/?>/i)) {
        lines += wrapToWidth(segment, widths[column]!).length;
      }
      if (lines > MAX_CELL_LINES) return false;
    }
  }
  return true;
}

/** The original table, wrapped rather than truncated, when layout cannot help. */
function rawTable(header: string, body: readonly string[], cells: number): string[] {
  const rows: string[] = [];
  const marker = defaultTheme.dim("… table truncated by the view budget");
  const markerBytes = Buffer.byteLength(marker, "utf8");
  let bytes = 0;
  let truncated = false;
  for (const line of [header, ...body]) {
    const lineBytes = Buffer.byteLength(line, "utf8");
    const bounded = truncateUtf8(line, MAX_RAW_TABLE_BYTES);
    if (lineBytes > MAX_RAW_TABLE_BYTES) truncated = true;
    for (const row of wrapToWidth(defaultTheme.dim(bounded), cells)) {
      const rowBytes = Buffer.byteLength(row, "utf8");
      const nextBytes = bytes + rowBytes + (rows.length > 0 ? 1 : 0);
      if (rows.length >= MAX_RAW_TABLE_ROWS || nextBytes > MAX_RAW_TABLE_BYTES) {
        truncated = true;
        break;
      }
      rows.push(row);
      bytes = nextBytes;
    }
    if (truncated) break;
  }
  if (truncated) {
    while (rows.length >= MAX_RAW_TABLE_ROWS
      || (rows.length > 0 && bytes + 1 + markerBytes > MAX_RAW_TABLE_BYTES)) {
      const removed = rows.pop();
      if (removed === undefined) break;
      bytes -= Buffer.byteLength(removed, "utf8") + (rows.length > 0 ? 1 : 0);
    }
    if (bytes + markerBytes + (rows.length > 0 ? 1 : 0) <= MAX_RAW_TABLE_BYTES) rows.push(marker);
  }
  return rows;
}

/** Cut at a grapheme boundary without exceeding a UTF-8 byte budget. */
function truncateUtf8(text: string, maxBytes: number): string {
  if (maxBytes <= 0) return "";
  if (Buffer.byteLength(text, "utf8") <= maxBytes) return text;
  const boundaries = graphemeBoundaries(text);
  let bytes = 0;
  let end = 0;
  for (let index = 1; index < boundaries.length; index++) {
    const boundary = boundaries[index]!;
    const size = Buffer.byteLength(text.slice(boundaries[index - 1]!, boundary), "utf8");
    if (bytes + size > maxBytes) break;
    bytes += size;
    end = boundary;
  }
  return text.slice(0, end);
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
  const scaled = widths.map((width) => Math.max(3, Math.floor(width * scale)));
  // The floor above can overshoot when several columns are already at three;
  // shave the widest column until the row really fits.
  while (scaled.reduce((sum, width) => sum + width, 0) + separators > cells) {
    const widest = scaled.indexOf(Math.max(...scaled));
    if (scaled[widest]! <= 3) break;
    scaled[widest] = scaled[widest]! - 1;
  }
  return scaled;
}

/** One logical row, wrapped to each column and padded to the tallest cell. */
function formatRow(row: readonly string[], widths: readonly number[], header: boolean): string[] {
  const wrapped = widths.map((width, column) => {
    const source = row[column] ?? "";
    const segments = source.split(/<br\s*\/?>/i);
    const lines: string[] = [];
    for (const segment of segments) {
      for (const line of wrapToWidth(segment, width)) {
        lines.push(header ? defaultTheme.bold(line) : renderInline(line));
      }
    }
    return lines.length ? lines : [""];
  });
  const height = Math.max(...wrapped.map(lines => lines.length));
  const rows: string[] = [];
  for (let line = 0; line < height; line++) {
    rows.push(wrapped.map((lines, column) =>
      padToWidth(lines[line] ?? "", widths[column]!)).join(defaultTheme.fg("border", " │ ")));
  }
  return rows;
}

/** A fenced block, framed so its boundaries and language are unmistakable. */
function renderFence(body: readonly string[], language: string, cells: number): string[] {
  // A diagram is drawn rather than shown as source, and its own rows are already
  // aligned, so it is not framed or wrapped: a border would be drawn around
  // something that already draws its own, and wrapping would break the alignment
  // the diagram depends on.
  if (language === DIAGRAM_LANGUAGE) {
    const diagram = renderDiagram(body.join("\n"), cells);
    if (diagram) return [...diagram];
  }

  const label = language ? ` ${language} ` : " code ";
  const head = defaultTheme.fg("mdCodeBorder", `┌${label}${"─".repeat(Math.max(0, cells - visibleWidth(label) - 2))}┐`);
  const rows = [head];
  const highlighted = highlightCode(body.join("\n"), language);
  for (const line of highlighted.split("\n")) {
    for (const wrapped of wrapToWidth(line, Math.max(1, cells - 4))) {
      rows.push(`${defaultTheme.fg("mdCodeBorder", "│")} ${defaultTheme.fg("syntaxText", wrapped)}`);
    }
  }
  rows.push(defaultTheme.fg("mdCodeBorder", `└${"─".repeat(Math.max(0, cells - 2))}┘`));
  return rows;
}

/** Wrap `text` behind `marker`, aligning continuation rows under the text. */
function wrapWithIndent(text: string, marker: string, cells: number): string[] {
  const markerWidth = visibleWidth(marker);
  const body = wrapToWidth(text, Math.max(1, cells - markerWidth));
  const continuation = " ".repeat(markerWidth);
  return body.map((row, index) => (index === 0 ? marker : continuation) + row);
}
