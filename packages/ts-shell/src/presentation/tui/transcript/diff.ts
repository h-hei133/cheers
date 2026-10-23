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

const HUNK_PREFIXES = ["@@", "diff ", "index ", "rename ", "\\ "];

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

export interface DiffFacts {
  /** Original path when the operation is a rename. */
  readonly oldPath?: string;
  /** Destination path when the operation is a rename. */
  readonly newPath?: string;
}

const SIDE_BY_SIDE_MIN_WIDTH = 100;
const DEFAULT_MAX_ROWS = 400;
const DEFAULT_MAX_BYTES = 64 * 1024;

export interface DiffLayoutSource {
  readonly text: string;
  readonly breakAfter: "logical";
  readonly left?: string;
  readonly right?: string;
  readonly split?: number;
}

/** Rows for a diff, each fitted to `width`; unified when two columns do not fit. */
export function renderDiff(diff: string, width: number, options: DiffRenderOptions = {}): string[] {
  return [...layoutDiff(diff, width, options).rows];
}

/** Rows and exact source text for the layout selected at this width. */
export function layoutDiff(diff: string, width: number, options: DiffRenderOptions = {}):
{ readonly rows: readonly string[]; readonly sources: readonly (DiffLayoutSource | undefined)[] } {
  if (!diff) return { rows: [], sources: [] };
  if (options.sideBySide && width >= SIDE_BY_SIDE_MIN_WIDTH) {
    const layout = layoutSideBySide(diff, width, options);
    return { rows: layout.rows, sources: layout.sources.map(source => source ? {
      ...source, text: source.left ?? source.right ?? "", breakAfter: "logical" as const,
    } : undefined) };
  }
  return layoutUnifiedDiff(diff, width, options);
}

