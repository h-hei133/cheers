import type { Block } from '../../../presentation/tui/transcript/blocks.js';
import type { Transcript } from '../../../presentation/tui/transcript/container.js';

/** One model message owns its reasoning block, including corrections after text. */
export class Thinking {
  private block: Block | undefined;
  private live = false;
  private startedAt = 0;

  constructor(
    private readonly transcript: Transcript,
    private readonly now: () => number,
    private readonly onSettle: () => void,
  ) {}

  clear(): void {
    this.block = undefined;
    this.live = false;
  }

  append(text: string): boolean {
    // Empty frame ticks cannot restart a block whose answer already started.
    if (!text && !this.live) return false;
    if (!this.block) {
      this.block = this.transcript.append({ kind: 'thinking', text: '', finalized: false, collapsed: true });
    }
    if (!this.live) {
      this.startedAt = this.now() - (this.block.elapsedMs ?? 0);
      this.live = true;
      this.transcript.update(this.block, block => { block.finalized = false; });
    }
    const elapsed = this.now() - this.startedAt;
    if (Math.floor(elapsed / 100) !== Math.floor((this.block.elapsedMs ?? 0) / 100)) {
      this.transcript.update(this.block, block => { block.elapsedMs = elapsed; });
    }
    if (text) this.transcript.setText(this.block, this.block.text + text);
    return true;
  }

  replace(text: string): void {
    if (!this.block && text) this.append(text);
    else if (this.block && this.block.text !== text) this.transcript.setText(this.block, text);
    this.settle();
  }

  settle(): void {
    if (!this.block || !this.live) return;
    this.transcript.update(this.block, block => { block.finalized = true; });
    this.live = false;
    this.onSettle();
  }
}
