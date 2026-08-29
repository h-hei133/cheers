export class Terminal {
  private isAltScreen = false;

  enterAltScreen(): void {
    if (!this.isAltScreen && process.stdout.isTTY) {
      process.stdout.write("\x1b[?1049h\x1b[H");
      this.isAltScreen = true;
    }
  }

  exitAltScreen(): void {
    if (this.isAltScreen && process.stdout.isTTY) {
      process.stdout.write("\x1b[?1049l");
      this.isAltScreen = false;
    }
  }

  getDimensions(): { readonly columns: number; readonly rows: number } {
    return {
      columns: process.stdout.columns || 80,
      rows: process.stdout.rows || 24,
    };
  }

  hideCursor(): void {
    if (process.stdout.isTTY) {
      process.stdout.write("\x1b[?25l");
    }
  }

  showCursor(): void {
    if (process.stdout.isTTY) {
      process.stdout.write("\x1b[?25h");
    }
  }
}
