import { graphemeBoundaries } from "../text/measure.js";

export interface DraftSnapshot {
  readonly text: string;
  readonly cursor: number;
  readonly revision: number;
}

export interface DraftEdit {
  readonly snapshot: DraftSnapshot;
  /** Raw UTF-16 half-open replacement range. */
  readonly from: number;
  readonly to: number;
  readonly text: string;
  /** Caret within inserted text; omitted means its end. */
  readonly cursorOffset?: number;
}

/** Reject stale edits and edits that cut a visible character in half. */
export function replaceDraft(current: DraftSnapshot, edit: DraftEdit): DraftSnapshot | undefined {
  const expected = edit.snapshot;
  if (current.text !== expected.text || current.cursor !== expected.cursor || current.revision !== expected.revision) return;
  if (edit.from > edit.to || current.cursor < edit.from || current.cursor > edit.to) return;
  const boundaries = new Set(graphemeBoundaries(current.text));
  if (![edit.from, edit.to, current.cursor].every(offset => boundaries.has(offset))) return;
  const text = current.text.slice(0, edit.from) + edit.text + current.text.slice(edit.to);
  const offset = edit.cursorOffset ?? edit.text.length;
  if (!Number.isInteger(offset) || offset < 0 || offset > edit.text.length) return;
  const cursor = edit.from + offset;
  if (!graphemeBoundaries(text).includes(cursor)) return;
  return { text, cursor, revision: current.revision + 1 };
}
