import type { HistoryBatch } from "../render/frame.js";
import { type Block, renderBlock } from "./blocks.js";

/**
 * Ordered transcript with explicit retirement into terminal scrollback.
 *
 * Blocks stay live — and keep reflowing to the current width — while the screen
 * has room for them. Once the live tail no longer fits, the oldest *finalized*
 * blocks are offered as a history batch; the renderer writes that batch into the
 * terminal's own scrollback and acknowledges it, at which point the transcript
 * stops rendering those blocks entirely. Two invariants make that safe:
 * retirement is strictly in order, and a block is never offered while it can
 * still change, because rows already in scrollback cannot be taken back.
 */

interface Offer {
  readonly id: number;
  readonly end: number;
  readonly kind: "append" | "replay";
}

interface CacheEntry {
  readonly width: number;
  readonly rows: readonly string[];
}

const EMPTY: readonly string[] = [];

export class Transcript {
  private blocks: Block[] = [];
  private frontier = 0;
  private nextBatchId = 1;
  private offer: Offer | undefined;
  private replayPending = false;
  private flushing = false;
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

  /** Mark every live block finalized so the turn can retire. */
  finalizeAll(): void {
    for (let index = this.frontier; index < this.blocks.length; index++) {
      this.blocks[index]!.finalized = true;
    }
  }

  /** Forget everything, including what has already retired. */
  clear(): void {
    this.blocks = [];
    this.frontier = 0;
    this.offer = undefined;
    this.replayPending = false;
  }

  /** Rows the live tail would occupy at `width`, ignoring any pending offer. */
  rowCount(width: number): number {
    let total = 0;
    for (let index = this.frontier; index < this.blocks.length; index++) {
      total += this.rowsFor(this.blocks[index]!, width).length;
    }
    return total;
  }

  /**
   * The live tail, clipped to the last `rows` rows when it overflows.
   *
   * Blocks in an outstanding append offer are already excluded: they are on
   * their way into the terminal's scrollback in this very frame, so painting
   * them here too would show them twice. Call after {@link peekBatch}.
   */
  renderViewport(width: number, rows: number): readonly string[] {
    if (rows <= 0) return EMPTY;
    const output: string[] = [];
    for (let index = this.liveStart(); index < this.blocks.length; index++) {
      output.push(...this.rowsFor(this.blocks[index]!, width));
    }
    return output.length <= rows ? output : output.slice(output.length - rows);
  }

  /** First block still owned by the mutable viewport. */
  private liveStart(): number {
    return this.offer?.kind === "append" ? this.offer.end : this.frontier;
  }

  /**
   * The next batch to publish, or undefined when nothing may retire yet.
   *
   * Under a flush every finalized prefix is eligible. Otherwise a prefix is only
   * offered while the live tail exceeds `capacity`, so a short session keeps its
   * whole transcript reflowable in the viewport.
   */
  peekBatch(width: number, capacity: number): HistoryBatch | undefined {
    if (this.offer) return { id: this.offer.id, rows: this.offeredRows(width), kind: this.offer.kind };
    if (this.replayPending) return this.offerReplay(width);

    let live = this.rowCount(width);
    let end = this.frontier;
    const rows: string[] = [];
    while (end < this.blocks.length && this.blocks[end]!.finalized) {
      if (!this.flushing && live <= capacity) break;
      const blockRows = this.rowsFor(this.blocks[end]!, width);
      rows.push(...blockRows);
      live -= blockRows.length;
      end += 1;
    }
    if (end === this.frontier) return undefined;
    this.offer = { id: this.nextBatchId++, end, kind: "append" };
    return { id: this.offer.id, rows, kind: "append" };
  }

  /** Retire exactly the batch that was offered; any other id is ignored. */
  acknowledge(id: number): void {
    if (!this.offer || this.offer.id !== id) return;
    if (this.offer.kind === "append") this.frontier = this.offer.end;
    this.offer = undefined;
  }

  /** Republish the whole committed ledger after a scrollback reset. */
  beginReplay(): void {
    this.replayPending = true;
  }

  /** Retire every finalized prefix, regardless of viewport pressure. */
  beginFlush(): void {
    this.flushing = true;
    this.replayPending = false;
  }

  private offerReplay(width: number): HistoryBatch | undefined {
    this.replayPending = false;
    if (this.frontier === 0) return undefined;
    const rows: string[] = [];
    for (let index = 0; index < this.frontier; index++) {
      rows.push(...this.rowsFor(this.blocks[index]!, width));
    }
    if (rows.length === 0) return undefined;
    this.offer = { id: this.nextBatchId++, end: this.frontier, kind: "replay" };
    return { id: this.offer.id, rows, kind: "replay" };
  }

  private offeredRows(width: number): readonly string[] {
    const offer = this.offer!;
    const start = offer.kind === "replay" ? 0 : this.frontier;
    const rows: string[] = [];
    for (let index = start; index < offer.end; index++) {
      rows.push(...this.rowsFor(this.blocks[index]!, width));
    }
    return rows;
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
