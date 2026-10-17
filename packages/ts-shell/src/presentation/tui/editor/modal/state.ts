import { nextCluster, previousCluster, wordEnd, wordStart } from "../../text/motion.js";
import { graphemeBoundaries } from "../../text/measure.js";

/**
 * Modal editing state for the prompt.
 *
 * The machine reads a snapshot and a key, and returns an intent. It never holds
 * the buffer: undo, grapheme validation and draft adoption stay with the editor,
 * which is what keeps one keypress one undo step and keeps a stale selection
 * from editing text that has moved. Counts and pending operators are bounded;
 * no Vim script, shell or external macro is executed.
 */

export type VimMode = "insert" | "normal" | "visual" | "visual-line" | "replace";
export type VimOperator = "d" | "y" | "c";

export interface VimKey {
  readonly key: string;
  readonly text?: string;
  readonly ctrl?: boolean;
  readonly alt?: boolean;
  readonly meta?: boolean;
}

export interface VimState {
  readonly mode: VimMode;
  readonly count: number;
  readonly operator?: VimOperator;
  readonly pending?: "g" | "r" | "i" | "a" | "f" | "F" | "t" | "T";
  readonly anchor?: number;
  readonly register: string;
  readonly registerLinewise: boolean;
}

export type VimEffect =
  | { readonly kind: "edit"; readonly from: number; readonly to: number; readonly text: string; readonly cursorOffset?: number; readonly register?: { readonly text: string; readonly linewise: boolean } }
  | { readonly kind: "cursor"; readonly offset: number }
  | { readonly kind: "mode"; readonly mode: VimMode; readonly offset?: number }
  | { readonly kind: "undo" }
  | { readonly kind: "redo" }
  | { readonly kind: "none" };

const MAX_COUNT = 9999;

export function initialVimState(mode: VimMode = "insert"): VimState {
  return { mode, count: 0, register: "", registerLinewise: false };
}

export function feedVim(state: VimState, key: VimKey, text: string, cursor: number): { readonly state: VimState; readonly effect: VimEffect } {
  const bounded = Math.min(text.length, Math.max(0, cursor));
  if (state.mode === "insert") return insertKey(state, key, text, bounded);
  if (state.mode === "replace") {
    if (key.key === "escape") return { state: { ...state, mode: "normal" }, effect: { kind: "mode", mode: "normal" } };
    const character = key.text;
    if (!character || key.ctrl || key.alt || key.meta) return { state, effect: { kind: "none" } };
    return { state: { ...state, mode: "insert" }, effect: replaceCharacter(text, bounded, character) };
  }
  return normalKey(state, key, text, bounded);
}

function insertKey(state: VimState, key: VimKey, text: string, cursor: number): { state: VimState; effect: VimEffect } {
  if (key.key !== "escape") return { state, effect: { kind: "none" } };
  const offset = cursor > 0 && text[cursor - 1] !== "\n" ? previousCluster(lineAt(text, cursor).text, columnAt(text, cursor)) + lineStart(text, cursor) : cursor;
  return { state: { ...state, mode: "normal", count: 0, operator: undefined, pending: undefined, anchor: undefined }, effect: { kind: "mode", mode: "normal", offset } };
}

