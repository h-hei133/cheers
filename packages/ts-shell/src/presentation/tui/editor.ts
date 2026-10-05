import { sliceWithWidth } from "./text/measure.js";
import { editorRows, visualCaret, verticalCaret } from "./editor/layout.js";
import { nextCluster, previousCluster, wordEnd, wordStart } from "./text/motion.js";
import { CURSOR_MARKER } from "./render/paint.js";
import { KillRing } from "./editor/killRing.js";
import { EditorBuffer } from "./editor/buffer.js";
import { YankPlacement } from "./editor/yank.js";

/**
 * Multi-line prompt editor.
 *
 * Cursor motion and deletion step by grapheme cluster, not by code unit, so a
 * single Backspace removes one visible character even when it is an emoji or a
 * base letter carrying combining marks. Rendering soft-wraps at the content
 * width and places the hardware cursor marker on the wrapped row that actually
 * holds the caret, which is what keeps an IME candidate window anchored.
 */

export type CursorMove =
  | "left"
  | "right"
  | "word-left"
  | "word-right"
  | "line-start"
  | "line-end"
  | "doc-start"
  | "doc-end"
  | "up"
  | "down";

export type KillTarget = "line-end" | "line-start" | "word-left";

const MAX_KILL_RING = 16;

export class Editor extends EditorBuffer {
  /** Set by the host when this editor owns keyboard focus. */
  focused = true;
  /** Hint shown in place of an empty first row. */
  placeholder = "";

  private readonly killRing = new KillRing(MAX_KILL_RING);
  private readonly yanks = new YankPlacement({
    read: () => ({ lines: this.lines, row: this.row, column: this.column }),
    adopt: (next) => {
      this.lines = [...next.lines];
      this.row = next.row;
      this.column = next.column;
    },
  });

  private lastWidth = Number.MAX_SAFE_INTEGER;
  private preferredColumn: number | undefined;
  private readonly history: string[] = [];
  private historyIndex = -1;
  private draft = "";
  /**
   * True while the text on screen is a recalled history entry rather than the
   * user's in-progress draft. Any edit turns the entry into the new draft and
   * leaves browsing, so a recalled line that gets changed is kept as edited
   * rather than written back over the history it came from.
   */
  private browsing = false;

  /** Whether the caret sits on a recalled history entry. */
  get browsingHistory(): boolean {
    return this.browsing;
  }

  /** Leave history-browsing: the current text becomes the in-progress draft. */
  protected adoptAsDraft(): void {
    if (!this.browsing) return;
    this.browsing = false;
    this.historyIndex = -1;
    this.draft = this.getText();
  }

  clear(): void {
    this.saveUndo();
    this.lastAction = null;
    this.lines = [""];
    this.row = 0;
    this.column = 0;
    this.historyIndex = -1;
    this.browsing = false;
    this.scrollOffset = 0;
  }

  /**
   * Cut text into the kill ring so {@link yank} can restore it.
   *
   * A backward kill that starts where the last one finished continues it rather
   * than beginning a new entry, so pressing the key repeatedly cuts a growing run
   * of text that one yank puts back whole. When there is nothing left to cut on
   * this row, the row break itself is what goes — which is what lets the key walk
   * back through a multi-line draft instead of stalling at every line start.
   */
  kill(target: KillTarget): void {
    const line = this.lines[this.row]!;
    const backward = target !== "line-end";
    // Only a cut continues a cut. Anything else in between — a motion, a
    // keystroke, a history recall — ends the run, so the next cut starts a new
    // ring entry instead of appending to text the user has since edited around.
    const continuing = backward && this.lastAction === "kill";
    let start = this.column;
    let end = this.column;
    if (target === "line-end") end = line.length;
    else if (target === "line-start") start = 0;
    else start = wordStart(line, this.column);
    if (start === end) {
      // At the end of a line there is no character to cut, so the line break is
      // what goes: the cut joins this row to the next one rather than doing
      // nothing, which is what makes the key usable from the line end.
      if (backward) {
        if (this.row === 0) return;
        this.adoptAsDraft();
        this.saveUndo();
        this.killRing.push("\n", { continuing, prepend: true });
        const previous = this.lines[this.row - 1]!;
        this.lines[this.row - 1] = previous + line;
        this.lines.splice(this.row, 1);
        this.row -= 1;
        this.column = previous.length;
        this.lastAction = "kill";
        return;
      }
      if (this.row >= this.lines.length - 1) return;
      this.adoptAsDraft();
      this.saveUndo();
      this.killRing.push("\n", { continuing: false, prepend: false });
      this.lines[this.row] = line + this.lines[this.row + 1]!;
      this.lines.splice(this.row + 1, 1);
      this.lastAction = "kill";
      return;
    }
    this.adoptAsDraft();
    this.saveUndo();
    this.killRing.push(line.slice(start, end), { continuing, prepend: true });
    this.lines[this.row] = line.slice(0, start) + line.slice(end);
    this.column = start;
    this.lastAction = "kill";
  }

  yank(): void {
    this.adoptAsDraft();
    this.saveUndo();
    // `take` reports whether anything was there; the action is a yank either way,
    // so a yank-pop after an empty ring is refused rather than replacing text
    // that was never inserted.
    if (this.yanks.take(this.killRing)) this.lastAction = "yank";
  }

