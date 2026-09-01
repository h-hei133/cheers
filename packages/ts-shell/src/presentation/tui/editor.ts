import { graphemeBoundaries, sliceWithWidth, visibleWidth } from "./text/measure.js";
import { wrapToWidth } from "./text/layout.js";
import { nextCluster, previousCluster, wordEnd, wordStart } from "./text/motion.js";
import { CURSOR_MARKER } from "./render/paint.js";

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

  private lines: string[] = [""];
  private row = 0;
  private column = 0;
  private readonly killRing: string[] = [];
  private readonly undoStack: EditorSnapshot[] = [];
  private readonly history: string[] = [];
  private historyIndex = -1;
  private draft = "";

  getText(): string {
    return this.lines.join("\n");
  }

  setText(text: string): void {
    this.saveUndo();
    this.lines = text.length > 0 ? text.split("\n") : [""];
    this.row = this.lines.length - 1;
    this.column = this.lines[this.row]!.length;
  }

  clear(): void {
    this.saveUndo();
    this.lines = [""];
    this.row = 0;
    this.column = 0;
    this.historyIndex = -1;
  }

  /** Insert literal text, expanding tabs and splitting embedded newlines. */
  insert(text: string): void {
    if (!text) return;
    this.saveUndo();
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
    this.saveUndo();
    const line = this.lines[this.row]!;
    this.lines.splice(this.row, 1, line.slice(0, this.column), line.slice(this.column));
    this.row += 1;
    this.column = 0;
  }

  backspace(): void {
    if (this.column > 0) {
      this.saveUndo();
      const line = this.lines[this.row]!;
      const start = previousCluster(line, this.column);
      this.lines[this.row] = line.slice(0, start) + line.slice(this.column);
      this.column = start;
      return;
    }
    if (this.row === 0) return;
    this.saveUndo();
    const previous = this.lines[this.row - 1]!;
    this.column = previous.length;
    this.lines[this.row - 1] = previous + this.lines[this.row]!;
    this.lines.splice(this.row, 1);
    this.row -= 1;
  }

  deleteForward(): void {
    const line = this.lines[this.row]!;
    if (this.column < line.length) {
      this.saveUndo();
      const end = nextCluster(line, this.column);
      this.lines[this.row] = line.slice(0, this.column) + line.slice(end);
      return;
    }
    if (this.row >= this.lines.length - 1) return;
    this.saveUndo();
    this.lines[this.row] = line + this.lines[this.row + 1]!;
    this.lines.splice(this.row + 1, 1);
  }

  /** Cut text into the kill ring so {@link yank} can restore it. */
  kill(target: KillTarget): void {
    const line = this.lines[this.row]!;
    let start = this.column;
    let end = this.column;
    if (target === "line-end") end = line.length;
    else if (target === "line-start") start = 0;
    else start = wordStart(line, this.column);
    if (start === end) return;
    this.saveUndo();
    this.pushKill(line.slice(start, end));
    this.lines[this.row] = line.slice(0, start) + line.slice(end);
    this.column = start;
  }

  yank(): void {
    const top = this.killRing[this.killRing.length - 1];
    if (top !== undefined) this.insert(top);
  }

  undo(): boolean {
    const previous = this.undoStack.pop();
    if (!previous) return false;
    this.lines = [...previous.lines];
    this.row = previous.row;
    this.column = previous.column;
    return true;
  }

  /** Move the caret; returns false when the motion had nowhere to go. */
  move(kind: CursorMove): boolean {
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
      case "up":
        if (this.row === 0) return false;
        this.row -= 1;
        this.column = Math.min(this.column, this.lines[this.row]!.length);
        return true;
      default:
        if (this.row >= this.lines.length - 1) return false;
        this.row += 1;
        this.column = Math.min(this.column, this.lines[this.row]!.length);
        return true;
    }
  }

  /** Record a submitted prompt for later recall. */
  pushHistory(text: string): void {
    const trimmed = text.trim();
    if (trimmed && this.history[this.history.length - 1] !== trimmed) this.history.push(trimmed);
    this.historyIndex = -1;
  }

  /**
   * Recall an earlier (-1) or later (+1) prompt. The in-progress draft is stashed
   * on the first step back and restored when navigation returns past the end.
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
      return true;
    }
    if (this.historyIndex === -1) return false;
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex += 1;
      this.setText(this.history[this.historyIndex]!);
      return true;
    }
    this.historyIndex = -1;
    this.setText(this.draft);
    return true;
  }

  /** Soft-wrapped rows at `width`, carrying the cursor marker when focused. */
  render(width: number): string[] {
    const cells = Math.max(1, width);
    if (this.lines.length === 1 && this.lines[0] === "" && this.placeholder) {
      return [this.focused ? `${CURSOR_MARKER}${this.placeholder}` : this.placeholder];
    }
    const rendered: string[] = [];
    for (let index = 0; index < this.lines.length; index++) {
      const rows = wrapToWidth(this.lines[index]!, cells);
      if (index !== this.row || !this.focused) {
        rendered.push(...rows);
        continue;
      }
      rendered.push(...this.markCursorRow(rows, visibleWidth(this.lines[index]!.slice(0, this.column))));
    }
    return rendered;
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





  private pushKill(text: string): void {
    this.killRing.push(text);
    if (this.killRing.length > MAX_KILL_RING) this.killRing.shift();
  }

  private saveUndo(): void {
    if (this.undoStack.length >= MAX_UNDO_DEPTH) this.undoStack.shift();
    this.undoStack.push({ lines: [...this.lines], row: this.row, column: this.column });
  }
}