function normalKey(state: VimState, key: VimKey, text: string, cursor: number): { state: VimState; effect: VimEffect } {
  const clear = (): VimState => ({ ...state, count: 0, operator: undefined, pending: undefined,
    anchor: state.mode === "visual" || state.mode === "visual-line" ? state.anchor : undefined });
  if (key.key === "escape") {
    if (state.mode === "visual" || state.mode === "visual-line") return { state: { ...clear(), mode: "normal" }, effect: { kind: "mode", mode: "normal" } };
    return { state: clear(), effect: { kind: "none" } };
  }
  if (key.ctrl) {
    if (key.key === "r") return { state: clear(), effect: { kind: "redo" } };
    return { state, effect: { kind: "none" } };
  }
  const character = key.text ?? "";
  if (!character || key.alt || key.meta) return { state, effect: { kind: "none" } };

  if (/^[1-9]$/.test(character) || (character === "0" && state.count > 0)) {
    return { state: { ...state, count: Math.min(MAX_COUNT, state.count * 10 + Number(character)) }, effect: { kind: "none" } };
  }
  const count = state.count || 1;

  if (state.pending === "g") {
    if (character === "g") return { state: clear(), effect: { kind: "cursor", offset: applyMotion(text, cursor, "doc-start", count) } };
    return { state: clear(), effect: { kind: "none" } };
  }
  if (state.pending === "r") {
    if (character.length === 0) return { state: clear(), effect: { kind: "none" } };
    const effect = replaceCharacter(text, cursor, character);
    return { state: clear(), effect };
  }
  if (state.pending === "i" || state.pending === "a") {
    const range = textObject(text, cursor, character, state.pending === "a");
    if (!range) return { state: clear(), effect: { kind: "none" } };
    return applyOperator(state, text, range, true);
  }
  if (state.pending === "f" || state.pending === "F" || state.pending === "t" || state.pending === "T") {
    const target = findCharacter(text, cursor, character, state.pending);
    return { state: clear(), effect: target === undefined ? { kind: "none" } : { kind: "cursor", offset: target } };
  }

  if (state.mode === "visual" || state.mode === "visual-line") {
    if (character === "d" || character === "y" || character === "c") {
      const anchor = state.anchor ?? cursor;
      const first = Math.min(anchor, cursor);
      const last = Math.max(anchor, cursor);
      const range = state.mode === "visual-line"
        ? { from: lineStart(text, first), to: lineEndOffset(text, last) < text.length ? lineEndOffset(text, last) + 1 : lineEndOffset(text, last), linewise: true }
        : { from: first, to: nextOffset(text, last), linewise: false };
      return applyOperator({ ...state, operator: character }, text, range, false);
    }
  }
  if (state.operator) {
    if (character === state.operator) {
      const range = lineRange(text, cursor);
      return applyOperator(state, text, range, false);
    }
    if (character === "i" || character === "a") return { state: { ...state, pending: character, count: 0 }, effect: { kind: "none" } };
    const target = motionTarget(text, cursor, character, count);
    if (target === undefined) return { state: clear(), effect: { kind: "none" } };
    return applyOperator(state, text, { from: Math.min(cursor, target), to: Math.max(cursor, target), linewise: false }, false);
  }

  switch (character) {
    case "h": return { state: clear(), effect: { kind: "cursor", offset: applyMotion(text, cursor, "left", count) } };
    case "l": return { state: clear(), effect: { kind: "cursor", offset: applyMotion(text, cursor, "right", count) } };
    case "j": return { state: clear(), effect: { kind: "cursor", offset: applyMotion(text, cursor, "down", count) } };
    case "k": return { state: clear(), effect: { kind: "cursor", offset: applyMotion(text, cursor, "up", count) } };
    case "0": return { state: clear(), effect: { kind: "cursor", offset: applyMotion(text, cursor, "line-start", 1) } };
    case "$": return { state: clear(), effect: { kind: "cursor", offset: applyMotion(text, cursor, "line-end", count) } };
    case "w": return { state: clear(), effect: { kind: "cursor", offset: applyMotion(text, cursor, "word-forward", count) } };
    case "b": return { state: clear(), effect: { kind: "cursor", offset: applyMotion(text, cursor, "word-back", count) } };
    case "e": return { state: clear(), effect: { kind: "cursor", offset: applyMotion(text, cursor, "word-end", count) } };
    case "g": return { state: { ...state, pending: "g" }, effect: { kind: "none" } };
    case "G": return { state: clear(), effect: { kind: "cursor", offset: applyMotion(text, cursor, "doc-end", 1) } };
    case "i": return { state: { ...clear(), mode: "insert" }, effect: { kind: "mode", mode: "insert" } };
    case "a": return { state: { ...clear(), mode: "insert" }, effect: { kind: "mode", mode: "insert", offset: nextOffset(text, cursor) } };
    case "I": return { state: { ...clear(), mode: "insert" }, effect: { kind: "mode", mode: "insert", offset: applyMotion(text, cursor, "line-start", 1) } };
    case "A": return { state: { ...clear(), mode: "insert" }, effect: { kind: "mode", mode: "insert", offset: lineEndOffset(text, cursor) } };
    case "o": return { state: { ...clear(), mode: "insert" }, effect: { kind: "edit", from: lineEndOffset(text, cursor), to: lineEndOffset(text, cursor), text: "\n", cursorOffset: 1 } };
    case "O": return { state: { ...clear(), mode: "insert" }, effect: { kind: "edit", from: lineStart(text, cursor), to: lineStart(text, cursor), text: "\n", cursorOffset: 0 } };
    case "x": return { state: clear(), effect: deleteRange(text, cursor, nextOffset(text, cursor)) };
    case "X": return { state: clear(), effect: deleteRange(text, cursor, previousOffset(text, cursor)) };
    case "D": return { state: clear(), effect: deleteRange(text, cursor, lineEndOffset(text, cursor)) };
    case "C": {
      const end = lineEndOffset(text, cursor);
      return { state: { ...clear(), mode: "insert" },
        effect: end > cursor ? { kind: "edit", from: cursor, to: end, text: "", cursorOffset: 0 } : { kind: "mode", mode: "insert" } };
    }
    case "d": case "y": case "c": return { state: { ...state, operator: character, count: 0 }, effect: { kind: "none" } };
    case "R": return { state: { ...clear(), mode: "replace" }, effect: { kind: "mode", mode: "replace" } };
    case "S": {
      const range = lineRange(text, cursor);
      return applyOperator({ ...state, operator: "c" }, text, range, false);
    }
    case "v": return { state: { ...clear(), mode: "visual", anchor: cursor }, effect: { kind: "mode", mode: "visual" } };
    case "V": return { state: { ...clear(), mode: "visual-line", anchor: cursor }, effect: { kind: "mode", mode: "visual-line" } };
    case "u": return { state: clear(), effect: { kind: "undo" } };
    case "p": case "P": return paste(state, text, cursor, character === "p");
    case "r": return { state: { ...state, pending: "r" }, effect: { kind: "none" } };
    default: return { state: clear(), effect: { kind: "none" } };
  }
}

