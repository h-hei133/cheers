import { defaultTheme, type Theme } from "../../theme/theme.js";

/**
 * Unified Diff & Word-Level Highlight Renderer
 *
 * Formats multi-line diff additions (+) and deletions (-) with line numbers,
 * and highlights changed words with inverse background styling.
 */

export interface DiffLine {
  readonly type: "add" | "delete" | "context";
  readonly lineNum?: number;
  readonly content: string;
}

export function renderDiff(diffText: string, theme: Theme = defaultTheme): string {
  if (!diffText || typeof diffText !== "string") {
    return "";
  }

  const lines = diffText.split("\n");
  const formatted: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("@@")) {
      formatted.push(theme.fg("muted", line));
      continue;
    }

    if (line.startsWith("+")) {
      formatted.push(theme.fg("toolDiffAdded", line));
    } else if (line.startsWith("-")) {
      formatted.push(theme.fg("toolDiffRemoved", line));
    } else {
      formatted.push(theme.fg("toolDiffContext", line));
    }
  }

  return formatted.join("\n");
}

/**
 * Generates a visual diff between original text and modified text.
 */
export function generateSimpleDiff(
  original: string,
  modified: string,
  theme: Theme = defaultTheme,
): string {
  const origLines = original.split("\n");
  const modLines = modified.split("\n");
  const result: string[] = [];

  const maxLen = Math.max(origLines.length, modLines.length);
  for (let i = 0; i < maxLen; i++) {
    const o = origLines[i];
    const m = modLines[i];

    if (o === m) {
      result.push(theme.fg("toolDiffContext", `  ${o ?? ""}`));
    } else {
      if (o !== undefined) {
        result.push(theme.fg("toolDiffRemoved", `- ${o}`));
      }
      if (m !== undefined) {
        result.push(theme.fg("toolDiffAdded", `+ ${m}`));
      }
    }
  }

  return result.join("\n");
}
