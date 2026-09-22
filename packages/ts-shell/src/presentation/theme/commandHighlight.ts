import { defaultTheme } from "./theme.js";

const OPERATORS = new Set(["|", "||", "&&", "&", ";", ">", ">>", "<", "<<", "--"]);

/**
 * Format a shell command line into semantically colored tokens matching reference styling:
 * - Executables & commands: green (`command`, `#89d281`)
 * - Operators, pipes & redirects (> | && -- &): blue (`commandPipe`, `#178fb9`)
 * - Flags & options (-f, -v): blue (`commandFlag`, `#178fb9`)
 * - String literals & command text: light straw yellow (`commandString`, `#e5c07b`)
 * - Numeric arguments: brown / terracotta (`commandNumber`, `#ce9178`)
 * - File paths: green (`filename`, `#89d281`)
 * - Standard arguments: clean white (`commandArg`, `#d4d4d4`)
 */
export function formatCommandLine(cmd: string): string {
  if (!cmd?.trim()) return "";

  const tokens = cmd.match(/[^\s"'\\]+|"[^"]*"|'[^']*'/g);
  if (!tokens) return cmd;

  let isNextCommand = true;
  const parts: string[] = [];

  for (const token of tokens) {
    if (OPERATORS.has(token)) {
      parts.push(defaultTheme.fg("commandPipe", token));
      isNextCommand = true;
      continue;
    }

    if (token.startsWith("-")) {
      parts.push(defaultTheme.fg("commandFlag", token));
      isNextCommand = false;
      continue;
    }

    if (
      (token.startsWith('"') && token.endsWith('"')) ||
      (token.startsWith("'") && token.endsWith("'"))
    ) {
      parts.push(defaultTheme.fg("commandString", token));
      isNextCommand = false;
      continue;
    }

    if (/^\d+$/.test(token)) {
      parts.push(defaultTheme.fg("commandNumber", token));
      isNextCommand = false;
      continue;
    }

    if (
      token.includes("/") ||
      token.includes("\\") ||
      /\.[a-zA-Z0-9_-]+$/.test(token)
    ) {
      parts.push(defaultTheme.fg("filename", token));
      isNextCommand = false;
      continue;
    }

    if (isNextCommand) {
      parts.push(defaultTheme.bold(defaultTheme.fg("command", token)));
      isNextCommand = false;
      continue;
    }

    parts.push(defaultTheme.fg("commandArg", token));
  }

  return parts.join(" ");
}

/**
 * Format the detail field of a tool card according to its tool type.
 *
 * For shell commands: full syntax-segmented coloring.
 * For file operations: green filename coloring.
 * For generic tools: clean dimmed text.
 */
export function formatToolDetail(
  toolName: string | undefined,
  detail: string,
): string {
  if (!detail?.trim()) return "";
  if (toolName === "bash") {
    return formatCommandLine(detail);
  }
  if (
    toolName === "read" ||
    toolName === "write" ||
    toolName === "edit" ||
    toolName === "patch"
  ) {
    return defaultTheme.fg("filename", detail);
  }
  return defaultTheme.dim(detail);
}
