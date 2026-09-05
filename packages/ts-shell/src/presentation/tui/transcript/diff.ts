import { defaultTheme } from "../../theme/theme.js";
import { truncateToWidth } from "../text/layout.js";

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

/** Rows for a unified diff, each fitted to `width`. */
export function renderDiff(diff: string, width: number): string[] {
  if (!diff) return [];
  const lines = diff.split("\n");
  const rows: string[] = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    if (HUNK_PREFIXES.some((prefix) => line.startsWith(prefix))) {
      rows.push(defaultTheme.fg("muted", truncateToWidth(line, width)));
      continue;
    }
    const next = lines[index + 1];
    if (line.startsWith("-") && next?.startsWith("+")) {
      const split = splitEmphasis(line.slice(1), next.slice(1));
      rows.push(emphasised("-", split.removed, "diffRemoved", width));
      rows.push(emphasised("+", split.added, "diffAdded", width));
      index += 1;
      continue;
    }
    if (line.startsWith("+")) rows.push(plain("+", line.slice(1), "diffAdded", width));
    else if (line.startsWith("-")) rows.push(plain("-", line.slice(1), "diffRemoved", width));
    else rows.push(plain(" ", line.replace(/^ /, ""), "diffContext", width));
  }
  return rows;
}

/** Shared prefix and suffix of a removed/added pair, with the differing middles. */
function splitEmphasis(removed: string, added: string): { removed: Emphasis; added: Emphasis } {
  let head = 0;
  const limit = Math.min(removed.length, added.length);
  while (head < limit && removed[head] === added[head]) head += 1;
  let tail = 0;
  while (tail < limit - head && removed[removed.length - 1 - tail] === added[added.length - 1 - tail]) tail += 1;
  return {
    removed: {
      head: removed.slice(0, head),
      body: removed.slice(head, removed.length - tail),
      tail: removed.slice(removed.length - tail),
    },
    added: {
      head: added.slice(0, head),
      body: added.slice(head, added.length - tail),
      tail: added.slice(added.length - tail),
    },
  };
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
 * up to two lines of context, and produces a standard unified diff format.
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
