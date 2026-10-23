import { nextCluster, previousCluster, wordEnd, wordStart } from "../../text/motion.js";
import { graphemeBoundaries } from "../../text/measure.js";
import {
  columnAt,
  lineAt,
  lineEndForCount,
  lineEndOffset,
  lineOffset,
  lineRange,
  lineStart,
  nextOffset,
  repeatOffset,
} from "./buffer.js";
import { applyMotion, findCharacter, motionTarget, operatorRange } from "./motion.js";
import type { VimEffect, VimKey, VimMode, VimState } from "./types.js";

export type { VimEffect, VimKey, VimMode, VimOperator, VimState } from "./types.js";

/**
 * Modal editing state for the prompt.
 *
 * The machine reads a snapshot and a key, and returns an intent. It never holds
 * the buffer: undo, grapheme validation and draft adoption stay with the editor,
 * which is what keeps one keypress one undo step and keeps a stale selection
 * from editing text that has moved. Counts and pending operators are bounded;
 * no Vim script, shell or external macro is executed.
 */

const MAX_COUNT = 9999;

export function initialVimState(mode: VimMode = "insert"): VimState {
  return { mode, count: 0, register: "", registerLinewise: false };
}

export function feedVim(state: VimState, key: VimKey, text: string, cursor: number): { readonly state: VimState; readonly effect: VimEffect } {
  const bounded = Math.min(text.length, Math.max(0, cursor));
  if (state.mode === "insert") return insertKey(state, key, text, bounded);
  if (state.mode === "replace") {
    if (key.key === "escape") {
      const offset = bounded > 0 && text[bounded - 1] !== "\n"
        ? previousCluster(lineAt(text, bounded).text, columnAt(text, bounded)) + lineStart(text, bounded)
        : bounded;
      return {
        state: { ...state, mode: "normal", replaceHistory: undefined },
        effect: { kind: "mode", mode: "normal", offset },
      };
    }
    if (key.key === "backspace") {
      const history = state.replaceHistory ?? [];
      const entry = history.at(-1);
      if (!entry || bounded !== entry.offset + entry.inserted.length
        || text.slice(entry.offset, entry.offset + entry.inserted.length) !== entry.inserted) {
        return { state: { ...state, replaceHistory: [] }, effect: { kind: "none" } };
      }
      return {
        state: { ...state, replaceHistory: history.slice(0, -1) },
        effect: {
          kind: "edit",
          from: entry.offset,
          to: entry.offset + entry.inserted.length,
          text: entry.removed,
          cursorOffset: 0,
        },
      };
    }
    if (key.key === "delete") {
      const to = nextOffset(text, bounded);
      return {
        state: { ...state, replaceHistory: undefined },
        effect: to === bounded
          ? { kind: "none" }
          : { kind: "edit", from: bounded, to, text: "", cursorOffset: 0 },
      };
    }
    const motion = key.key === "left" ? "left"
      : key.key === "right" ? "right"
        : key.key === "up" ? "up"
          : key.key === "down" ? "down"
            : key.key === "line-start" ? "line-start"
              : key.key === "line-end" ? "line-end"
                : undefined;
    if (motion) return { state, effect: { kind: "cursor", offset: applyMotion(text, bounded, motion, 1) } };
    const character = key.text;
    if (!character || key.ctrl || key.alt || key.meta) return { state, effect: { kind: "none" } };
    const effect = replaceCharacter(text, bounded, character, true);
    if (effect.kind !== "edit") return { state, effect };
    const history = state.replaceHistory ?? [];
    return {
      state: {
        ...state,
        replaceHistory: [...history, {
          offset: effect.from,
          inserted: character,
          removed: text.slice(effect.from, effect.to),
        }].slice(-256),
      },
      effect,
    };
  }
  return normalKey(state, key, text, bounded);
}

function insertKey(state: VimState, key: VimKey, text: string, cursor: number): { state: VimState; effect: VimEffect } {
  if (key.key !== "escape") return { state, effect: { kind: "none" } };
  const offset = cursor > 0 && text[cursor - 1] !== "\n" ? previousCluster(lineAt(text, cursor).text, columnAt(text, cursor)) + lineStart(text, cursor) : cursor;
  return { state: { ...state, mode: "normal", count: 0, operator: undefined, pending: undefined, anchor: undefined }, effect: { kind: "mode", mode: "normal", offset } };
}

