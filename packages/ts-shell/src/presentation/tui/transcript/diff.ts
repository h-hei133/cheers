import { defaultTheme } from "../../theme/theme.js";
import { truncateToWidth } from "../text/layout.js";
import { graphemeBoundaries, visibleWidth } from "../text/measure.js";

/**
 * Unified diff rendering with intra-line emphasis.
 *
 * A removed/added pair usually differs in only part of the line. Highlighting
 * just the differing span — and dimming the shared prefix and suffix — is what
 * lets a reader see *what* changed instead of re-reading two similar lines.
 */

const HUNK_PREFIXES = ["+++", "---", "@@", "diff ", "index "];

interface Emphasis {
  readonly head: string;
  readonly body: string;
  readonly tail: string;
}

export interface DiffRenderOptions {
  /** Prefer two columns when the surface can afford them. */
  readonly sideBySide?: boolean;
  /** Rows and input bytes are bounded independently; zero-width bytes still count. */
  readonly maxRows?: number;
  readonly maxBytes?: number;
}

const SIDE_BY_SIDE_MIN_WIDTH = 100;
const DEFAULT_MAX_ROWS = 400;
const DEFAULT_MAX_BYTES = 64 * 1024;

/** Rows for a diff, each fitted to `width`; unified when two columns do not fit. */
export function renderDiff(diff: string, width: number, options: DiffRenderOptions = {}): string[] {
  if (!diff) return [];
  if (options.sideBySide && width >= SIDE_BY_SIDE_MIN_WIDTH) return renderSideBySide(diff, width, options);
  const maxRows = Math.max(1, options.maxRows ?? DEFAULT_MAX_ROWS);
  const maxBytes = Math.max(1, options.maxBytes ?? DEFAULT_MAX_BYTES);
  const lines = diff.split("\n");
  const rows: string[] = [];
  let consumed = 0;
  let truncated = false;
  const push = (row: string): boolean => {
    if (rows.length >= maxRows) { truncated = true; return false; }
    rows.push(row);
    return true;
  };
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    consumed += Buffer.byteLength(line, "utf8") + 1;
    if (consumed > maxBytes) { truncated = true; break; }
    if (HUNK_PREFIXES.some((prefix) => line.startsWith(prefix))) {
      if (!push(defaultTheme.fg("muted", truncateToWidth(line, width)))) break;
      continue;
    }
    const next = lines[index + 1];
    if (line.startsWith("-") && next?.startsWith("+")) {
      consumed += Buffer.byteLength(next, "utf8") + 1;
      if (consumed > maxBytes) { truncated = true; break; }
      const split = splitEmphasis(line.slice(1), next.slice(1));
      if (!push(emphasised("-", split.removed, "diffRemoved", width))
        || !push(emphasised("+", split.added, "diffAdded", width))) break;
      index += 1;
      continue;
    }
    if (line.startsWith("+")) {
      if (!push(plain("+", line.slice(1), "diffAdded", width))) break;
    } else if (line.startsWith("-")) {
      if (!push(plain("-", line.slice(1), "diffRemoved", width))) break;
    } else if (!push(plain(" ", line.replace(/^ /, ""), "diffContext", width))) break;
  }
  if (truncated) rows.push(defaultTheme.dim("… diff truncated by the view budget"));
  return rows;
}

/** Shared prefix and suffix of a removed/added pair, with the differing middles. */
function splitEmphasis(removed: string, added: string): { removed: Emphasis; added: Emphasis } {
  const removedClusters = splitClusters(removed);
  const addedClusters = splitClusters(added);
  let head = 0;
  const limit = Math.min(removedClusters.length, addedClusters.length);
  while (head < limit && removedClusters[head] === addedClusters[head]) head += 1;
  let tail = 0;
  while (tail < limit - head
    && removedClusters[removedClusters.length - 1 - tail] === addedClusters[addedClusters.length - 1 - tail]) tail += 1;
  return {
    removed: {
      head: removedClusters.slice(0, head).join(""),
      body: removedClusters.slice(head, removedClusters.length - tail).join(""),
      tail: removedClusters.slice(removedClusters.length - tail).join(""),
    },
    added: {
      head: addedClusters.slice(0, head).join(""),
      body: addedClusters.slice(head, addedClusters.length - tail).join(""),
      tail: addedClusters.slice(addedClusters.length - tail).join(""),
    },
  };
}

