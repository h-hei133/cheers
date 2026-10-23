import { defaultTheme } from "../../theme/theme.js";
import { highlightCode } from "../../theme/syntax.js";
import { padToWidth, truncateToWidth, wrapToWidth } from "../text/layout.js";
import { graphemeBoundaries, visibleWidth } from "../text/measure.js";
import { DIAGRAM_LANGUAGE, renderDiagram } from "./mermaid.js";
import { scanBlocks } from "./markdownScan.js";
import { latexToDisplayText, projectMath } from "./math.js";
import { splitTableRow } from "./table.js";
import { inlineWithinBudget, transformInline, type InlineContext } from "../text/inline.js";
import { closeTerminalHyperlink, displayLinkUrl, terminalHyperlink } from "../text/link.js";
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

/** A rendered row's semantic source, before the transcript adds block identity. */
export interface MarkdownSourceLine {
  readonly text: string;
  readonly breakAfter: "soft" | "logical";
  readonly node: number;
  readonly nodeRow: number;
  readonly nodeRows: number;
}

export interface MarkdownRender {
  readonly rows: readonly string[];
  readonly sources: readonly (MarkdownSourceLine | undefined)[];
}

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
    renderLink: (label, href, next) => {
      const renderedLabel = defaultTheme.fg("mdLink", renderInlineAt(label, next));
      const visibleTarget = displayLinkUrl(href);
      return `${terminalHyperlink(renderedLabel, href)}${visibleTarget ? defaultTheme.fg("mdLinkUrl", ` (${visibleTarget})`) : ""}`;
    },
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
  return [...renderMarkdownWithSources(text, width).rows];
}

/**
 * Render Markdown and retain the source line behind each visual row.
 *
 * Structured layouts (tables and fenced blocks) emit several visual rows for
 * one source line. Every such row points at the same source node; selection
 * requires complete node coverage before it returns that source.
 */
export function renderMarkdownWithSources(text: string, width: number): MarkdownRender {
  const cells = Math.max(8, width);
  const rows: string[] = [];
  const sources: (MarkdownSourceLine | undefined)[] = [];
  const lines = text.split("\n");
  const append = (rendered: MarkdownRender): void => {
    rows.push(...rendered.rows);
    sources.push(...rendered.sources);
  };
  const pushNode = (blockRows: readonly string[], source: string | undefined, node: number): void => {
    if (source === undefined) {
      for (const row of blockRows) {
        rows.push(row);
        sources.push(undefined);
      }
      return;
    }
    const nodeRows = blockRows.length;
    for (let index = 0; index < blockRows.length; index++) {
      rows.push(blockRows[index]!);
      sources.push({ text: source, breakAfter: index === nodeRows - 1 ? "logical" : "soft", node, nodeRow: index, nodeRows });
    }
  };
  for (const block of scanBlocks(text)) {
    switch (block.kind) {
      case "table":
        append(renderTableWithSources(block, cells, lines));
        break;
      case "math": {
        const projected = latexToDisplayText(block.body) ?? block.raw;
        const projectedRows = projected.split("\n").flatMap(line =>
          wrapWithIndent(defaultTheme.fg("mdHeading", line), "", cells));
        pushNode(projectedRows, block.raw, block.sourceStart);
        break;
      }
      case "fence":
        append(renderFenceWithSources(block, cells, lines));
        break;
      case "heading":
        pushNode(wrapWithIndent(
          defaultTheme.bold(defaultTheme.fg("mdHeading", renderInline(block.text))), "", cells,
        ), lines[block.sourceStart], block.sourceStart);
        break;
      case "rule":
        pushNode([defaultTheme.fg("mdRule", "─".repeat(cells))], lines[block.sourceStart], block.sourceStart);
        break;
      case "list": {
        const glyph = /^\d+$/.test(block.marker.replace(/\.$/, "")) ? `${block.marker}` : "•";
        pushNode(wrapWithIndent(
          renderInline(block.text), `${block.indent}${defaultTheme.fg("mdListBullet", glyph)} `, cells,
        ), lines[block.sourceStart], block.sourceStart);
        break;
      }
      case "quote":
        pushNode(wrapWithIndent(
          defaultTheme.fg("mdQuoteText", renderInline(block.text)), `${defaultTheme.fg("mdQuoteBorder", "▏")} `, cells,
        ), lines[block.sourceStart], block.sourceStart);
        break;
      default:
        pushNode(wrapWithIndent(
          block.line.trim() === "" ? "" : renderInline(block.line), "", cells,
        ), lines[block.sourceStart], block.sourceStart);
        break;
    }
  }
  return { rows, sources };
}

