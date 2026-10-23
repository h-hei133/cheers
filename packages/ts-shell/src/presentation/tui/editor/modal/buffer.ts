import { nextCluster, previousCluster } from "../../text/motion.js";

export function columnAt(text: string, offset: number): number {
  return offset - lineStart(text, offset);
}

export function lineAt(text: string, offset: number): { index: number; text: string } {
  const start = lineStart(text, offset);
  const end = lineEndOffset(text, offset);
  const index = text.slice(0, start).split("\n").length - 1;
  return { index, text: text.slice(start, end) };
}

export function lineStart(text: string, offset: number): number {
  if (offset <= 0) return 0;
  const before = text.lastIndexOf("\n", offset - 1);
  return before < 0 ? 0 : before + 1;
}

export function lineEndOffset(text: string, offset: number): number {
  const next = text.indexOf("\n", offset);
  return next < 0 ? text.length : next;
}

export function lineEndForCount(text: string, offset: number, count: number): number {
  let end = lineEndOffset(text, offset);
  for (let index = 1; index < count && end < text.length; index++) end = lineEndOffset(text, end + 1);
  return end;
}

export function lineOffset(text: string, lineIndex: number): number {
  const lines = text.split("\n");
  const index = Math.max(0, Math.min(lines.length - 1, lineIndex));
  return lines.slice(0, index).reduce((sum, value) => sum + value.length + 1, 0);
}

export function lineRange(text: string, cursor: number, count = 1): { from: number; to: number; linewise: boolean } {
  const from = lineStart(text, cursor);
  let end = lineEndOffset(text, cursor);
  for (let index = 1; index < count && end < text.length; index++) end = lineEndOffset(text, end + 1);
  return { from, to: end < text.length ? end + 1 : end, linewise: true };
}

export function nextOffset(text: string, offset: number): number {
  const line = lineAt(text, offset);
  const column = offset - lineStart(text, offset);
  if (column < line.text.length) return lineStart(text, offset) + nextCluster(line.text, column);
  return offset;
}

export function previousOffset(text: string, offset: number): number {
  const line = lineAt(text, offset);
  const column = offset - lineStart(text, offset);
  if (column > 0) return lineStart(text, offset) + previousCluster(line.text, column);
  return offset;
}

export function repeatOffset(text: string, cursor: number, count: number, backward: boolean): number {
  let offset = cursor;
  for (let index = 0; index < count; index++) {
    const next = backward ? previousOffset(text, offset) : nextOffset(text, offset);
    if (next === offset) break;
    offset = next;
  }
  return offset;
}
