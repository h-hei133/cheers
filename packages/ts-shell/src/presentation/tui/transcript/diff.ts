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
      rows.push(emphasised("-", split.removed, "toolDiffRemoved", width));
      rows.push(emphasised("+", split.added, "toolDiffAdded", width));
      index += 1;
      continue;
    }
    if (line.startsWith("+")) rows.push(plain("+", line.slice(1), "toolDiffAdded", width));
    else if (line.startsWith("-")) rows.push(plain("-", line.slice(1), "toolDiffRemoved", width));
    else rows.push(plain(" ", line.replace(/^ /, ""), "toolDiffContext", width));
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
  token: "toolDiffAdded" | "toolDiffRemoved",
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
  token: "toolDiffAdded" | "toolDiffRemoved" | "toolDiffContext",
  width: number,
): string {
  return defaultTheme.fg(token, truncateToWidth(`${marker}${text}`, width));
}