/**
 * A pipe table, laid out in aligned columns.
 *
 * Left as source text a table is the least readable thing in a terminal — the
 * pipes carry no alignment and every row wraps differently. Columns are sized to
 * their content and then squeezed proportionally to fit the frame, because a
 * table that overflows is worse than one with a truncated cell.
 */
function renderTableWithSources(block: Extract<import("./markdownScan.js").MarkdownBlock, { kind: "table" }>,
  cells: number, lines: readonly string[]): MarkdownRender {
  const head = splitTableRow(block.header);
  const rowsOfCells = block.rows.map(splitTableRow);
  const columns = Math.max(head.length, ...rowsOfCells.map(row => row.length));
  const bytes = [block.header, ...block.rows].reduce((sum, line) => sum + Buffer.byteLength(line, "utf8"), 0);
  const separators = (columns - 1) * 3;
  // A table that cannot keep three readable cells per column, or that exceeds
  // the column/row/byte budget, is shown as its own source instead of losing
  // the tail of every cell.
  if (columns > MAX_TABLE_COLUMNS || rowsOfCells.length > MAX_TABLE_ROWS || bytes > MAX_CELL_BYTES * 4
    || columns * 5 + separators > cells) return rawTableWithSources(block, cells, lines);
  const rows = [head, ...rowsOfCells];
  if (rows.some(row => row.some(cell => Buffer.byteLength(cell, "utf8") > MAX_CELL_BYTES))) {
    return rawTableWithSources(block, cells, lines);
  }
  const widths = columnWidths(rows, cells);
  const wrapped = tableCellsFit(rows, widths);
  if (!wrapped) return rawTableWithSources(block, cells, lines);
  const line = defaultTheme.fg("border", widths.map((width) => "─".repeat(width)).join("─┼─"));
  const rendered: string[] = [];
  const sources: (MarkdownSourceLine | undefined)[] = [];
  const push = (values: readonly string[], source: string, node: number): void => {
    for (let index = 0; index < values.length; index++) {
      rendered.push(values[index]!);
      sources.push({ text: source, breakAfter: index === values.length - 1 ? "logical" : "soft",
        node, nodeRow: index, nodeRows: values.length });
    }
  };
  push(formatRow(wrapped[0]!, widths, true), lines[block.sourceStart]!, block.sourceStart);
  push([line], lines[block.sourceStart + 1]!, block.sourceStart + 1);
  for (let index = 0; index < rowsOfCells.length; index++) {
    const sourceIndex = block.sourceStart + 2 + index;
    push(formatRow(wrapped[index + 1]!, widths, false), lines[sourceIndex]!, sourceIndex);
  }
  return { rows: rendered, sources };
}

function tableCellsFit(rows: readonly string[][], widths: readonly number[]): string[][][] | undefined {
  const wrappedRows: string[][][] = [];
  for (const row of rows) {
    const wrappedRow: string[][] = [];
    for (let column = 0; column < widths.length; column++) {
      const lines: string[] = [];
      for (const segment of (row[column] ?? "").split(/<br\s*\/?>/i)) {
        lines.push(...wrapToWidth(renderInline(segment), widths[column]!));
      }
      const cell = lines.length ? lines : [""];
      if (cell.length > MAX_CELL_LINES) return undefined;
      wrappedRow.push(cell);
    }
    wrappedRows.push(wrappedRow);
  }
  return wrappedRows;
}

