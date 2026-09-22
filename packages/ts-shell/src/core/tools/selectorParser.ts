/**
 * Embedded Line Selector Parser
 *
 * Supported formats:
 * - `file.ts:50-200` (inclusive line range 50 to 200)
 * - `file.ts:50+100` (100 lines starting from 50)
 * - `file.ts:50` or `file.ts:50-` (from line 50 to end)
 * - `file.ts:raw` (verbatim modifier)
 * - `artifact://0:50-200` (selectors applied to internal artifact logs)
 */

export interface ParsedPathSelector {
  readonly cleanPath: string;
  readonly startLine?: number;
  readonly endLine?: number;
  readonly isRaw: boolean;
  readonly hasSelector: boolean;
}

export function parsePathSelector(rawInput: string): ParsedPathSelector {
  if (!rawInput || typeof rawInput !== "string") {
    return { cleanPath: "", isRaw: false, hasSelector: false };
  }

  const trimmed = rawInput.trim();
  const colonIdx = trimmed.lastIndexOf(":");

  if (colonIdx <= 0) {
    return { cleanPath: trimmed, isRaw: false, hasSelector: false };
  }

  // Guard against Windows drive letters like C:\path\file.ts
  if (colonIdx === 1 && /^[a-zA-Z]$/.test(trimmed[0])) {
    return { cleanPath: trimmed, isRaw: false, hasSelector: false };
  }

  const cleanPath = trimmed.slice(0, colonIdx);
  const selector = trimmed.slice(colonIdx + 1).trim();

  if (!selector) {
    return { cleanPath, isRaw: false, hasSelector: false };
  }

  if (selector.toLowerCase() === "raw") {
    return { cleanPath, isRaw: true, hasSelector: true };
  }

  // Range pattern: 50-200
  const rangeMatch = selector.match(/^(\d+)-(\d+)$/);
  if (rangeMatch) {
    const startLine = Math.max(1, parseInt(rangeMatch[1], 10));
    const endLine = Math.max(startLine, parseInt(rangeMatch[2], 10));
    return { cleanPath, startLine, endLine, isRaw: false, hasSelector: true };
  }

  // Offset pattern: 50+100
  const offsetMatch = selector.match(/^(\d+)\+(\d+)$/);
  if (offsetMatch) {
    const startLine = Math.max(1, parseInt(offsetMatch[1], 10));
    const count = Math.max(1, parseInt(offsetMatch[2], 10));
    return { cleanPath, startLine, endLine: startLine + count - 1, isRaw: false, hasSelector: true };
  }

  // From-line pattern: 50 or 50-
  const fromMatch = selector.match(/^(\d+)-?$/);
  if (fromMatch) {
    const startLine = Math.max(1, parseInt(fromMatch[1], 10));
    return { cleanPath, startLine, isRaw: false, hasSelector: true };
  }

  return { cleanPath: trimmed, isRaw: false, hasSelector: false };
}

export function sliceLinesBySelector(
  lines: readonly string[],
  selector: ParsedPathSelector,
  defaultLimit: number = 500,
): { readonly selectedLines: string[]; readonly startLine: number; readonly endLine: number } {
  const total = lines.length;
  let start = 1;
  let end = total;

  if (selector.startLine != null) {
    start = Math.max(1, selector.startLine);
  }
  if (selector.endLine != null) {
    end = Math.min(total, selector.endLine);
  } else if (selector.startLine != null && !selector.isRaw) {
    end = Math.min(total, start + defaultLimit - 1);
  }

  const startIdx = Math.max(0, start - 1);
  const endIdx = Math.min(total, Math.max(startIdx, end));
  const selectedLines = lines.slice(startIdx, endIdx);

  return {
    selectedLines,
    startLine: startIdx + 1,
    endLine: endIdx,
  };
}
