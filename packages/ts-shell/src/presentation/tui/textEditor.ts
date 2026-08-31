/**
 * Pure Native Line & Multiline Text Editor State Machine
 *
 * Implements:
 * 1. Line buffer management (lines: string[])
 * 2. 2D Cursor coordinates (cursorLine, cursorCol)
 * 3. Character insertion, backspace, delete, word-jump (Alt+Left/Right)
 * 4. Home/End navigation (Ctrl+A/Ctrl+E)
 * 5. Inverted cursor block rendering (\x1b[7m \x1b[0m)
 * 6. History buffer navigation (Up/Down when at boundaries)
 */

export interface TextEditorState {
  readonly lines: readonly string[];
  readonly cursorLine: number;
  readonly cursorCol: number;
}

export class TextEditor {
  private lines: string[] = [""];
  private cursorLine = 0;
  private cursorCol = 0;
  private history: string[] = [];
  private historyIndex = -1;
  private stashPrompt = "";

  getState(): TextEditorState {
    return {
      lines: [...this.lines],
      cursorLine: this.cursorLine,
      cursorCol: this.cursorCol,
    };
  }

  getText(): string {
    return this.lines.join("\n");
  }

  setText(text: string): void {
    this.lines = text.length > 0 ? text.split("\n") : [""];
    this.cursorLine = this.lines.length - 1;
    this.cursorCol = this.lines[this.cursorLine].length;
  }

  clear(): void {
    this.lines = [""];
    this.cursorLine = 0;
    this.cursorCol = 0;
    this.historyIndex = -1;
  }

  insertText(text: string): void {
    if (!text) return;
    const currentLine = this.lines[this.cursorLine] ?? "";
    const before = currentLine.slice(0, this.cursorCol);
    const after = currentLine.slice(this.cursorCol);

    if (text.includes("\n")) {
      const insertLines = text.split("\n");
      const firstLine = before + insertLines[0];
      const lastLine = insertLines[insertLines.length - 1] + after;
      const middleLines = insertLines.slice(1, -1);

      this.lines.splice(this.cursorLine, 1, firstLine, ...middleLines, lastLine);
      this.cursorLine += insertLines.length - 1;
      this.cursorCol = insertLines[insertLines.length - 1].length;
    } else {
      this.lines[this.cursorLine] = before + text + after;
      this.cursorCol += text.length;
    }
  }

  backspace(): void {
    const currentLine = this.lines[this.cursorLine] ?? "";
    if (this.cursorCol > 0) {
      const before = currentLine.slice(0, this.cursorCol - 1);
      const after = currentLine.slice(this.cursorCol);
      this.lines[this.cursorLine] = before + after;
      this.cursorCol -= 1;
    } else if (this.cursorLine > 0) {
      // Merge with previous line
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
      const before = currentLine.slice(0, this.cursorCol);
      const after = currentLine.slice(this.cursorCol + 1);
      this.lines[this.cursorLine] = before + after;
    } else if (this.cursorLine < this.lines.length - 1) {
      // Merge with next line
      const nextLine = this.lines[this.cursorLine + 1] ?? "";
      this.lines[this.cursorLine] = currentLine + nextLine;
      this.lines.splice(this.cursorLine + 1, 1);
    }
  }

  moveLeft(): void {
    if (this.cursorCol > 0) {
      this.cursorCol -= 1;
    } else if (this.cursorLine > 0) {
      this.cursorLine -= 1;
      this.cursorCol = this.lines[this.cursorLine].length;
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

  moveToHome(): void {
    this.cursorCol = 0;
  }

  moveToEnd(): void {
    this.cursorCol = (this.lines[this.cursorLine] ?? "").length;
  }

  moveUp(): boolean {
    if (this.cursorLine > 0) {
      this.cursorLine -= 1;
      this.cursorCol = Math.min(this.cursorCol, this.lines[this.cursorLine].length);
      return true;
    }
    return false; // Reached top, history can take over
  }

  moveDown(): boolean {
    if (this.cursorLine < this.lines.length - 1) {
      this.cursorLine += 1;
      this.cursorCol = Math.min(this.cursorCol, this.lines[this.cursorLine].length);
      return true;
    }
    return false; // Reached bottom
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

  /**
   * Renders the buffer lines with an inverted cursor block inserted at (cursorLine, cursorCol)
   */
  renderWithCursor(): string[] {
    const rendered: string[] = [];

    for (let i = 0; i < this.lines.length; i++) {
      const line = this.lines[i];
      if (i === this.cursorLine) {
        const col = Math.min(this.cursorCol, line.length);
        const before = line.slice(0, col);
        const charUnderCursor = col < line.length ? line[col] : " ";
        const after = col < line.length ? line.slice(col + 1) : "";
        const cursorBlock = `\x1b[7m${charUnderCursor}\x1b[0m`;
        rendered.push(before + cursorBlock + after);
      } else {
        rendered.push(line);
      }
    }

    return rendered;
  }
}