/** The original table, wrapped rather than truncated, when layout cannot help. */
function rawTableWithSources(block: Extract<import("./markdownScan.js").MarkdownBlock, { kind: "table" }>,
  cells: number, lines: readonly string[]): MarkdownRender {
  const rows: string[] = [];
  const sources: (MarkdownSourceLine | undefined)[] = [];
  const marker = defaultTheme.dim("… table truncated by the view budget");
  const markerBytes = Buffer.byteLength(marker, "utf8");
  let bytes = 0;
  let truncated = false;
  for (let sourceIndex = block.sourceStart; sourceIndex <= block.sourceEnd; sourceIndex++) {
    const line = lines[sourceIndex]!;
    const lineBytes = Buffer.byteLength(line, "utf8");
    const bounded = truncateUtf8(line, MAX_RAW_TABLE_BYTES);
    const sourceComplete = bounded === line;
    if (lineBytes > MAX_RAW_TABLE_BYTES) truncated = true;
    const wrapped = wrapToWidth(defaultTheme.dim(bounded), cells);
    for (let index = 0; index < wrapped.length; index++) {
      const row = wrapped[index]!;
      const rowBytes = Buffer.byteLength(row, "utf8");
      const nextBytes = bytes + rowBytes + (rows.length > 0 ? 1 : 0);
      if (rows.length >= MAX_RAW_TABLE_ROWS || nextBytes > MAX_RAW_TABLE_BYTES) {
        truncated = true;
        break;
      }
      rows.push(row);
      sources.push(sourceComplete
        ? { text: line, breakAfter: index === wrapped.length - 1 ? "logical" : "soft",
          node: sourceIndex, nodeRow: index, nodeRows: wrapped.length }
        : undefined);
      bytes = nextBytes;
    }
    if (truncated) break;
  }
  if (truncated) {
    while (rows.length >= MAX_RAW_TABLE_ROWS
      || (rows.length > 0 && bytes + 1 + markerBytes > MAX_RAW_TABLE_BYTES)) {
      const removed = rows.pop();
      if (removed === undefined) break;
      sources.pop();
      bytes -= Buffer.byteLength(removed, "utf8") + (rows.length > 0 ? 1 : 0);
    }
    if (bytes + markerBytes + (rows.length > 0 ? 1 : 0) <= MAX_RAW_TABLE_BYTES) {
      rows.push(marker);
      sources.push(undefined);
    }
  }
  return { rows, sources };
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
      const rendered = (row[column] ?? "").split(/<br\s*\/?>/i).map(segment => renderInline(segment));
      widths[column] = Math.max(widths[column]!, ...rendered.map(segment => visibleWidth(segment)));
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
function formatRow(wrapped: readonly (readonly string[])[], widths: readonly number[], header: boolean): string[] {
  const height = Math.max(...wrapped.map(lines => lines.length));
  const rows: string[] = [];
  for (let line = 0; line < height; line++) {
    rows.push(wrapped.map((lines, column) =>
      padToWidth(closeTerminalHyperlink(header ? defaultTheme.bold(lines[line] ?? "") : lines[line] ?? ""), widths[column]!))
      .join(defaultTheme.fg("border", " │ ")));
  }
  return rows;
}

/** A fenced block, framed so its boundaries and language are unmistakable. */
function renderFenceWithSources(block: Extract<import("./markdownScan.js").MarkdownBlock, { kind: "fence" }>,
  cells: number, lines: readonly string[]): MarkdownRender {
  const body = block.lines;
  const language = block.language;
  // A diagram is drawn rather than shown as source, and its own rows are already
  // aligned, so it is not framed or wrapped: a border would be drawn around
  // something that already draws its own, and wrapping would break the alignment
  // the diagram depends on.
  if (language === DIAGRAM_LANGUAGE) {
    const diagram = renderDiagram(body.join("\n"), cells);
    if (diagram) return { rows: diagram, sources: diagram.map(() => undefined) };
  }

  const label = language ? ` ${language} ` : " code ";
  const head = defaultTheme.fg("mdCodeBorder", `┌${label}${"─".repeat(Math.max(0, cells - visibleWidth(label) - 2))}┐`);
  const rows = [head];
  const sources: (MarkdownSourceLine | undefined)[] = [
    { text: lines[block.sourceStart]!, breakAfter: "logical", node: block.sourceStart, nodeRow: 0, nodeRows: 1 },
  ];
  const highlightedLines = body.length === 0 ? [] : highlightCode(body.join("\n"), language).split("\n");
  for (let index = 0; index < highlightedLines.length; index++) {
    const line = highlightedLines[index]!;
    const wrapped = wrapToWidth(line, Math.max(1, cells - 4));
    const sourceIndex = block.sourceStart + 1 + index;
    const source = index < body.length ? lines[sourceIndex] : undefined;
    for (let rowIndex = 0; rowIndex < wrapped.length; rowIndex++) {
      rows.push(`${defaultTheme.fg("mdCodeBorder", "│")} ${defaultTheme.fg("syntaxText", wrapped[rowIndex]!)}`);
      sources.push(source !== undefined ? { text: source, breakAfter: rowIndex === wrapped.length - 1 ? "logical" : "soft",
        node: sourceIndex, nodeRow: rowIndex, nodeRows: wrapped.length } : undefined);
    }
  }
  const closing = block.sourceEnd === block.sourceStart + body.length + 1 ? lines[block.sourceEnd] : undefined;
  rows.push(defaultTheme.fg("mdCodeBorder", `└${"─".repeat(Math.max(0, cells - 2))}┘`));
  sources.push(closing ? { text: closing, breakAfter: "logical", node: block.sourceEnd, nodeRow: 0, nodeRows: 1 } : undefined);
  return { rows, sources };
}

/** Wrap `text` behind `marker`, aligning continuation rows under the text. */
function wrapWithIndent(text: string, marker: string, cells: number): string[] {
  const markerWidth = visibleWidth(marker);
  const body = wrapToWidth(text, Math.max(1, cells - markerWidth));
  const continuation = " ".repeat(markerWidth);
  return body.map((row, index) => (index === 0 ? marker : continuation) + row);
}
