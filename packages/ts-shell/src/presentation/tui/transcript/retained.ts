import type { Block } from './blocks.js';

const PAGE_BLOCKS = 60;

export interface RetainedPage {
  readonly blocks: readonly Block[];
  readonly remaining: number;
  readonly notice?: Block;
}

/** The undisplayed prefix and its original presentation notice share one lifetime. */
export class RetainedWindow {
  private blocks: readonly Block[] = [];
  private notice: Block | undefined;

  retain(blocks: readonly Block[], notice?: Block): void {
    this.blocks = [...blocks];
    this.notice = notice;
  }

  sources(): readonly Block[] {
    return this.blocks;
  }

  takePage(): RetainedPage {
    const start = Math.max(0, this.blocks.length - PAGE_BLOCKS);
    const blocks = this.blocks.slice(start);
    this.blocks = this.blocks.slice(0, start);
    return { blocks, remaining: this.blocks.length, notice: this.notice };
  }

  clear(): void {
    this.blocks = [];
    this.notice = undefined;
  }
}
