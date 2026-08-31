/**
 * Streaming Markdown Code Fence Stabilizer
 *
 * Prevents terminal UI flickering when partial closing fences (e.g. `` ` `` or `` `` ``)
 * arrive at the tail of a streaming chunk before the full closing marker is received.
 */

export function trimPartialClosingFences(text: string): { readonly text: string; readonly trimmed: boolean } {
  if (!text || typeof text !== "string") {
    return { text: "", trimmed: false };
  }

  const lines = text.split("\n");
  if (lines.length === 0) {
    return { text, trimmed: false };
  }

  const lastLine = lines[lines.length - 1];

  // Check if last line is an incomplete backtick or tilde fence (1 or 2 backticks)
  if (/^(`{1,2}|~{1,2})$/.test(lastLine.trim())) {
    lines.pop();
    return {
      text: lines.join("\n"),
      trimmed: true,
    };
  }

  return { text, trimmed: false };
}

/**
 * Basic syntax highlighting decorator for streaming code blocks.
 */
export function formatCodeBlockWithBorder(
  code: string,
  lang: string = "",
): string {
  const header = `\x1b[90m┌── ${lang ? `[${lang}]` : "code"} ──────────────────────────────\x1b[0m`;
  const footer = `\x1b[90m└────────────────────────────────────────\x1b[0m`;
  const body = code
    .split("\n")
    .map((line) => `\x1b[90m│\x1b[0m ${line}`)
    .join("\n");

  return `${header}\n${body}\n${footer}`;
}