function applyOperator(state: VimState, text: string, range: { from: number; to: number; linewise: boolean }, textObject: boolean): { state: VimState; effect: VimEffect } {
  const operator = state.operator ?? (textObject ? "d" : undefined);
  if (!operator) return { state, effect: { kind: "none" } };
  const from = Math.max(0, Math.min(range.from, range.to));
  // Change keeps the line itself: `cc`/`S` clear its content and leave the
  // newline, while `dd` removes the line boundary too.
  let to = Math.min(text.length, Math.max(range.from, range.to));
  if (operator === "c" && range.linewise && to > from && text[to - 1] === "\n") to -= 1;
  const yanked = text.slice(from, to);
  const register = { text: yanked, linewise: range.linewise };
  if (operator === "y") {
    return { state: { ...state, mode: "normal", count: 0, operator: undefined, pending: undefined, anchor: undefined, register: yanked, registerLinewise: range.linewise },
      effect: { kind: "cursor", offset: from } };
  }
  const mode = operator === "c" ? "insert" as const : "normal" as const;
  return { state: { ...state, mode, count: 0, operator: undefined, pending: undefined, anchor: undefined, register: yanked, registerLinewise: range.linewise },
    effect: { kind: "edit", from, to, text: "", cursorOffset: 0, register } };
}

function paste(state: VimState, text: string, cursor: number, after: boolean): { state: VimState; effect: VimEffect } {
  if (!state.register) return { state, effect: { kind: "none" } };
  if (state.registerLinewise) {
    const end = lineEndOffset(text, cursor);
    const at = after ? (end < text.length ? end + 1 : end) : lineStart(text, cursor);
    const inserted = after ? state.register : state.register.replace(/\n$/, "") + "\n";
    return { state: { ...state, count: 0, mode: "normal" }, effect: { kind: "edit", from: at, to: at, text: inserted, cursorOffset: 0 } };
  }
  const at = after ? nextOffset(text, cursor) : cursor;
  return { state: { ...state, count: 0, mode: "normal" }, effect: { kind: "edit", from: at, to: at, text: state.register, cursorOffset: 0 } };
}

function deleteRange(text: string, from: number, to: number): VimEffect {
  const start = Math.min(from, to); const end = Math.max(from, to);
  if (start === end) return { kind: "none" };
  return { kind: "edit", from: start, to: end, text: "", cursorOffset: 0 };
}

function replaceCharacter(text: string, cursor: number, character: string): VimEffect {
  const end = nextOffset(text, cursor);
  if (end === cursor) return { kind: "none" };
  return { kind: "edit", from: cursor, to: end, text: character, cursorOffset: Math.max(0, character.length - 1) };
}

