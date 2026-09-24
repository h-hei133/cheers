import { graphemeBoundaries, sliceWithWidth, visibleWidth } from "./text/measure.js";
import { wrapToWidth } from "./text/layout.js";
import { nextCluster, previousCluster, wordEnd, wordStart } from "./text/motion.js";
import { CURSOR_MARKER } from "./render/paint.js";
import { KillRing } from "./editor/killRing.js";
import { EditHistory } from "./editor/editHistory.js";
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

interface EditorSnapshot {
  readonly lines: readonly string[];
  readonly row: number;
  readonly column: number;
}

const MAX_UNDO_DEPTH = 100;
const MAX_KILL_RING = 16;

export class Editor {
  /** Set by the host when this editor owns keyboard focus. */
  focused = true;
  /** Hint shown in place of an empty first row. */
  placeholder = "";
  /**
   * Optional matcher for tokens that delete as one unit — an attachment chip,
   * say. The host owns what the tokens are; the editor only asks "does a token
   * end right here, and where does it start?" before a plain cluster delete.
   */
  atomicTokenStart?: (line: string, column: number) => number | undefined;

  private lines: string[] = [""];
  private row = 0;
  private column = 0;
  private readonly killRing = new KillRing(MAX_KILL_RING);
  private readonly yanks = new YankPlacement({
    read: () => ({ lines: this.lines, row: this.row, column: this.column }),
    adopt: (next) => {
      this.lines = [...next.lines];
      this.row = next.row;
      this.column = next.column;
    },
  });
  /**
   * The last thing that changed the text, for deciding whether the next change
   * continues it.
   *
   * A cut continues the previous cut only if nothing happened in between, and a
   * yank-pop only replaces a yank that is still the last thing done. Comparing
   * caret positions instead — which is what this replaced — says "unchanged" when
   * the user moved away and came back, or typed and deleted their way to the same
   * spot, so a cut would silently join a ring entry from an unrelated edit and a
   * yank-pop would reach back into a yank that had already been overwritten.
   *
   * Typed characters are the third case. Consecutive word characters are one undo
   * step, so a word typed letter by letter comes back in one press rather than
   * one press per letter. Whitespace ends the run, which is what makes the space
   * and the word after it come back together and each word separately undoable —
   * the convention a shell user already has.
   */
  private lastAction: "kill" | "yank" | "type" | null = null;
  private readonly edits = new EditHistory<EditorSnapshot>(
    (state) => ({ lines: [...state.lines], row: state.row, column: state.column }),
    MAX_UNDO_DEPTH,
  );
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
  private scrollOffset = 0;

  /** Whether the caret sits on a recalled history entry. */
  get browsingHistory(): boolean {
    return this.browsing;
  }

  /** Leave history-browsing: the current text becomes the in-progress draft. */
  private adoptAsDraft(): void {
    if (!this.browsing) return;
    this.browsing = false;
    this.historyIndex = -1;
    this.draft = this.getText();
  }

  /** Clamp `column` to a grapheme boundary of `line`. */
  private static snapColumn(line: string, column: number): number {
    if (column <= 0) return 0;
    if (column >= line.length) return line.length;
    const boundaries = graphemeBoundaries(line);
    let snapped = 0;
    for (const boundary of boundaries) {
      if (boundary > column) break;
      snapped = boundary;
    }
    return snapped;
  }
  getText(): string {
    return this.lines.join("\n");
  }


  setText(text: string): void {
    this.saveUndo();
    this.lastAction = null;
    this.lines = text.length > 0 ? text.split("\n") : [""];
    this.row = this.lines.length - 1;
    this.column = this.lines[this.row]!.length;
    this.scrollOffset = 0;
  }

