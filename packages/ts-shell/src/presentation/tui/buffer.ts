export class DifferentialTerminalBuffer {
  private prevScreen: string[] = [];
  private prevTopAnchor = 0;

  render(
    nextScreen: string[],
    cursorPos?: { row: number; col: number },
    options?: { topAnchor?: number },
  ): string {
    const commands: string[] = [];
    const topAnchor = options?.topAnchor ?? 0;

    // 1. Clear any physical rows that were painted in previous frame but outside new frame
    const prevStartRow = this.prevTopAnchor + 1;
    const prevEndRow = this.prevTopAnchor + this.prevScreen.length;
    const nextStartRow = topAnchor + 1;
    const nextEndRow = topAnchor + nextScreen.length;

    for (let r = prevStartRow; r <= prevEndRow; r++) {
      if (r < nextStartRow || r > nextEndRow) {
        commands.push(`\x1b[${r};1H\x1b[2K`);
      }
    }

    // 2. Diff and paint active rows
    for (let i = 0; i < nextScreen.length; i++) {
      const physicalRow = topAnchor + i + 1;
      const prevIdx = physicalRow - prevStartRow;
      const prevLine = prevIdx >= 0 && prevIdx < this.prevScreen.length ? this.prevScreen[prevIdx] : undefined;
      const nextLine = nextScreen[i] ?? "";

      if (prevLine !== nextLine) {
        commands.push(`\x1b[${physicalRow};1H\x1b[2K${nextLine}`);
      }
    }

    this.prevScreen = [...nextScreen];
    this.prevTopAnchor = topAnchor;
    if (commands.length === 0 && !cursorPos) return "";
    // Wrap frame in DECAWM disable + ANSI Mode 2026 sync output sequence
    const paintStart = "\x1b[?25l\x1b[?2026h\x1b[?7l";
    const paintEnd = "\x1b[?7h\x1b[?2026l";

    let cursorPin = "";
    if (cursorPos) {
      cursorPin = `\x1b[${cursorPos.row};${cursorPos.col}H\x1b[?25h`;
    }

    return `${paintStart}${commands.join("")}${paintEnd}${cursorPin}`;
  }

  clear(): string {
    this.prevScreen = [];
    return "\x1b[2J\x1b[H";
  }
}
