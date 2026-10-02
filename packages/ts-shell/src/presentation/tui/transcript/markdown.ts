import { defaultTheme } from "../../theme/theme.js";
import { highlightCode } from "../../theme/syntax.js";
import { padToWidth, truncateToWidth, wrapToWidth } from "../text/layout.js";
import { visibleWidth } from "../text/measure.js";
import { DIAGRAM_LANGUAGE, renderDiagram } from "./mermaid.js";
import { scanBlocks } from "./markdownScan.js";
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
      `${defaultTheme.fg("mdLink", label)}${defaultTheme.fg("mdLinkUrl", ` (${href})`)}`,
    );
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
