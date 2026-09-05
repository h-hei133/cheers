import { defaultTheme } from "./theme.js";

const OPERATORS = new Set(["|", "||", "&&", "&", ";", ">", ">>", "<", "<<"]);

/**
 * Format a shell command line into semantically colored tokens.
 *
 * Provides clear visual differentiation:
 * - Executables & commands: yellow (`command`)
 * - Flags & options: blue (`commandFlag`)
 * - String literals: warm brown/terracotta (`commandString`)
 * - Numeric arguments: soft green (`commandNumber`)
 * - File paths: light sky blue (`filename`)
 * - Operators, pipes & redirects: warm golden amber (`commandPipe`)
 * - Standard arguments: clean soft white (`commandArg`)
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
 * For file operations: distinct filename coloring (light sky blue).
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
