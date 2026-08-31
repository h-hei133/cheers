/**
 * Zero-width Sentinel for Hardware Cursor Tracking
 */
export const CURSOR_MARKER = "\x1b_cursor:c\x07";

export interface EditorState {
  lines: string[];
  cursorLine: number;
  cursorCol: number;
}

export class Editor {
  private lines: string[] = [""];
  private cursorLine = 0;
  private cursorCol = 0;
  private readonly killRing: string[] = [];
  private readonly undoStack: EditorState[] = [];
  private readonly history: string[] = [];
  private historyIndex = -1;
  private stashPrompt = "";

  getText(): string {
    return this.lines.join("\n");
  }

  setText(text: string): void {
    this.saveUndoState();
    this.lines = text.length > 0 ? text.split("\n") : [""];
    this.cursorLine = this.lines.length - 1;
    this.cursorCol = this.lines[this.cursorLine].length;
  }

  clear(): void {
    this.saveUndoState();
    this.lines = [""];
    this.cursorLine = 0;
    this.cursorCol = 0;
    this.historyIndex = -1;
  }

  insert(text: string): void {
    if (!text) return;
    this.saveUndoState();
    // Expand tabs to spaces to maintain strict visual width
    const cleanText = text.replace(/\t/g, "  ");
    const currentLine = this.lines[this.cursorLine] ?? "";
    const before = currentLine.slice(0, this.cursorCol);
    const after = currentLine.slice(this.cursorCol);

    if (cleanText.includes("\n")) {
      const parts = cleanText.split("\n");
      const first = before + parts[0];
      const last = parts[parts.length - 1] + after;
      const middle = parts.slice(1, -1);
      this.lines.splice(this.cursorLine, 1, first, ...middle, last);
      this.cursorLine += parts.length - 1;
      this.cursorCol = parts[parts.length - 1].length;
    } else {
      this.lines[this.cursorLine] = before + cleanText + after;
      this.cursorCol += cleanText.length;
    }
  }

  backspace(): void {
    if (this.cursorCol > 0) {
      this.saveUndoState();
      const currentLine = this.lines[this.cursorLine] ?? "";
      const before = currentLine.slice(0, this.cursorCol - 1);
      const after = currentLine.slice(this.cursorCol);
      this.lines[this.cursorLine] = before + after;
      this.cursorCol -= 1;
    } else if (this.cursorLine > 0) {
      this.saveUndoState();
      const currentLine = this.lines[this.cursorLine] ?? "";
      const prevLine = this.lines[this.cursorLine - 1] ?? "";
      this.cursorCol = prevLine.length;
      this.lines[this.cursorLine - 1] = prevLine + currentLine;
      this.lines.splice(this.cursorLine, 1);
      this.cursorLine -= 1;
    }
  }

  delete(): void {
    const currentLine = this.lines[this.cursorLine] ?? "";
    if (this.cursorCol < currentLine.length) {
      this.saveUndoState();
      const before = currentLine.slice(0, this.cursorCol);
      const after = currentLine.slice(this.cursorCol + 1);
      this.lines[this.cursorLine] = before + after;
    } else if (this.cursorLine < this.lines.length - 1) {
      this.saveUndoState();
      const nextLine = this.lines[this.cursorLine + 1] ?? "";
      this.lines[this.cursorLine] = currentLine + nextLine;
      this.lines.splice(this.cursorLine + 1, 1);
    }
  }

  killToEndOfLine(): void {
    const currentLine = this.lines[this.cursorLine] ?? "";
    if (this.cursorCol < currentLine.length) {
      this.saveUndoState();
      const killed = currentLine.slice(this.cursorCol);
      this.lines[this.cursorLine] = currentLine.slice(0, this.cursorCol);
      this.killRing.push(killed);
    }
  }

  killToStartOfLine(): void {
    if (this.cursorCol > 0) {
      this.saveUndoState();
      const currentLine = this.lines[this.cursorLine] ?? "";
      const killed = currentLine.slice(0, this.cursorCol);
      this.lines[this.cursorLine] = currentLine.slice(this.cursorCol);
      this.cursorCol = 0;
      this.killRing.push(killed);
    }
  }

  yank(): void {
    if (this.killRing.length > 0) {
      const top = this.killRing[this.killRing.length - 1];
      this.insert(top);
    }
  }

