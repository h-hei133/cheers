/**
 * Directional Dual-Budget Truncation Engine
 *
 * Implements:
 * 1. Head Truncation: Preserves the first N lines/bytes (ideal for read and grep)
 * 2. Tail Truncation: Preserves the last N lines/bytes (ideal for bash and test runs)
 * 3. Line Width Truncation: Capping per-line width to prevent minified files from blowing tokens
 */

export interface TruncationBudget {
  readonly maxLines?: number;
  readonly maxBytes?: number;
}

export interface TruncationResult {
  readonly content: string;
  readonly truncated: boolean;
  readonly originalLines: number;
  readonly originalBytes: number;
  readonly shownLines: number;
  readonly shownBytes: number;
  readonly direction: "head" | "tail" | "none";
  readonly firstLineExceedsLimit?: boolean;
  readonly firstLineBytes?: number;
}

const DEFAULT_MAX_LINES = 2000;
const DEFAULT_MAX_BYTES = 50 * 1024; // 50KB

export function truncateHead(
  content: string,
  budget: TruncationBudget = {},
): TruncationResult {
  const maxLines = budget.maxLines ?? DEFAULT_MAX_LINES;
  const maxBytes = budget.maxBytes ?? DEFAULT_MAX_BYTES;

  const totalBytes = Buffer.byteLength(content, "utf8");
  const lines = content.split("\n");
  const totalLines = lines.length;

  if (totalLines <= maxLines && totalBytes <= maxBytes) {
    return {
      content,
      truncated: false,
      originalLines: totalLines,
      originalBytes: totalBytes,
      shownLines: totalLines,
      shownBytes: totalBytes,
      direction: "none",
    };
  }
  const firstLineBytes = Buffer.byteLength(lines[0], "utf8");
  if (firstLineBytes > maxBytes) {
    return {
      content: "",
      truncated: true,
      originalLines: totalLines,
      originalBytes: totalBytes,
      shownLines: 0,
      shownBytes: 0,
      direction: "head",
      firstLineExceedsLimit: true,
      firstLineBytes,
    };
  }

  const resultLines: string[] = [];
  let currentBytes = 0;

  for (let i = 0; i < lines.length && i < maxLines; i++) {
    const line = lines[i];
    const lineBytes = Buffer.byteLength(line, "utf8") + (i > 0 ? 1 : 0);
    if (currentBytes + lineBytes > maxBytes && resultLines.length > 0) {
      break;
    }
    resultLines.push(line);
    currentBytes += lineBytes;
  }
  const truncatedContent = resultLines.join("\n");
  return {
    content: truncatedContent,
    truncated: true,
    originalLines: totalLines,
    originalBytes: totalBytes,
    shownLines: resultLines.length,
    shownBytes: Buffer.byteLength(truncatedContent, "utf8"),
    direction: "head",
  };
}

export function truncateTail(
  content: string,
  budget: TruncationBudget = {},
): TruncationResult {
  const maxLines = budget.maxLines ?? DEFAULT_MAX_LINES;
  const maxBytes = budget.maxBytes ?? DEFAULT_MAX_BYTES;

  const totalBytes = Buffer.byteLength(content, "utf8");
  const lines = content.split("\n");
  const totalLines = lines.length;

  if (totalLines <= maxLines && totalBytes <= maxBytes) {
    return {
      content,
      truncated: false,
      originalLines: totalLines,
      originalBytes: totalBytes,
      shownLines: totalLines,
      shownBytes: totalBytes,
      direction: "none",
    };
  }

  const resultLines: string[] = [];
  let currentBytes = 0;

  for (let i = lines.length - 1; i >= 0 && resultLines.length < maxLines; i--) {
    const line = lines[i];
    const lineBytes = Buffer.byteLength(line, "utf8") + (resultLines.length > 0 ? 1 : 0);
    if (currentBytes + lineBytes > maxBytes && resultLines.length > 0) {
      break;
    }
    resultLines.unshift(line);
    currentBytes += lineBytes;
  }

  const truncatedContent = resultLines.join("\n");
  return {
    content: truncatedContent,
    truncated: true,
    originalLines: totalLines,
    originalBytes: totalBytes,
    shownLines: resultLines.length,
    shownBytes: Buffer.byteLength(truncatedContent, "utf8"),
    direction: "tail",
  };
}

export function truncateLineWidth(line: string, maxChars: number = 500): string {
  if (line.length <= maxChars) return line;
  return line.slice(0, maxChars) + " … [truncated]";
}