  /** Programmatic text replacement that also adopts the text as the draft. */
  setDraftText(text: string): void {
    this.setText(text);
    this.adoptAsDraft();
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

  /** Insert literal text, expanding tabs and splitting embedded newlines. */
  insert(text: string): void {
    if (!text) return;
    this.adoptAsDraft();
    // A run of word characters is one undo step. Whitespace starts a new one, and
    // so does any non-word character, so the unit a user gets back is the word
    // they typed rather than an arbitrary slice of keystrokes.
    const continuesWord = this.lastAction === "type" && isWordCharacter(text);
    if (!continuesWord) this.saveUndo();
    this.lastAction = isWordCharacter(text) ? "type" : null;
    const clean = text.replace(/\t/g, "  ").replace(/\r\n?/g, "\n");
    const line = this.lines[this.row]!;
    const before = line.slice(0, this.column);
    const after = line.slice(this.column);
    const parts = clean.split("\n");
    if (parts.length === 1) {
      this.lines[this.row] = before + parts[0] + after;
      this.column = before.length + parts[0]!.length;
      return;
    }
    const last = parts[parts.length - 1]!;
    this.lines.splice(this.row, 1, before + parts[0], ...parts.slice(1, -1), last + after);
    this.row += parts.length - 1;
    this.column = last.length;
  }

  /** Split the current line at the cursor, as Shift+Enter does. */
  newline(): void {
    this.adoptAsDraft();
    this.saveUndo();
    this.lastAction = null;
    const line = this.lines[this.row]!;
    this.lines.splice(this.row, 1, line.slice(0, this.column), line.slice(this.column));
    this.row += 1;
    this.column = 0;
  }

  backspace(): void {
    if (this.column > 0) {
      this.adoptAsDraft();
      this.saveUndo();
      this.lastAction = null;
      const line = this.lines[this.row]!;
      const start = this.atomicStart(line) ?? previousCluster(line, this.column);
      this.lines[this.row] = line.slice(0, start) + line.slice(this.column);
      this.column = start;
      return;
    }
    if (this.row === 0) return;
    this.adoptAsDraft();
    this.saveUndo();
    this.lastAction = null;
    const previous = this.lines[this.row - 1]!;
    this.column = previous.length;
    this.lines[this.row - 1] = previous + this.lines[this.row]!;
    this.lines.splice(this.row, 1);
    this.row -= 1;
  }

  deleteForward(): void {
    const line = this.lines[this.row]!;
    if (this.column < line.length) {
      this.adoptAsDraft();
      this.saveUndo();
      this.lastAction = null;
      const end = this.atomicEnd(line) ?? nextCluster(line, this.column);
      this.lines[this.row] = line.slice(0, this.column) + line.slice(end);
      return;
    }
    if (this.row >= this.lines.length - 1) return;
    this.adoptAsDraft();
    this.saveUndo();
    this.lastAction = null;
    this.lines[this.row] = line + this.lines[this.row + 1]!;
    this.lines.splice(this.row + 1, 1);
  }

  /** Start of an atomic token ending at the caret, if the host recognises one. */
  private atomicStart(line: string): number | undefined {
    return this.atomicTokenStart?.(line, this.column);
  }

  /** End of an atomic token starting at the caret, if the host recognises one. */
  private atomicEnd(line: string): number | undefined {
    const matcher = this.atomicTokenStart;
    if (!matcher || line.length === 0) return undefined;
    // Search forward from the caret for a token whose start is the caret.
    for (let look = this.column; look < line.length; look = nextCluster(line, look)) {
      if (matcher(line, look) === this.column) return look;
    }
    return undefined;
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

  undo(): boolean {
    const previous = this.edits.back({ lines: this.lines, row: this.row, column: this.column });
    if (previous === undefined) return false;
    this.restore(previous);
    return true;
  }

  /** Take back the last undo. */
  redo(): boolean {
    const next = this.edits.forward({ lines: this.lines, row: this.row, column: this.column });
    if (next === undefined) return false;
    this.restore(next);
    return true;
  }

  private restore(snapshot: EditorSnapshot): void {
    this.lines = [...snapshot.lines];
    this.row = snapshot.row;
    this.column = snapshot.column;
    // The draft has been replaced wholesale, so whatever ran before it is over.
    this.lastAction = null;
  }

  /** Move the caret; returns false when the motion had nowhere to go. */
  move(kind: CursorMove): boolean {
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
      case "up":
        if (this.row === 0) return false;
        this.row -= 1;
        this.column = Editor.snapColumn(this.lines[this.row]!, Math.min(this.column, this.lines[this.row]!.length));
        return true;
      default:
        if (this.row >= this.lines.length - 1) return false;
        this.row += 1;
        this.column = Editor.snapColumn(this.lines[this.row]!, Math.min(this.column, this.lines[this.row]!.length));
        return true;
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
    if (this.lines.length === 1 && this.lines[0] === "" && this.placeholder) {
      const hint = `\x1b[2;90m${this.placeholder}\x1b[0m`;
      return [this.focused ? `${CURSOR_MARKER}${hint}` : hint];
    }
    const rendered: string[] = [];
    let cursorVisualRow = -1;
    for (let index = 0; index < this.lines.length; index++) {
      const rows = wrapToWidth(this.lines[index]!, cells);
      if (index !== this.row) {
        rendered.push(...rows);
        continue;
      }
      const offset = visibleWidth(this.lines[index]!.slice(0, this.column));
      let subRow = 0;
      let remaining = offset;
      for (let i = 0; i < rows.length; i++) {
        const rowWidth = visibleWidth(rows[i]!);
        if (remaining < rowWidth || i === rows.length - 1) {
          subRow = i;
          break;
        }
        remaining -= rowWidth;
      }
      cursorVisualRow = rendered.length + subRow;
      if (this.focused) {
        rendered.push(...this.markCursorRow(rows, offset));
      } else {
        rendered.push(...rows);
      }
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

  private markCursorRow(rows: readonly string[], offset: number): string[] {
    const marked = [...rows];
    let remaining = offset;
    for (let index = 0; index < marked.length; index++) {
      const rowWidth = visibleWidth(marked[index]!);
      if (remaining < rowWidth || index === marked.length - 1) {
        const head = sliceWithWidth(marked[index]!, 0, remaining).text;
        marked[index] = `${head}${CURSOR_MARKER}${marked[index]!.slice(head.length)}`;
        return marked;
      }
      remaining -= rowWidth;
    }
    return marked;
  }

  private setColumn(column: number): boolean {
    const changed = column !== this.column;
    this.column = column;
    return changed;
  }





  private saveUndo(): void {
    this.edits.record({ lines: this.lines, row: this.row, column: this.column });
  }
}

/**
 * Whether this inserted text continues a word.
 *
 * A single word character extends the run; anything else — a space, punctuation, a
 * newline, or a paste of several characters — starts a new undo step. Pasted text
 * is one step because it arrived as one action, and splitting it would make undo
 * take back a paste in pieces.
 */
function isWordCharacter(text: string): boolean {
  return text.length === 1 && /\w/.test(text);
}
