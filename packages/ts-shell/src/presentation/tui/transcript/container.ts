import { type Block, renderBlock } from "./blocks.js";

/**
 * Ordered transcript.
 *
 * Every block the session has produced, rendered to rows on demand. It used to
 * retire finished blocks into the terminal's own scrollback, because the session
 * was drawn on the normal screen; on a screen of our own there is nothing to
 * retire *into*, so the transcript keeps everything and the surface decides which
 * part of it is on screen.
 *
 * Rendering is memoised per block while the block cannot change, so composing a
 * frame from a long conversation costs an array walk rather than a re-layout.
 */

interface CacheEntry {
  readonly width: number;
  readonly rows: readonly string[];
}

const EMPTY: readonly string[] = [];

export interface RenderedTranscript {
  readonly rows: readonly string[];
  /** For each row, the index of the block that produced it. */
  readonly owners: readonly number[];
}

export class Transcript {
  private blocks: Block[] = [];
  private readonly cache = new WeakMap<Block, CacheEntry>();

  /** Add a block to the end of the transcript. */
  append(block: Block): Block {
    this.blocks.push(block);
    return block;
  }

  /** The most recently appended block, for streaming updates. */
  last(): Block | undefined {
    return this.blocks[this.blocks.length - 1];
  }

  /** The block a rendered row came from, for a click that lands on it. */
  blockAt(index: number): Block | undefined {
    return this.blocks[index];
  }

  /** The newest blocks first, for a chooser over what was said. */
  recent(limit: number): readonly Block[] {
    return this.blocks.slice(Math.max(0, this.blocks.length - limit)).reverse();
  }

  /**
   * Fold or unfold a block, and forget its cached rows.
   *
   * The fold is the one thing about a finished block that can still change, and
   * the cache is keyed only by width — so mutating `collapsed` directly changed
   * the model and left the screen showing the rows from before. Routing it through
   * here is what makes that impossible to forget.
   */
  setCollapsed(block: Block, collapsed: boolean): void {
    block.collapsed = collapsed;
    this.cache.delete(block);
  }

  /** Mark every block finished, so its rendering is stable and cacheable. */
  finalizeAll(): void {
    for (const block of this.blocks) block.finalized = true;
  }

  /** Forget everything. */
  clear(): void {
    this.blocks = [];
  }

  /** Rows the whole transcript occupies at `width`. */
  rowCount(width: number): number {
    let total = 0;
    for (const block of this.blocks) total += this.rowsFor(block, width).length;
    return total;
  }

  /**
   * Every row, with the block each came from.
   *
   * The owner list is what lets a click on a row reach the block under it — a
   * collapsed reasoning block or a tool card that can be expanded.
   */
  render(width: number): RenderedTranscript {
    if (this.blocks.length === 0) return { rows: EMPTY, owners: EMPTY as unknown as number[] };
    const rows: string[] = [];
    const owners: number[] = [];
    for (let index = 0; index < this.blocks.length; index++) {
      for (const row of this.rowsFor(this.blocks[index]!, width)) {
        rows.push(row);
        owners.push(index);
      }
    }
    return { rows, owners };
  }

  /** Rendered rows for one block, memoised while the block cannot change. */
  private rowsFor(block: Block, width: number): readonly string[] {
    if (!block.finalized) return renderBlock(block, width);
    const cached = this.cache.get(block);
    if (cached && cached.width === width) return cached.rows;
    const rows = renderBlock(block, width);
    this.cache.set(block, { width, rows });
    return rows;
  }
}