function splitClusters(text: string): string[] {
  const boundaries = graphemeBoundaries(text);
  return Array.from({ length: Math.max(0, boundaries.length - 1) }, (_, index) =>
    text.slice(boundaries[index]!, boundaries[index + 1]!));
}

function emphasised(
  marker: string,
  parts: Emphasis,
  token: "diffAdded" | "diffRemoved",
  width: number,
): string {
  const body = parts.body.length > 0 ? defaultTheme.inverse(parts.body) : "";
  const text = truncateToWidth(`${marker}${parts.head}${parts.body}${parts.tail}`, width);
  // Only emphasise when the whole line survived truncation; a cut line would
  // otherwise carry an inverse run that no longer matches its content.
  if (text.endsWith("…")) return defaultTheme.fg(token, text);
  return defaultTheme.fg(token, `${marker}${parts.head}`) + body + defaultTheme.fg(token, parts.tail);
}

function plain(
  marker: string,
  text: string,
  token: "diffAdded" | "diffRemoved" | "diffContext",
  width: number,
): string {
  return defaultTheme.fg(token, truncateToWidth(`${marker}${text}`, width));
}

/**
 * Generate a standard unified diff between two text versions of a file.
 *
 * Identifies common prefix and suffix lines, frames the differing middle with
 * up to two lines of context, and produces standard unified diff format.
 */
export function createUnifiedDiff(filePath: string, oldText: string, newText: string): string {
  if (oldText === newText) return "";
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");

  let prefix = 0;
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) {
    prefix++;
  }

  let suffix = 0;
  while (
    suffix < oldLines.length - prefix &&
    suffix < newLines.length - prefix &&
    oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) {
    suffix++;
  }

  const contextBefore = Math.min(2, prefix);
  const contextAfter = Math.min(2, suffix);

  const startOld = prefix - contextBefore;
  const startNew = prefix - contextBefore;

  const oldSlice = oldLines.slice(startOld, oldLines.length - suffix + contextAfter);
  const newSlice = newLines.slice(startNew, newLines.length - suffix + contextAfter);

  const relPath = filePath.replace(/\\/g, "/");
  const header = [
    `--- a/${relPath}`,
    `+++ b/${relPath}`,
    `@@ -${startOld + 1},${oldSlice.length} +${startNew + 1},${newSlice.length} @@`,
  ];

  const body: string[] = [];
  for (let i = startOld; i < prefix; i++) {
    body.push(` ${oldLines[i]}`);
  }
  for (let i = prefix; i < oldLines.length - suffix; i++) {
    body.push(`-${oldLines[i]}`);
  }
  for (let i = prefix; i < newLines.length - suffix; i++) {
    body.push(`+${newLines[i]}`);
  }
  for (let i = oldLines.length - suffix; i < oldLines.length - suffix + contextAfter; i++) {
    body.push(` ${oldLines[i]}`);
  }

  return [...header, ...body].join("\n");
}


/**
 * Two-column projection of a unified diff.
 *
 * A removed/added run is paired by position; a side with no counterpart keeps
 * its cell blank rather than pretending the lines correspond. Hunk headers,
 * rename/BOM/EOL/EOF facts and other metadata stay full width above their hunk.
 * Rows and input bytes are both bounded, so a diff made of zero-width characters
 * cannot bypass the limit.
 */
export interface DiffRowSource {
  /** Source text of the left cell; absent when the side is blank. */
  readonly left?: string;
  /** Source text of the right cell; absent when the side is blank. */
  readonly right?: string;
  /** Column of the divider; selections left of it are old text, right are new. */
  readonly split: number;
}

export function renderSideBySide(diff: string, width: number, options: DiffRenderOptions = {}): string[] {
  return [...layoutSideBySide(diff, width, options).rows];
}

