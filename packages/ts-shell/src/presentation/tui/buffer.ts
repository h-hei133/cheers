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
    return commands.join("");
  }

  clear(): string {
    this.prevScreen = [];
    return "\x1b[2J\x1b[H";
  }
}
