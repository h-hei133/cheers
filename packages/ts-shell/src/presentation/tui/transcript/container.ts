import { type Block, type BlockRenderOptions } from "./blocks.js";
import { type SourceLine } from "./source.js";
import { TranscriptCache } from './cache.js';
import { RetainedWindow } from './retained.js';

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

const EMPTY: readonly string[] = [];

export interface RenderedTranscript {
  readonly rows: readonly string[];
  /** For each row, the index of the block that produced it. */
  readonly owners: readonly number[];
  /** For each row, its semantic source line when the renderer can state one. */
  readonly sources: readonly (SourceLine | undefined)[];
}

export class Transcript {
  private blocks: Block[] = [];
  private readonly retained = new RetainedWindow();
  private revisionValue = 0;
  private readonly cache = new TranscriptCache();

  /** Add a block to the end of the transcript. */
  append(block: Block): Block {
    this.blocks.push(block);
    this.revisionValue++;
    return block;
  }

  /** Source revision for consumers that must not apply a stale selection. */
  get revision(): number {
    return this.revisionValue;
  }

  /**
   * Every block, oldest first.
   *
   * Exposed for the operations that act on the set rather than one block —
   * collapsing everything, or finalizing the transcript — so those do not have
   * to walk it by index.
   */
  all(): readonly Block[] {
    return this.blocks;
  }

  /** Restored source blocks outside the initial display window remain copyable. */
  retainEarlier(blocks: readonly Block[], notice?: Block): void {
    this.retained.retain(blocks, notice);
    this.revisionValue++;
  }

  /** Expose one preceding source page without changing the conversation array. */
  revealEarlier(): number {
    const page = this.retained.takePage();
    if (page.blocks.length === 0) return 0;
    this.blocks.splice(0, 0, ...page.blocks);
    this.revisionValue++;
    if (page.notice) this.setText(page.notice, page.remaining > 0
      ? `${page.remaining} earlier messages are not shown.`
      : 'All earlier messages are shown.');
    return page.blocks.length;
  }

  copyable(): readonly Block[] {
    return [...this.retained.sources(), ...this.blocks];
  }

  /** Visit retained source without allocating a combined history array. */
  *copySources(): Generator<Block> {
    yield* this.retained.sources();
    yield* this.blocks;
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
    this.update(block, current => { current.collapsed = collapsed; });
  }

  /**
   * Replace a block's body, forgetting its cached rows.
   *
   * Five call sites changed `text` on a finalized block directly — a notification
   * updating itself, the pager taking a long body over, a diff being lifted out
   * of the prose — and each left the screen showing the rows from before,
   * because the cache is keyed by width and theme and knows nothing about the
   * change. Routing every write through here is what makes a stale cache
   * impossible to reintroduce by forgetting one of them.
   */
  setText(block: Block, text: string): void {
    this.update(block, current => { current.text = text; });
  }

  /** Attach a diff below the body, forgetting the cached rows it changes. */
  setDiff(block: Block, diff: string): void {
    this.update(block, current => { current.diff = diff; });
  }

  /** Drop the diff, forgetting the cached rows it was part of. */
  clearDiff(block: Block): void {
    this.update(block, current => { current.diff = undefined; });
  }

  /** Apply any render-affecting block mutation through one revisioned path. */
  update(block: Block, mutate: (block: Block) => void): void {
    mutate(block);
    this.revisionValue++;
    this.cache.invalidate(block);
  }

  /** Mark every block finished, so its rendering is stable and cacheable. */
  finalizeAll(): void {
    for (const block of this.blocks) block.finalized = true;
    this.revisionValue++;
  }

  /** Forget everything. */
  clear(): void {
    this.blocks = [];
    this.retained.clear();
    this.revisionValue++;
  }

  /** Rows the whole transcript occupies at `width`. */
  rowCount(width: number): number {
    let total = 0;
    for (let index = 0; index < this.blocks.length; index++) total += this.cache.rowsFor(this.blocks[index]!, index, width).length;
    return total;
  }

  /**
   * Every row, with the block each came from.
   *
   * The owner list is what lets a click on a row reach the block under it — a
   * collapsed reasoning block or a tool card that can be expanded.
   */
  render(width: number, options?: BlockRenderOptions): RenderedTranscript {
    if (this.blocks.length === 0) {
      return { rows: EMPTY, owners: EMPTY as unknown as number[], sources: EMPTY as unknown as (SourceLine | undefined)[] };
    }
    const rows: string[] = [];
    const owners: number[] = [];
    const sources: (SourceLine | undefined)[] = [];
    for (let index = 0; index < this.blocks.length; index++) {
      const block = this.blocks[index]!;
      const blockRows = this.cache.rowsFor(block, index, width, options);
      const blockSources = this.cache.sourcesFor(block, index, width, blockRows, options);
      for (let row = 0; row < blockRows.length; row++) {
        rows.push(blockRows[row]!);
        owners.push(index);
        sources.push(blockSources[row]);
      }
    }
    return { rows, owners, sources };
  }

}
