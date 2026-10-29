import { EditHistory } from "./editHistory.js";
import { nextCluster, previousCluster } from "../text/motion.js";
import { replaceDraft, type DraftSnapshot, type DraftEdit } from "./replacement.js";
import { graphemeBoundaries } from "../text/measure.js";

interface EditorSnapshot {
  readonly lines: readonly string[];
  readonly row: number;
  readonly column: number;
}

/** Text mutation and undo history shared by the prompt editor's interaction layer. */
export abstract class EditorBuffer {
  /**
   * Optional matcher for tokens that delete as one unit — an attachment chip,
   * say. The host owns what the tokens are; the editor only asks "does a token
   * end right here, and where does it start?" before a plain cluster delete.
   */
  atomicTokenStart?: (line: string, column: number) => number | undefined;
  protected lines: string[] = [""];
  protected row = 0;
  protected column = 0;
  protected scrollOffset = 0;
  protected revision = 0;
  private contentRevision = 0;
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
  protected lastAction: "kill" | "yank" | "type" | "vertical" | null = null;
  private readonly edits = new EditHistory<EditorSnapshot>(
    state => ({ lines: [...state.lines], row: state.row, column: state.column }), 100,
  );
  protected abstract adoptAsDraft(): void;

  snapshot(): DraftSnapshot {
    const text = this.getText();
    const cursor = this.lines.slice(0, this.row).reduce((offset, line) => offset + line.length + 1, 0) + this.column;
    return { text, cursor, revision: this.revision };
  }

  /** Cheap text freshness key; cursor motion keeps the current request valid. */
  get textRevision(): number { return this.contentRevision; }

  replace(edit: DraftEdit): boolean {
    const next = replaceDraft(this.snapshot(), edit);
    if (!next) return false;
    this.setDraftText(next.text);
    const prefix = next.text.slice(0, next.cursor).replace(/\r\n?/g, "\n").split("\n");
    this.row = prefix.length - 1;
    this.column = prefix[this.row]!.length;
    return true;
  }
  getText(): string {
    return this.lines.join("\n");
  }

  /**
   * Place the caret at a raw offset on a grapheme boundary.
   *
   * Modal motions compute offsets; converting them here keeps the row/column
   * invariant in one place and refuses a position inside a cluster.
   */
  setCursorOffset(offset: number): boolean {
    const text = this.getText();
    if (!Number.isInteger(offset) || offset < 0 || offset > text.length) return false;
    if (!graphemeBoundaries(text).includes(offset)) return false;
    const before = text.slice(0, offset).split("\n");
    this.row = before.length - 1;
    this.column = before[this.row]!.length;
    this.resetVerticalPreference();
    return true;
  }

  /** Subclasses clear their own column preference after a direct caret move. */
  protected resetVerticalPreference(): void {}

  setText(text: string): void {
    this.saveUndo();
    this.lastAction = null;
    this.lines = text.replace(/\r\n?/g, "\n").split("\n");
    this.row = this.lines.length - 1;
    this.column = this.lines[this.row]!.length;
    this.scrollOffset = 0;
  }

  /** Programmatic text replacement that also adopts the text as the draft. */
  setDraftText(text: string): void {
    this.setText(text);
    this.adoptAsDraft();
  }

  /** Insert source text, retaining tabs and splitting logical newlines. */
  insert(text: string): void {
    if (!text) return;
    this.revision += 1;
    this.contentRevision += 1;
    this.adoptAsDraft();
    // A run of word characters is one undo step. Whitespace starts a new one, and
    // so does any non-word character, so the unit a user gets back is the word
    // they typed rather than an arbitrary slice of keystrokes.
    const continuesWord = this.lastAction === "type" && isWordCharacter(text);
    if (!continuesWord) this.saveUndo();
    this.lastAction = isWordCharacter(text) ? "type" : null;
    const clean = text.replace(/\r\n?/g, "\n");
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

  protected restore(snapshot: EditorSnapshot): void {
    this.revision += 1;
    this.contentRevision += 1;
    this.lines = [...snapshot.lines];
    this.row = snapshot.row;
    this.column = snapshot.column;
    // The draft has been replaced wholesale, so whatever ran before it is over.
    this.lastAction = null;
  }

  protected saveUndo(): void {
    this.revision += 1;
    this.contentRevision += 1;
    this.edits.record({ lines: this.lines, row: this.row, column: this.column });
  }
}

function isWordCharacter(text: string): boolean {
  return text.length === 1 && /\w/.test(text);
}