function normalKey(state: VimState, key: VimKey, text: string, cursor: number): { state: VimState; effect: VimEffect } {
  const clear = (): VimState => ({ ...state, count: 0, operatorCount: undefined, operator: undefined, pending: undefined,
    anchor: state.mode === "visual" || state.mode === "visual-line" ? state.anchor : undefined });
  if (key.key === "escape") {
    if (state.mode === "visual" || state.mode === "visual-line") return { state: { ...clear(), mode: "normal" }, effect: { kind: "mode", mode: "normal" } };
    return { state: clear(), effect: { kind: "none" } };
  }
  if (key.ctrl) {
    if (key.key === "r") return { state: clear(), effect: { kind: "redo" } };
    return { state, effect: { kind: "none" } };
  }
  const navigation = key.key === "left" ? "h"
    : key.key === "right" ? "l"
      : key.key === "up" ? "k"
        : key.key === "down" ? "j"
          : key.key === "line-start" ? "0"
            : key.key === "line-end" ? "$"
              : undefined;
  const character = key.key === "backspace" ? "X"
    : key.key === "delete" ? "x"
      : navigation ?? key.text ?? "";
  if (!character || key.alt || key.meta) return { state, effect: { kind: "none" } };

  if (/^[1-9]$/.test(character) || (character === "0" && state.count > 0)) {
    return { state: { ...state, count: Math.min(MAX_COUNT, state.count * 10 + Number(character)) }, effect: { kind: "none" } };
  }
  const count = state.count || 1;

  if (state.pending === "g") {
    if (character === "g") {
      if (state.operator) {
        const motionCount = combinedCount(state.operatorCount, count);
        const currentLine = lineAt(text, cursor).index;
        const targetLine = Math.min(currentLine, motionCount > 1 ? motionCount - 1 : 0);
        const lastLine = Math.max(currentLine, targetLine);
        const from = lineOffset(text, targetLine);
        const end = lineEndOffset(text, lineOffset(text, lastLine));
        return applyOperator(state, text,
          { from, to: end < text.length ? end + 1 : end, linewise: true }, false);
      }
      const offset = count > 1 ? lineOffset(text, count - 1) : 0;
      return { state: clear(), effect: { kind: "cursor", offset } };
    }
    return { state: clear(), effect: { kind: "none" } };
  }
  if (state.pending === "r") {
    if (character.length === 0) return { state: clear(), effect: { kind: "none" } };
    const effect = replaceCharacters(text, cursor, count, character);
    return { state: clear(), effect };
  }
  if (state.pending === "i" || state.pending === "a") {
    const range = textObject(text, cursor, character, state.pending === "a",
      combinedCount(state.operatorCount, count));
    if (!range) return { state: clear(), effect: { kind: "none" } };
    return applyOperator(state, text, range, true);
  }
  if (state.pending === "f" || state.pending === "F" || state.pending === "t" || state.pending === "T") {
    const target = findCharacter(text, cursor, character, state.pending,
      combinedCount(state.operatorCount, count));
    if (state.operator && target !== undefined) {
      return applyOperator(state, text, operatorRange(text, cursor, target, state.pending), false);
    }
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
    const motionCount = combinedCount(state.operatorCount, count);
    if (character === state.operator) {
      const range = lineRange(text, cursor, motionCount);
      return applyOperator(state, text, range, false);
    }
    if (character === "G") {
      const lines = text.split("\n");
      const currentLine = lineAt(text, cursor).index;
      const explicitCount = state.operatorCount !== undefined || state.count > 0;
      const targetLine = explicitCount ? Math.min(lines.length - 1, motionCount - 1) : lines.length - 1;
      const first = Math.min(currentLine, targetLine);
      const last = Math.max(currentLine, targetLine);
      const from = lineOffset(text, first);
      const end = lineEndOffset(text, lineOffset(text, last));
      return applyOperator(state, text, { from, to: end < text.length ? end + 1 : end, linewise: true }, false);
    }
    if (character === "g") return { state: { ...state, pending: "g" }, effect: { kind: "none" } };
    if (character === "i" || character === "a") return { state: { ...state, pending: character }, effect: { kind: "none" } };
    if (character === "f" || character === "F" || character === "t" || character === "T") {
      return { state: { ...state, pending: character }, effect: { kind: "none" } };
    }
    const target = motionTarget(text, cursor, character, motionCount);
    if (target === undefined) return { state: clear(), effect: { kind: "none" } };
    return applyOperator(state, text, operatorRange(text, cursor, target, character), false);
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
    case "f": case "F": case "t": case "T": return { state: { ...state, pending: character }, effect: { kind: "none" } };
    case "g": return { state: { ...state, pending: "g" }, effect: { kind: "none" } };
    case "G": return { state: clear(), effect: { kind: "cursor", offset: state.count > 0 ? lineOffset(text, state.count - 1) : applyMotion(text, cursor, "doc-end", 1) } };
    case "i": return { state: { ...clear(), mode: "insert" }, effect: { kind: "mode", mode: "insert" } };
    case "a": return { state: { ...clear(), mode: "insert" }, effect: { kind: "mode", mode: "insert", offset: nextOffset(text, cursor) } };
    case "I": return { state: { ...clear(), mode: "insert" }, effect: { kind: "mode", mode: "insert", offset: applyMotion(text, cursor, "line-start", 1) } };
    case "A": return { state: { ...clear(), mode: "insert" }, effect: { kind: "mode", mode: "insert", offset: lineEndOffset(text, cursor) } };
    case "o": return { state: { ...clear(), mode: "insert" }, effect: { kind: "edit", from: lineEndOffset(text, cursor), to: lineEndOffset(text, cursor), text: "\n", cursorOffset: 1 } };
    case "O": return { state: { ...clear(), mode: "insert" }, effect: { kind: "edit", from: lineStart(text, cursor), to: lineStart(text, cursor), text: "\n", cursorOffset: 0 } };
    case "x": {
      const to = repeatOffset(text, cursor, count, false);
      return to === cursor ? { state: clear(), effect: { kind: "none" } }
        : applyOperator({ ...state, operator: "d" }, text, { from: cursor, to, linewise: false }, false);
    }
    case "X": {
      const from = repeatOffset(text, cursor, count, true);
      return from === cursor ? { state: clear(), effect: { kind: "none" } }
        : applyOperator({ ...state, operator: "d" }, text, { from, to: cursor, linewise: false }, false);
    }
    case "D": {
      const end = lineEndForCount(text, cursor, count);
      return end === cursor ? { state: clear(), effect: { kind: "none" } }
        : applyOperator({ ...state, operator: "d" }, text, { from: cursor, to: end, linewise: false }, false);
    }
    case "Y": return applyOperator({ ...state, operator: "y" }, text, lineRange(text, cursor, count), false);
    case "C": {
      const end = lineEndForCount(text, cursor, count);
      return end === cursor
        ? { state: { ...clear(), mode: "insert" }, effect: { kind: "mode", mode: "insert" } }
        : applyOperator({ ...state, operator: "c" }, text, { from: cursor, to: end, linewise: false }, false);
    }
    case "d": case "y": case "c":
      return { state: { ...state, count: 0, operator: character,
        operatorCount: state.count > 0 ? count : undefined }, effect: { kind: "none" } };
    case "R": return { state: { ...clear(), mode: "replace" }, effect: { kind: "mode", mode: "replace" } };
    case "S": {
      const range = lineRange(text, cursor, count);
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
    return { state: { ...state, mode: "normal", count: 0, operatorCount: undefined, operator: undefined, pending: undefined, anchor: undefined, register: yanked, registerLinewise: range.linewise },
      effect: { kind: "cursor", offset: from } };
  }
  const mode = operator === "c" ? "insert" as const : "normal" as const;
  return { state: { ...state, mode, count: 0, operatorCount: undefined, operator: undefined, pending: undefined, anchor: undefined, register: yanked, registerLinewise: range.linewise },
    effect: { kind: "edit", from, to, text: "", cursorOffset: 0, register } };
}

function combinedCount(operatorCount: number | undefined, count: number): number {
  return Math.min(MAX_COUNT, (operatorCount ?? 1) * count);
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

function replaceCharacter(text: string, cursor: number, character: string, append = false): VimEffect {
  const line = lineAt(text, cursor);
  const start = lineStart(text, cursor);
  const end = lineEndOffset(text, cursor);
  if (end === cursor) {
    return append
      ? { kind: "edit", from: cursor, to: cursor, text: character, cursorOffset: character.length }
      : { kind: "none" };
  }
  const to = start + nextCluster(line.text, cursor - start);
  return { kind: "edit", from: cursor, to, text: character, cursorOffset: character.length };
}

function replaceCharacters(text: string, cursor: number, count: number, character: string): VimEffect {
  let to = cursor;
  let replaced = 0;
  for (let index = 0; index < count; index++) {
    const line = lineAt(text, to);
    if (to >= lineEndOffset(text, to)) break;
    to = lineStart(text, to) + nextCluster(line.text, to - lineStart(text, to));
    replaced += 1;
  }
  if (to === cursor) return { kind: "none" };
  const boundaries = graphemeBoundaries(character);
  const lastCluster = boundaries.length > 1 ? boundaries[boundaries.length - 2]! : 0;
  return { kind: "edit", from: cursor, to, text: character.repeat(replaced),
    cursorOffset: character.length * (replaced - 1) + lastCluster };
}

function textObject(text: string, cursor: number, object: string, around: boolean, count = 1): { from: number; to: number; linewise: boolean } | undefined {
  if (object !== "w" && object !== "W") return undefined;
  const line = lineAt(text, cursor);
  const start = lineStart(text, cursor);
  const column = cursor - start;
  let from = wordStart(line.text, column);
  let to = wordEnd(line.text, column);
  for (let index = 1; index < count; index++) {
    let next = to;
    while (next < line.text.length && /\s/.test(line.text[next]!)) next += 1;
    if (next >= line.text.length) break;
    to = wordEnd(line.text, next);
  }
  if (around) {
    while (to < line.text.length && /\s/.test(line.text[to]!)) to += 1;
  } else {
    while (to > from && /\s/.test(line.text[to - 1]!)) to -= 1;
  }
  return { from: start + from, to: start + to, linewise: false };
}

/** Whether `offset` is a grapheme boundary, so the editor can apply a cursor intent. */
export function validCursor(text: string, offset: number): boolean {
  return Number.isInteger(offset) && offset >= 0 && offset <= text.length && graphemeBoundaries(text).includes(offset);
}