  undo(): boolean {
    if (this.undoStack.length === 0) return false;
    const prev = this.undoStack.pop()!;
    this.lines = prev.lines;
    this.cursorLine = prev.cursorLine;
    this.cursorCol = prev.cursorCol;
    return true;
  }

  moveLeft(): void {
    if (this.cursorCol > 0) {
      this.cursorCol -= 1;
    } else if (this.cursorLine > 0) {
      this.cursorLine -= 1;
      this.cursorCol = (this.lines[this.cursorLine] ?? "").length;
    }
  }

  moveRight(): void {
    const currentLine = this.lines[this.cursorLine] ?? "";
    if (this.cursorCol < currentLine.length) {
      this.cursorCol += 1;
    } else if (this.cursorLine < this.lines.length - 1) {
      this.cursorLine += 1;
      this.cursorCol = 0;
    }
  }

  moveWordLeft(): void {
    const line = this.lines[this.cursorLine] ?? "";
    if (this.cursorCol === 0) {
      this.moveLeft();
      return;
    }
    let col = this.cursorCol;
    while (col > 0 && /\s/.test(line[col - 1])) col--;
    while (col > 0 && !/\s/.test(line[col - 1])) col--;
    this.cursorCol = col;
  }

  moveWordRight(): void {
    const line = this.lines[this.cursorLine] ?? "";
    if (this.cursorCol >= line.length) {
      this.moveRight();
      return;
    }
    let col = this.cursorCol;
    while (col < line.length && !/\s/.test(line[col])) col++;
    while (col < line.length && /\s/.test(line[col])) col++;
    this.cursorCol = col;
  }

  moveToHome(): void {
    this.cursorCol = 0;
  }

  moveToEnd(): void {
    this.cursorCol = (this.lines[this.cursorLine] ?? "").length;
  }

  moveUp(): boolean {
    if (this.cursorLine > 0) {
      this.cursorLine -= 1;
      this.cursorCol = Math.min(this.cursorCol, (this.lines[this.cursorLine] ?? "").length);
      return true;
    }
    return false;
  }

  moveDown(): boolean {
    if (this.cursorLine < this.lines.length - 1) {
      this.cursorLine += 1;
      this.cursorCol = Math.min(this.cursorCol, (this.lines[this.cursorLine] ?? "").length);
      return true;
    }
    return false;
  }

  pushHistory(text: string): void {
    const trimmed = text.trim();
    if (trimmed && this.history[this.history.length - 1] !== trimmed) {
      this.history.push(trimmed);
    }
    this.historyIndex = -1;
  }

  navigateHistory(direction: -1 | 1): boolean {
    if (this.history.length === 0) return false;
    if (direction === -1) {
      if (this.historyIndex === -1) {
        this.stashPrompt = this.getText();
        this.historyIndex = this.history.length - 1;
      } else if (this.historyIndex > 0) {
        this.historyIndex -= 1;
      } else {
        return false;
      }
      this.setText(this.history[this.historyIndex]);
      return true;
    } else {
      if (this.historyIndex === -1) return false;
      if (this.historyIndex < this.history.length - 1) {
        this.historyIndex += 1;
        this.setText(this.history[this.historyIndex]);
        return true;
      } else {
        this.historyIndex = -1;
        this.setText(this.stashPrompt);
        return true;
      }
    }
  }

  getCursorOffset(): { readonly line: number; readonly col: number } {
    return { line: this.cursorLine, col: this.cursorCol };
  }

  renderWithSentinel(): string[] {
    const rendered: string[] = [];
    for (let i = 0; i < this.lines.length; i++) {
      const line = this.lines[i];
      if (i === this.cursorLine) {
        const col = Math.min(this.cursorCol, line.length);
        const before = line.slice(0, col);
        const after = line.slice(col);
        rendered.push(`${before}${CURSOR_MARKER}${after}`);
      } else {
        rendered.push(line);
      }
    }
    return rendered;
  }

  private saveUndoState(): void {
    if (this.undoStack.length >= 100) this.undoStack.shift();
    this.undoStack.push({
      lines: [...this.lines],
      cursorLine: this.cursorLine,
      cursorCol: this.cursorCol,
    });
  }
}