function textObject(text: string, cursor: number, object: string, around: boolean): { from: number; to: number; linewise: boolean } | undefined {
  if (object !== "w" && object !== "W") return undefined;
  const line = lineAt(text, cursor);
  const start = lineStart(text, cursor);
  const column = cursor - start;
  let from = wordStart(line.text, column);
  let to = wordEnd(line.text, column);
  if (around) {
    while (to < line.text.length && /\s/.test(line.text[to]!)) to += 1;
  }
  return { from: start + from, to: start + to, linewise: false };
}

function findCharacter(text: string, cursor: number, character: string, kind: "f" | "F" | "t" | "T"): number | undefined {
  const line = lineAt(text, cursor);
  const start = lineStart(text, cursor);
  const column = cursor - start;
  const index = kind === "f" || kind === "t"
    ? line.text.indexOf(character, column + 1)
    : line.text.lastIndexOf(character, Math.max(0, column - 1));
  if (index < 0) return undefined;
  const target = kind === "t" ? index - 1 : kind === "T" ? index + 1 : index;
  return start + Math.max(0, Math.min(line.text.length, target));
}

function motionTarget(text: string, cursor: number, character: string, count: number): number | undefined {
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

function applyMotion(text: string, cursor: number, motion: string, count: number): number {
  let offset = cursor;
  for (let step = 0; step < count; step++) offset = oneMotion(text, offset, motion);
  return offset;
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
  const line = lineAt(text, offset);
  const column = offset - lineStart(text, offset);
  const target = line.index + direction;
  const lines = text.split("\n");
  if (target < 0 || target >= lines.length) return offset;
  const targetStart = lines.slice(0, target).reduce((sum, value) => sum + value.length + 1, 0);
  return targetStart + Math.min(column, lines[target]!.length);
}

function wordForward(text: string, offset: number): number {
  const line = lineAt(text, offset);
  const column = offset - lineStart(text, offset);
  const rest = line.text.slice(column);
  const match = /\S+\s*/.exec(rest);
  if (match && match.index + match[0].length < rest.length) return lineStart(text, offset) + column + match.index + match[0].length;
  const next = lineEndOffset(text, offset) + 1;
  return next <= text.length ? next : offset;
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
  const line = lineAt(text, offset);
  const start = lineStart(text, offset);
  const column = offset - start;
  let end = wordEnd(line.text, column);
  while (end > column && /\s/.test(line.text[end - 1]!)) end -= 1;
  if (end > column) return start + previousCluster(line.text, end);
  const next = lineEndOffset(text, offset) + 1;
  return next <= text.length ? next : offset;
}

function nextOffset(text: string, offset: number): number {
  const line = lineAt(text, offset);
  const column = offset - lineStart(text, offset);
  if (column < line.text.length) return lineStart(text, offset) + nextCluster(line.text, column);
  return offset < text.length ? offset + 1 : offset;
}

function previousOffset(text: string, offset: number): number {
  const line = lineAt(text, offset);
  const column = offset - lineStart(text, offset);
  if (column > 0) return lineStart(text, offset) + previousCluster(line.text, column);
  return offset > 0 ? offset - 1 : offset;
}

function lineAt(text: string, offset: number): { index: number; text: string } {
  const start = lineStart(text, offset);
  const end = lineEndOffset(text, offset);
  const index = text.slice(0, start).split("\n").length - 1;
  return { index, text: text.slice(start, end) };
}

function columnAt(text: string, offset: number): number { return offset - lineStart(text, offset); }

function lineStart(text: string, offset: number): number {
  const before = text.lastIndexOf("\n", Math.max(0, offset - 1));
  return before < 0 ? 0 : before + 1;
}

function lineEndOffset(text: string, offset: number): number {
  const next = text.indexOf("\n", offset);
  return next < 0 ? text.length : next;
}

function lineRange(text: string, cursor: number): { from: number; to: number; linewise: boolean } {
  const from = lineStart(text, cursor);
  const end = lineEndOffset(text, cursor);
  return { from, to: end < text.length ? end + 1 : end, linewise: true };
}

/** Whether `offset` is a grapheme boundary, so the editor can apply a cursor intent. */
export function validCursor(text: string, offset: number): boolean {
  return Number.isInteger(offset) && offset >= 0 && offset <= text.length && graphemeBoundaries(text).includes(offset);
}