function layoutUnifiedDiff(diff: string, width: number, options: DiffRenderOptions):
{ readonly rows: readonly string[]; readonly sources: readonly (DiffLayoutSource | undefined)[] } {
  const maxRows = Math.max(1, options.maxRows ?? DEFAULT_MAX_ROWS);
  const maxBytes = Math.max(1, options.maxBytes ?? DEFAULT_MAX_BYTES);
  const lines = diff.split("\n");
  const lineCount = diff.endsWith("\n") ? lines.length - 1 : lines.length;
  const rows: string[] = [];
  const sources: (DiffLayoutSource | undefined)[] = [];
  let consumed = 0;
  let truncated = false;
  let inHunk = false;
  const push = (row: string, text?: string): boolean => {
    if (rows.length >= maxRows) { truncated = true; return false; }
    rows.push(row);
    sources.push(text === undefined ? undefined : { text, breakAfter: "logical" });
    return true;
  };
  for (let index = 0; index < lineCount; index++) {
    const line = displayLine(lines, index);
    const next = index + 1 < lineCount ? displayLine(lines, index + 1) : undefined;
    const fileHeader = isFileHeaderLine(lines, index, inHunk);
    const hunk = HUNK_PREFIXES.some((prefix) => line.startsWith(prefix)) || fileHeader;
    if (!hunk && line.startsWith("-") && next?.startsWith("+")) {
      consumed += lineByteLength(lines, index) + lineByteLength(lines, index + 1);
      if (consumed > maxBytes) { truncated = true; break; }
      const split = splitEmphasis(line.slice(1), next.slice(1));
      if (!push(emphasised("-", split.removed, "diffRemoved", width), line.slice(1))
        || !push(emphasised("+", split.added, "diffAdded", width), next.slice(1))) break;
      index += 1;
      continue;
    }
    consumed += lineByteLength(lines, index);
    if (consumed > maxBytes) { truncated = true; break; }
    if (hunk) {
      inHunk = !fileHeader && line.startsWith("@@");
      if (!push(defaultTheme.fg("muted", truncateToWidth(line, width)), line)) break;
      continue;
    }
    if (line.startsWith("+")) {
      if (!push(plain("+", line.slice(1), "diffAdded", width), line.slice(1))) break;
    } else if (line.startsWith("-")) {
      if (!push(plain("-", line.slice(1), "diffRemoved", width), line.slice(1))) break;
    } else if (!push(plain(" ", line.replace(/^ /, ""), "diffContext", width), line.replace(/^ /, ""))) break;
  }
  if (truncated) {
    const marker = defaultTheme.dim("… diff truncated by the view budget");
    if (rows.length >= maxRows) { rows[maxRows - 1] = marker; sources[maxRows - 1] = undefined; }
    else { rows.push(marker); sources.push(undefined); }
  }
  return { rows, sources };
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
export function createUnifiedDiff(
  filePath: string,
  oldText: string,
  newText: string,
  facts: DiffFacts = {},
): string {
  const oldPath = (facts.oldPath ?? filePath).replace(/\\/g, "/");
  const newPath = (facts.newPath ?? filePath).replace(/\\/g, "/");
  const metadata: string[] = [];
  if (oldPath !== newPath) {
    metadata.push(`rename from ${oldPath}`, `rename to ${newPath}`);
  }
  if (oldText === newText) return metadata.join("\n");

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

  const oldBom = oldText.startsWith("\uFEFF");
  const newBom = newText.startsWith("\uFEFF");
  if (oldBom !== newBom) metadata.push(`\\ BOM: old=${oldBom ? "present" : "absent"}, new=${newBom ? "present" : "absent"}`);
  const oldEol = lineEndingKind(oldText);
  const newEol = lineEndingKind(newText);
  if (oldEol !== newEol) metadata.push(`\\ EOL: old=${oldEol}, new=${newEol}`);
  if (endsWithLineBreak(oldText) !== endsWithLineBreak(newText)) {
    metadata.push(`\\ No newline at end of file: old=${endsWithLineBreak(oldText) ? "no" : "yes"}, new=${endsWithLineBreak(newText) ? "no" : "yes"}`);
  }
  const header = [
    ...metadata,
    `--- a/${oldPath}`,
    `+++ b/${newPath}`,
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

function lineEndingKind(text: string): "LF" | "CRLF" | "CR" | "mixed" | "none" {
  let lf = 0;
  let crlf = 0;
  let cr = 0;
  for (let index = 0; index < text.length; index++) {
    if (text[index] === "\r") {
      if (text[index + 1] === "\n") {
        crlf++;
        index++;
      } else {
        cr++;
      }
    } else if (text[index] === "\n") {
      lf++;
    }
  }
  const kinds = [lf, crlf, cr].filter(count => count > 0).length;
  if (kinds > 1) return "mixed";
  if (crlf > 0) return "CRLF";
  if (cr > 0) return "CR";
  return lf > 0 ? "LF" : "none";
}

function endsWithLineBreak(text: string): boolean {
  return /(?:\r\n|\r|\n)$/.test(text);
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
  const lineCount = diff.endsWith('\n') ? lines.length - 1 : lines.length;
  const rows: string[] = [];
  const sources: (DiffRowSource | undefined)[] = [];
  let truncatedShown = false;
  const truncated = (): void => {
    if (truncatedShown) return;
    truncatedShown = true;
    const marker = defaultTheme.dim('… diff truncated by the view budget');
    if (rows.length >= maxRows) {
      rows[maxRows - 1] = marker;
      sources[maxRows - 1] = undefined;
    } else {
      rows.push(marker);
      sources.push(undefined);
    }
  };
  const numberWidth = 5;
  const cell = Math.max(8, Math.floor((width - numberWidth * 2 - 5) / 2));
  const gutter = (left: string, right: string): string =>
    defaultTheme.dim(`${left.padStart(numberWidth)} ${right.padStart(numberWidth)} │ `);
  let oldLine = 0;
  let newLine = 0;
  let index = 0;
  let consumed = 0;
  let inHunk = false;
  const push = (row: string, source?: DiffRowSource): boolean => {
    if (rows.length >= maxRows) return false;
    rows.push(row);
    sources.push(source);
    return true;
  };
  const split = numberWidth * 2 + 2;
  while (index < lineCount) {
    const line = displayLine(lines, index);
    const hunk = HUNK_PREFIXES.some(prefix => line.startsWith(prefix)) || isFileHeaderLine(lines, index, inHunk);
    if (!hunk && (line.startsWith('-') || line.startsWith('+'))) {
      const removed: string[] = [];
      const added: string[] = [];
      while (index < lineCount && lines[index]!.startsWith('-')
        && !isFileHeaderLine(lines, index, inHunk)) {
        consumed += lineByteLength(lines, index); removed.push(displayLine(lines, index).slice(1)); index += 1;
      }
      while (index < lineCount && lines[index]!.startsWith('+')
        && !isFileHeaderLine(lines, index, inHunk)) {
        consumed += lineByteLength(lines, index); added.push(displayLine(lines, index).slice(1)); index += 1;
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
    consumed += lineByteLength(lines, index);
    if (consumed > maxBytes) { truncated(); break; }
    if (hunk) {
      if (line.startsWith('@@')) {
        const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
        if (match) { oldLine = Number(match[1]); newLine = Number(match[2]); }
        inHunk = true;
      } else {
        inHunk = false;
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
    if (!push(defaultTheme.dim(truncateToWidth(line, width)))) { truncated(); break; }
    index += 1;
  }
  if (bytes > maxBytes) truncated();
  return { rows, sources };
}

function isFileHeaderLine(lines: readonly string[], index: number, inHunk = false): boolean {
  const line = lines[index] ?? "";
  if (line.startsWith("--- ")) return isHeaderPair(line, lines[index + 1], inHunk);
  if (line.startsWith("+++ ")) return isHeaderPair(lines[index - 1], line, inHunk);
  return false;
}

function isHeaderPair(oldLine: string | undefined, newLine: string | undefined, inHunk: boolean): boolean {
  if (!oldLine?.startsWith("--- ") || !newLine?.startsWith("+++ ")) return false;
  if (inHunk) return false;
  const oldPath = oldLine.slice(4);
  const newPath = newLine.slice(4);
  return (oldPath.startsWith("a/") && newPath.startsWith("b/"))
    || oldPath === "/dev/null" || newPath === "/dev/null"
    || (!inHunk && isUnprefixedHeaderPath(oldPath) && isUnprefixedHeaderPath(newPath));
}

function isUnprefixedHeaderPath(value: string): boolean {
  const path = value.trimEnd();
  if (!path || path.startsWith("-") || path.startsWith("+")) return false;
  if (/^".+"$/.test(path)) return true;
  const timestamp = path.indexOf("\t");
  if (timestamp >= 0) return timestamp > 0;
  return !/\s/.test(path);
}

/** Pad to the cell width without counting escape sequences as cells. */
function pad(text: string, width: number): string {
  return text + ' '.repeat(Math.max(0, width - visibleWidth(text)));
}

function lineByteLength(lines: readonly string[], index: number): number {
  return Buffer.byteLength(lines[index]!, "utf8") + (index + 1 < lines.length ? 1 : 0);
}

function displayLine(lines: readonly string[], index: number): string {
  const raw = lines[index] ?? "";
  const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
  let output = "";
  for (const character of line) {
    const code = character.codePointAt(0) ?? 0;
    const control = code < 0x20 || code === 0x7f || (code >= 0x80 && code <= 0x9f)
      || code === 0x2028 || code === 0x2029;
    output += control
      ? `\\x${code.toString(16).padStart(2, "0")}`
      : character;
  }
  return output;
}
