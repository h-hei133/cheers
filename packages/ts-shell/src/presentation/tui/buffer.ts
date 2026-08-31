export class DifferentialTerminalBuffer {
  private prevScreen: string[] = [];

  render(nextScreen: string[]): string {
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
    if (commands.length === 0) return "";

    // Wrap frame in ANSI Mode 2026 synchronized output sequence to guarantee tear-free atomic render
    return `\x1b[?2026h${commands.join("")}\x1b[?2026l`;
  }

  clear(): string {
    this.prevScreen = [];
    return "\x1b[2J\x1b[H";
  }
}
