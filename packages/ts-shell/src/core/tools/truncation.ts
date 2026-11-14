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
  readonly lastLinePartial?: boolean;
}

export const DEFAULT_MAX_LINES = 2000;
export const DEFAULT_MAX_BYTES = 50 * 1024; // 50KB

/** Cut a string at a complete UTF-8 character boundary in either direction. */
export function truncateTextBytes(text: string, maxBytes: number, direction: "head" | "tail" = "head"): string {
  const limit = Number.isFinite(maxBytes) ? Math.max(0, Math.floor(maxBytes)) : DEFAULT_MAX_BYTES;
  const bytes = Buffer.from(text, "utf8");
  if (bytes.length <= limit) return text;
  if (direction === "tail") {
    let start = bytes.length - limit;
    while (start < bytes.length && (bytes[start]! & 0xc0) === 0x80) start++;
    return bytes.subarray(start).toString("utf8");
  }
  let end = limit;
  while (end > 0 && (bytes[end]! & 0xc0) === 0x80) end--;
  return bytes.subarray(0, end).toString("utf8");
}

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
  let lastLinePartial = false;

  for (let i = lines.length - 1; i >= 0 && resultLines.length < maxLines; i--) {
    const line = lines[i]!;
    const lineBytes = Buffer.byteLength(line, "utf8") + (resultLines.length > 0 ? 1 : 0);
    if (currentBytes + lineBytes > maxBytes) {
      if (resultLines.length === 0) {
        const partial = truncateTextBytes(line, maxBytes, "tail");
        resultLines.unshift(partial);
        currentBytes = Buffer.byteLength(partial, "utf8");
        lastLinePartial = true;
      }
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
    ...(lastLinePartial ? { lastLinePartial: true } : {}),
  };
}

export function truncateLineWidth(line: string, maxChars: number = 500): string {
  if (line.length <= maxChars) return line;
  let end = Math.max(0, maxChars);
  if (end > 0) {
    const code = line.charCodeAt(end - 1);
    if (code >= 0xd800 && code <= 0xdbff) end -= 1;
  }
  return line.slice(0, end) + " … [truncated]";
}