  /**
   * Replace the last yank with the previous entry in the kill ring.
   *
   * The yank is replaced rather than appended: pressing the key again is asking
   * for a different cut, not for the same text a second time. Without this, the
   * earlier cuts are unreachable however many times the key is pressed.
   *
   * Only a yank that is still the last thing done can be cycled: once anything
   * else has happened the inserted text is part of the draft, and rewriting it
   * would undo an edit the user made after it.
   */
  yankPop(): boolean {
    if (this.lastAction !== "yank") return false;
    if (!this.yanks.cycle(this.killRing)) return false;
    this.saveUndo();
    return true;
  }

  /** Move the caret; returns false when the motion had nowhere to go. */
  move(kind: CursorMove): boolean {
    this.revision += 1;
    if (kind === "up" || kind === "down") {
      if (this.lastAction !== "vertical") this.preferredColumn = undefined;
      const next = verticalCaret(this.lines, this.lastWidth, this.row, this.column,
        kind === "up" ? -1 : 1,
        this.preferredColumn);
      this.lastAction = "vertical";
      if (!next) return false;
      this.row = next.row;
      this.column = next.column;
      this.preferredColumn = next.preferred;
      return true;
    }
    // A motion ends the run even when it goes nowhere: the key was pressed, and
    // pressing it is what says the cut is finished.
    this.lastAction = null;
    const line = this.lines[this.row]!;
    switch (kind) {
      case "left":
        if (this.column > 0) return this.setColumn(previousCluster(line, this.column));
        if (this.row === 0) return false;
        this.row -= 1;
        this.column = this.lines[this.row]!.length;
        return true;
      case "right":
        if (this.column < line.length) return this.setColumn(nextCluster(line, this.column));
        if (this.row >= this.lines.length - 1) return false;
        this.row += 1;
        this.column = 0;
        return true;
      case "word-left":
        return this.column === 0 ? this.move("left") : this.setColumn(wordStart(line, this.column));
      case "word-right":
        return this.column >= line.length ? this.move("right") : this.setColumn(wordEnd(line, this.column));
      case "line-start":
        return this.setColumn(0);
      case "line-end":
        return this.setColumn(line.length);
      case "doc-start":
        this.row = 0;
        return this.setColumn(0);
      case "doc-end":
        this.row = this.lines.length - 1;
        return this.setColumn(this.lines[this.row]!.length);
    }
  }

  /** Record a submitted prompt for later recall. */
  pushHistory(text: string): void {
    const trimmed = text.trim();
    if (trimmed && this.history[this.history.length - 1] !== trimmed) this.history.push(trimmed);
    this.historyIndex = -1;
  }

  /** Populate prompt history from stored entries. */
  loadHistory(entries: readonly string[]): void {
    for (const entry of entries) {
      const trimmed = entry.trim();
      if (trimmed && this.history[this.history.length - 1] !== trimmed) this.history.push(trimmed);
    }
    this.historyIndex = -1;
  }

  getHistory(): readonly string[] {
    return [...this.history];
  }

  /**
   * Recall an earlier (-1) or later (+1) prompt. The in-progress draft is stashed
   * on the first step back and restored when navigation returns past the end.
   * A recalled entry is browsing state: editing it adopts the edit as the new
   * draft instead of writing back over the history entry.
   */
  recall(direction: -1 | 1): boolean {
    if (this.history.length === 0) return false;
    if (direction === -1) {
      if (this.historyIndex === -1) {
        this.draft = this.getText();
        this.historyIndex = this.history.length - 1;
      } else if (this.historyIndex > 0) {
        this.historyIndex -= 1;
      } else {
        return false;
      }
      this.setText(this.history[this.historyIndex]!);
      this.browsing = true;
      return true;
    }
    if (this.historyIndex === -1) return false;
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex += 1;
      this.setText(this.history[this.historyIndex]!);
      this.browsing = true;
      return true;
    }
    this.historyIndex = -1;
    this.browsing = false;
    this.setText(this.draft);
    return true;
  }

  /** Soft-wrapped rows at `width`, carrying the cursor marker when focused. */
  render(width: number, maxRows?: number): string[] {
    const cells = Math.max(1, width);
    if (cells !== this.lastWidth) this.preferredColumn = undefined;
    this.lastWidth = cells;
    if (this.lines.length === 1 && this.lines[0] === "" && this.placeholder) {
      const hint = this.placeholder;
      return [this.focused ? `${CURSOR_MARKER}${hint}` : hint];
    }
    const rows = editorRows(this.lines, cells);
    const caret = visualCaret(rows, this.row, this.lines[this.row]!, this.column);
    const cursorVisualRow = caret.index;
    const rendered = rows.map((entry) => entry.text);
    if (this.focused) {
      const text = rendered[caret.index]!;
      const head = sliceWithWidth(text, 0, caret.column).text;
      rendered[caret.index] = `${head}${CURSOR_MARKER}${text.slice(head.length)}`;
    }
    if (maxRows === undefined || maxRows <= 0 || rendered.length <= maxRows) {
      this.scrollOffset = 0;
      return rendered;
    }

    if (cursorVisualRow >= 0) {
      if (cursorVisualRow < this.scrollOffset) {
        this.scrollOffset = cursorVisualRow;
      } else if (cursorVisualRow >= this.scrollOffset + maxRows) {
        this.scrollOffset = cursorVisualRow - maxRows + 1;
      }
    }
    const maxScroll = Math.max(0, rendered.length - maxRows);
    this.scrollOffset = Math.max(0, Math.min(this.scrollOffset, maxScroll));
    return rendered.slice(this.scrollOffset, this.scrollOffset + maxRows);
  }

  private setColumn(column: number): boolean {
    const changed = column !== this.column;
    this.column = column;
    return changed;
  }

}
