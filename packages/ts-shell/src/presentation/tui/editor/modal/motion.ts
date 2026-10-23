import { nextCluster, previousCluster, wordStart } from "../../text/motion.js";
import { graphemeBoundaries } from "../../text/measure.js";
import { lineAt, lineEndOffset, lineStart, nextOffset } from "./buffer.js";

const WHITESPACE = /\s/;

export function applyMotion(text: string, cursor: number, motion: string, count: number): number {
  if (motion === "line-start") return lineStart(text, cursor);
  if (motion === "doc-start") return 0;
  if (motion === "doc-end") return text.length;
  if (motion === "left" || motion === "right" || motion === "line-end") {
    const line = lineAt(text, cursor);
    const start = lineStart(text, cursor);
    const boundaries = graphemeBoundaries(line.text);
    const last = line.text.length > 0 ? boundaries.length - 2 : 0;
    let current = 0;
    for (let index = 0; index < boundaries.length; index++) {
      if (boundaries[index]! > cursor - start) break;
      current = index;
    }
    if (motion === "line-end") return start + boundaries[last]!;
    const target = motion === "right" ? Math.min(last, current + count) : Math.max(0, current - count);
    return start + boundaries[target]!;
  }
  if (motion === "up" || motion === "down") return verticalCount(text, cursor, motion === "up" ? -1 : 1, count);
  if (motion === "word-forward") return wordForwardCount(text, cursor, count);
  if (motion === "word-end") return wordEndCount(text, cursor, count);
  let offset = cursor;
  for (let step = 0; step < count; step++) {
    const next = oneMotion(text, offset, motion);
    if (next === offset) break;
    offset = next;
  }
  return offset;
}

export function findCharacter(text: string, cursor: number, character: string,
  kind: "f" | "F" | "t" | "T", count = 1): number | undefined {
  let current = cursor;
  let searchFrom = cursor;
  for (let occurrence = 0; occurrence < count; occurrence++) {
    const line = lineAt(text, searchFrom);
    const start = lineStart(text, searchFrom);
    const localFrom = Math.max(0, Math.min(line.text.length, searchFrom - start));
    const boundaries = graphemeBoundaries(line.text);
    let found = -1;
    if (kind === "f" || kind === "t") {
      for (let index = 1; index < boundaries.length; index++) {
        const clusterStart = boundaries[index - 1]!;
        if (clusterStart <= localFrom) continue;
        if (line.text.slice(clusterStart, boundaries[index]!) === character) {
          found = index - 1;
          break;
        }
      }
    } else {
      for (let index = boundaries.length - 1; index > 0; index--) {
        const clusterStart = boundaries[index - 1]!;
        if (clusterStart >= localFrom) continue;
        if (line.text.slice(clusterStart, boundaries[index]!) === character) {
          found = index - 1;
          break;
        }
      }
    }
    if (found < 0) return undefined;
    const clusterStart = boundaries[found]!;
    const clusterEnd = boundaries[found + 1]!;
    const target = kind === "t" ? (found > 0 ? boundaries[found - 1]! : 0)
      : kind === "T" ? clusterEnd : clusterStart;
    current = start + target;
    searchFrom = start + clusterStart;
  }
  return current;
}

export function motionTarget(text: string, cursor: number, character: string, count: number): number | undefined {
  switch (character) {
    case "h": return applyMotion(text, cursor, "left", count);
    case "l": return applyMotion(text, cursor, "right", count);
    case "j": return applyMotion(text, cursor, "down", count);
    case "k": return applyMotion(text, cursor, "up", count);
    case "0": return applyMotion(text, cursor, "line-start", 1);
    case "$": return applyMotion(text, cursor, "line-end", count);
    case "w": return applyMotion(text, cursor, "word-forward", count);
    case "b": return applyMotion(text, cursor, "word-back", count);
    case "e": return applyMotion(text, cursor, "word-end", count);
    case "G": return applyMotion(text, cursor, "doc-end", 1);
    default: return undefined;
  }
}

export function operatorRange(text: string, cursor: number, target: number, motion: string):
{ from: number; to: number; linewise: false } {
  const forward = target >= cursor;
  const inclusive = motion === "e" || motion === "$" || motion === "f" || motion === "t"
    || motion === "F" || motion === "T";
  const from = forward ? cursor : target;
  const to = forward
    ? inclusive ? nextOffset(text, target) : target
    : inclusive ? nextOffset(text, cursor) : cursor;
  return { from, to, linewise: false };
}