/** Rows plus the source text behind each row, for selection copy. */
export function layoutSideBySide(diff: string, width: number, options: DiffRenderOptions = {}):
{ readonly rows: readonly string[]; readonly sources: readonly (DiffRowSource | undefined)[] } {
  const maxRows = Math.max(1, options.maxRows ?? DEFAULT_MAX_ROWS);
  const maxBytes = Math.max(1, options.maxBytes ?? DEFAULT_MAX_BYTES);
  const bytes = Buffer.byteLength(diff, 'utf8');
  const lines = diff.split('\n');
  const rows: string[] = [];
  const sources: (DiffRowSource | undefined)[] = [];
  const truncated = (): void => {
    if (rows.length < maxRows) rows.push(defaultTheme.dim('… diff truncated by the view budget'));
  };
  const numberWidth = 5;
  const cell = Math.max(8, Math.floor((width - numberWidth * 2 - 5) / 2));
  const gutter = (left: string, right: string): string =>
    defaultTheme.dim(`${left.padStart(numberWidth)} ${right.padStart(numberWidth)} │ `);
  let oldLine = 0;
  let newLine = 0;
  let index = 0;
  let consumed = 0;
  const push = (row: string, source?: DiffRowSource): boolean => {
    if (rows.length >= maxRows) return false;
    rows.push(row);
    sources.push(source);
    return true;
  };
  const split = numberWidth * 2 + 2;
  while (index < lines.length) {
    const line = lines[index]!;
    consumed += Buffer.byteLength(line, 'utf8') + 1;
    if (consumed > maxBytes) { truncated(); break; }
    if (HUNK_PREFIXES.some(prefix => line.startsWith(prefix))) {
      if (line.startsWith('@@')) {
        const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
        if (match) { oldLine = Number(match[1]); newLine = Number(match[2]); }
      }
      if (!push(defaultTheme.fg('muted', truncateToWidth(line, width)))) { truncated(); break; }
      index += 1;
      continue;
    }
    if (line.startsWith(' ')) {
      const text = line.slice(1);
      if (!push(gutter(String(oldLine), String(newLine)) + defaultTheme.fg('diffContext', truncateToWidth(text, cell))
        + ' │ ' + defaultTheme.fg('diffContext', truncateToWidth(text, cell)), { left: text, right: text, split })) { truncated(); break; }
      oldLine += 1; newLine += 1; index += 1; continue;
    }
    if (line.startsWith('-') || line.startsWith('+')) {
      const removed: string[] = [];
      const added: string[] = [];
      while (index < lines.length && lines[index]!.startsWith('-')) {
        consumed += Buffer.byteLength(lines[index]!, 'utf8') + 1; removed.push(lines[index]!.slice(1)); index += 1;
      }
      while (index < lines.length && lines[index]!.startsWith('+')) {
        consumed += Buffer.byteLength(lines[index]!, 'utf8') + 1; added.push(lines[index]!.slice(1)); index += 1;
      }
      if (consumed > maxBytes) { truncated(); return { rows, sources }; }
      const count = Math.max(removed.length, added.length);
      for (let pair = 0; pair < count; pair++) {
        const left = removed[pair];
        const right = added[pair];
        const leftText = left === undefined ? '' : defaultTheme.fg('diffRemoved', truncateToWidth(left, cell));
        const rightText = right === undefined ? '' : defaultTheme.fg('diffAdded', truncateToWidth(right, cell));
        if (!push(gutter(left === undefined ? '' : String(oldLine), right === undefined ? '' : String(newLine))
          + pad(leftText, cell) + ' │ ' + rightText, { ...(left !== undefined ? { left } : {}), ...(right !== undefined ? { right } : {}), split })) { truncated(); return { rows, sources }; }
        if (left !== undefined) oldLine += 1;
        if (right !== undefined) newLine += 1;
      }
      continue;
    }
    if (!push(defaultTheme.dim(truncateToWidth(line, width)))) { truncated(); break; }
    index += 1;
  }
  if (bytes > maxBytes && rows.length < maxRows) truncated();
  return { rows, sources };
}

/** Pad to the cell width without counting escape sequences as cells. */
function pad(text: string, width: number): string {
  return text + ' '.repeat(Math.max(0, width - visibleWidth(text)));
}
