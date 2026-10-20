import { defaultTheme } from "../../theme/theme.js";
import { type Block, renderBlock, type BlockRenderOptions } from "./blocks.js";
import { sourceLinesFor, type SourceLine } from "./source.js";

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
  /** The render options the cached rows were built with; protocol changes re-render. */
  options?: BlockRenderOptions;
  readonly width: number;
  /** The palette revision the rows were rendered with. */
  readonly revision: number;
  readonly rows: readonly string[];
}

/**
 * How many widths one block's rows are kept for.
 *
 * One is not enough. A frame asks about a block twice at different widths: the
 * surface measures the transcript at the full width to decide whether a
 * scrollbar is needed, then renders it one column narrower because the scrollbar
 * takes the last one. With a single slot the two questions evict each other and
 * every block is re-laid-out on every frame — measured at 18ms a frame against
 * 0.9ms with the rows held, on a conversation of 8,000 blocks.
 *
 * Two would cover that pair exactly; four leaves room for the pair a reflow
 * produces without a resize throwing away what it is about to ask for again.
 */
const MAX_CACHED_WIDTHS = 4;

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
  private revisionValue = 0;
  private readonly cache = new WeakMap<Block, CacheEntry[]>();

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
    block.text = text;
    this.revisionValue++;
    this.cache.delete(block);
  }

  /** Attach a diff below the body, forgetting the cached rows it changes. */
  setDiff(block: Block, diff: string): void {
    block.diff = diff;
    this.revisionValue++;
    this.cache.delete(block);
  }

  /** Drop the diff, forgetting the cached rows it was part of. */
  clearDiff(block: Block): void {
    block.diff = undefined;
    this.revisionValue++;
    this.cache.delete(block);
  }

  /** Mark every block finished, so its rendering is stable and cacheable. */
  finalizeAll(): void {
    for (const block of this.blocks) block.finalized = true;
  }

  /** Forget everything. */
  clear(): void {
    this.blocks = [];
    this.revisionValue++;
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
  render(width: number, options?: BlockRenderOptions): RenderedTranscript {
    if (this.blocks.length === 0) {
      return { rows: EMPTY, owners: EMPTY as unknown as number[], sources: EMPTY as unknown as (SourceLine | undefined)[] };
    }
    const rows: string[] = [];
    const owners: number[] = [];
    const sources: (SourceLine | undefined)[] = [];
    for (let index = 0; index < this.blocks.length; index++) {
      const block = this.blocks[index]!;
      const blockRows = this.rowsFor(block, width, options);
      const blockSources = sourceLinesFor(block, index, width, blockRows);
      for (let row = 0; row < blockRows.length; row++) {
        rows.push(blockRows[row]!);
        owners.push(index);
        sources.push(blockSources[row]);
      }
    }
    return { rows, owners, sources };
  }

  /** Rendered rows for one block, memoised while the block cannot change. */
  private rowsFor(block: Block, width: number, options?: BlockRenderOptions): readonly string[] {
    if (!block.finalized) return renderBlock(block, width, options);
    const entries = this.cache.get(block);
    // The palette is recolored in place, so the same block at the same width
    // renders differently after a theme change. Keying on width alone left the
    // scrollback in the old theme until a resize happened to invalidate it.
    const revision = defaultTheme.colorRevision;
    const cacheKey = (entry: CacheEntry, candidateWidth: number): boolean =>
      entry.width === candidateWidth &&
      entry.revision === revision &&
      entry.options?.imageProtocol === options?.imageProtocol;
    const hit = entries?.find((entry) => cacheKey(entry, width));
    if (hit) return hit.rows;

    const rows = renderBlock(block, width, options);
    // An entry from a superseded palette is worth nothing, so those go first
    // and the width list stays bounded.
    const kept = (entries ?? []).filter((entry) => entry.revision === revision);
    kept.unshift({ width, revision, rows, options });
    this.cache.set(block, kept.slice(0, MAX_CACHED_WIDTHS));
    return rows;
  }
}
