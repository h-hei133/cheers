/**
 * Bounded source paging for diffs.
 *
 * The inline renderer is intentionally a preview. A full reader must not turn
 * that exception into permission to enumerate or lay out an unbounded diff, so
 * this module owns the byte and line boundaries shared by preview detection and
 * the pager.
 */

export const DIFF_PREVIEW_ROWS = 400;
export const DIFF_PREVIEW_BYTES = 64 * 1024;

export interface BoundedDiffLines {
  readonly lines: readonly string[];
  readonly truncated: boolean;
}

export interface DiffPage {
  readonly text: string;
  readonly next?: number;
  readonly oldLine: number;
  readonly newLine: number;
  readonly inHunk: boolean;
}

interface LineState {
  readonly oldLine: number;
  readonly newLine: number;
  readonly inHunk: boolean;
}

/** Split only the prefix that fits both source budgets. */
export function boundDiffLines(
  diff: string,
  maxBytes = DIFF_PREVIEW_BYTES,
  maxRows = DIFF_PREVIEW_ROWS,
): BoundedDiffLines {
  const byteLimit = Math.max(1, Math.floor(maxBytes));
  const rowLimit = Math.max(1, Math.floor(maxRows));
  const lines: string[] = [];
  let consumed = 0;
  let start = 0;
  while (start < diff.length) {
    if (lines.length >= rowLimit) return { lines, truncated: true };
    let cursor = start;
    let bytes = 0;
    while (cursor < diff.length && diff[cursor] !== "\n") {
      const code = diff.codePointAt(cursor)!;
      const length = code > 0xffff ? 2 : 1;
      const width = utf8Width(code);
      if (consumed + bytes + width > byteLimit) return { lines, truncated: true };
      bytes += width;
      cursor += length;
    }
    if (cursor < diff.length) {
      if (consumed + bytes + 1 > byteLimit) return { lines, truncated: true };
      bytes += 1;
    }
    lines.push(diff.slice(start, cursor));
    consumed += bytes;
    start = cursor < diff.length ? cursor + 1 : cursor;
  }
  // `split("\n")` keeps a final empty segment. Retaining it here keeps byte
  // accounting and exact-boundary behavior identical to the previous renderer.
  if (diff.endsWith("\n")) lines.push("");
  return { lines, truncated: false };
}

/** Whether the bounded preview would omit source or rows. */
export function diffNeedsFullView(
  diff: string,
  maxBytes = DIFF_PREVIEW_BYTES,
  maxRows = DIFF_PREVIEW_ROWS,
): boolean {
  return boundDiffLines(diff, maxBytes, maxRows).truncated;
}

/** Count logical source lines without allocating a split array. */
export function countDiffLines(diff: string): number {
  if (!diff) return 0;
  let lines = 1;
  for (let index = diff.indexOf("\n"); index >= 0; index = diff.indexOf("\n", index + 1)) lines += 1;
  return diff.endsWith("\n") ? lines - 1 : lines;
}

/**
 * Read one bounded page and carry the old/new line counters into the next.
 *
 * The returned source is a slice, not a normalized copy, so CRLF and embedded
 * controls retain their original byte accounting when the renderer sanitizes
 * them for display.
 */
export function nextDiffPage(
  diff: string,
  offset = 0,
  oldLine = 0,
  newLine = 0,
  inHunk = false,
  maxRows = DIFF_PREVIEW_ROWS,
  maxBytes = DIFF_PREVIEW_BYTES,
): DiffPage {
  const start = Math.max(0, Math.min(diff.length, Math.floor(offset)));
  const rowLimit = Math.max(1, Math.floor(maxRows));
  const byteLimit = Math.max(1, Math.floor(maxBytes));
  let cursor = start;
  let rows = 0;
  let bytes = 0;
  let state: LineState = { oldLine, newLine, inHunk };
  while (cursor < diff.length && rows < rowLimit) {
    const newline = diff.indexOf("\n", cursor);
    const lineEnd = newline < 0 ? diff.length : newline;
    const next = newline < 0 ? diff.length : newline + 1;
    const size = Buffer.byteLength(diff.slice(cursor, next), "utf8");
    if (bytes + size > byteLimit) {
      if (rows > 0) break;
      const marker = "diff line truncated by the view budget";
      const prefix = safePrefix(diff.slice(cursor, lineEnd), Math.max(0, byteLimit - Buffer.byteLength(marker, "utf8")));
      state = advanceLine(diff.slice(cursor, lineEnd), state);
      return {
        text: prefix ? `${prefix}\n${marker}` : marker,
        ...(next < diff.length ? { next } : {}),
        ...state,
      };
    }
    state = advanceLine(diff.slice(cursor, lineEnd), state);
    bytes += size;
    rows += 1;
    cursor = next;
  }
  return {
    text: diff.slice(start, cursor),
    ...(cursor < diff.length ? { next: cursor } : {}),
    ...state,
  };
}

function advanceLine(raw: string, state: LineState): LineState {
  const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
  if (line.startsWith("@@")) {
    const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    return match
      ? { oldLine: Number(match[1]), newLine: Number(match[2]), inHunk: true }
      : { ...state, inHunk: true };
  }
  if (!state.inHunk) {
    if (/^(?:diff |index |rename |--- |\+\+\+ |\\ )/.test(line)) {
      return { ...state, inHunk: false };
    }
  }
  if (line.startsWith(" ")) return { oldLine: state.oldLine + 1, newLine: state.newLine + 1, inHunk: state.inHunk };
  if (line.startsWith("-")) return { oldLine: state.oldLine + 1, newLine: state.newLine, inHunk: state.inHunk };
  if (line.startsWith("+")) return { oldLine: state.oldLine, newLine: state.newLine + 1, inHunk: state.inHunk };
  return state;
}

function safePrefix(text: string, maxBytes: number): string {
  let bytes = 0;
  let end = 0;
  for (const character of text) {
    const width = Buffer.byteLength(character, "utf8");
    if (bytes + width > maxBytes) break;
    bytes += width;
    end += character.length;
  }
  return text.slice(0, end);
}

function utf8Width(code: number): number {
  if (code <= 0x7f) return 1;
  if (code <= 0x7ff) return 2;
  if (code <= 0xffff) return 3;
  return 4;
}