function oneMotion(text: string, offset: number, motion: string): number {
  const line = lineAt(text, offset);
  const start = lineStart(text, offset);
  const column = offset - start;
  switch (motion) {
    case "left": return column > 0 ? start + previousCluster(line.text, column) : offset;
    case "right": {
      const last = line.text.length > 0 ? previousCluster(line.text, line.text.length) : 0;
      return column >= last ? start + last : start + nextCluster(line.text, column);
    }
    case "up": return vertical(text, offset, -1);
    case "down": return vertical(text, offset, 1);
    case "line-start": return start;
    case "line-end": return start + Math.max(0, line.text.length > 0 ? previousCluster(line.text, line.text.length) : 0);
    case "word-forward": return wordForward(text, offset);
    case "word-back": return wordBack(text, offset);
    case "word-end": return wordEndForward(text, offset);
    case "doc-start": return 0;
    case "doc-end": return text.length;
    default: return offset;
  }
}

function vertical(text: string, offset: number, direction: -1 | 1): number {
  return verticalCount(text, offset, direction, 1);
}

function verticalCount(text: string, offset: number, direction: -1 | 1, count: number): number {
  const line = lineAt(text, offset);
  const lines = text.split("\n");
  const starts = [0];
  for (let index = 0; index < lines.length - 1; index++) starts.push(starts[index]! + lines[index]!.length + 1);
  let currentLine = line.index;
  let current = offset;
  for (let step = 0; step < count; step++) {
    const target = currentLine + direction;
    if (target < 0 || target >= lines.length) break;
    const column = current - starts[currentLine]!;
    const targetLine = lines[target]!;
    const targetColumn = Math.min(column, targetLine.length);
    let boundary = 0;
    for (const candidate of graphemeBoundaries(targetLine)) {
      if (candidate > targetColumn) break;
      boundary = candidate;
    }
    current = starts[target]! + boundary;
    currentLine = target;
  }
  return current;
}

function wordForward(text: string, offset: number): number {
  return wordForwardCount(text, offset, 1);
}

function wordForwardCount(text: string, offset: number, count: number): number {
  let current = offset;
  for (let step = 0; step < count; step++) {
    let next = current;
    while (next < text.length && !WHITESPACE.test(text[next]!)) next += 1;
    while (next < text.length && WHITESPACE.test(text[next]!)) next += 1;
    if (next >= text.length) break;
    current = next;
  }
  return current;
}

function wordBack(text: string, offset: number): number {
  const line = lineAt(text, offset);
  const start = lineStart(text, offset);
  const column = offset - start;
  if (column > 0) return start + wordStart(line.text, column);
  if (line.index === 0) return offset;
  const previous = text.split("\n")[line.index - 1] ?? "";
  const previousStart = start - previous.length - 1;
  return previousStart + wordStart(previous, previous.length);
}

function wordEndForward(text: string, offset: number): number {
  return wordEndCount(text, offset, 1);
}

function wordEndCount(text: string, offset: number, count: number): number {
  let current = offset;
  for (let step = 0; step < count; step++) {
    let at = current;
    if (at >= text.length) break;
    if (!WHITESPACE.test(text[at]!)) {
      let end = at;
      while (end < text.length && !WHITESPACE.test(text[end]!)) end += 1;
      const start = lineStart(text, at);
      const lineEnd = lineEndOffset(text, at);
      const wordEnd = Math.min(end, lineEnd);
      const currentClusterEnd = start + nextCluster(text.slice(start, lineEnd), at - start);
      if (currentClusterEnd < wordEnd) {
        current = lastClusterBefore(text, wordEnd);
        continue;
      }
      at = end;
    }
    while (at < text.length && WHITESPACE.test(text[at]!)) at += 1;
    if (at >= text.length) break;
    let end = at;
    while (end < text.length && !WHITESPACE.test(text[end]!)) end += 1;
    current = lastClusterBefore(text, end);
  }
  return current;
}

function lastClusterBefore(text: string, end: number): number {
  const start = lineStart(text, end);
  return start + previousCluster(text.slice(start, lineEndOffset(text, end)), end - start);
}
