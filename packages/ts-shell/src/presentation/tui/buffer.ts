export class DifferentialTerminalBuffer {
  private prevScreen: string[] = [];

  render(nextScreen: string[], cursorPos?: { row: number; col: number }): string {
    const commands: string[] = [];
    const maxLines = Math.max(this.prevScreen.length, nextScreen.length);

    for (let i = 0; i < maxLines; i++) {
      const prevLine = this.prevScreen[i] ?? "";
      const nextLine = nextScreen[i] ?? "";

      // Only write to terminal if line contents or ANSI styles changed
      if (prevLine !== nextLine) {
        commands.push(`\x1b[${i + 1};1H\x1b[2K${nextLine}`);
      }
    }

    this.prevScreen = [...nextScreen];
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
