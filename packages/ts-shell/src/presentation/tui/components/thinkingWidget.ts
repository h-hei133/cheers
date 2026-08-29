export class ThinkingWidget {
  private tokenCount = 0;
  private isCompleted = false;
  private spinnerIndex = 0;
  private readonly spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

  appendDelta(delta: string): void {
    // Approximate token count by words / whitespace chunks
    this.tokenCount += Math.max(1, Math.round(delta.length / 4));
    this.spinnerIndex = (this.spinnerIndex + 1) % this.spinnerFrames.length;
  }

  complete(): void {
    this.isCompleted = true;
  }

  render(): string {
    if (this.isCompleted) {
      return `\x1b[90m[✓ Thinking (${this.tokenCount} tokens)]\x1b[0m`;
    }
    const frame = this.spinnerFrames[this.spinnerIndex] ?? "⠋";
    return `\x1b[36m${frame} Thinking (${this.tokenCount} tokens)...\x1b[0m`;
  }
}
