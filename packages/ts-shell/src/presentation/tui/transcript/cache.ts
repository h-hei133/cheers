import { defaultTheme } from '../../theme/theme.js';
import { type Block, renderBlock, type BlockRenderOptions } from './blocks.js';
import { sourceLinesFor, type SourceLine } from './source.js';

interface CacheEntry {
  options?: BlockRenderOptions;
  readonly width: number;
  readonly revision: number;
  readonly rows: readonly string[];
  /** Render rows survive a move; source lines carry the current block index. */
  blockIndex: number;
  sources?: readonly (SourceLine | undefined)[];
}

/** Full-width measurement and scrollbar-width rendering must coexist. */
const MAX_CACHED_WIDTHS = 4;

/** Per-block layout/source memoization, independent of transcript ordering. */
export class TranscriptCache {
  private readonly entries = new WeakMap<Block, CacheEntry[]>();

  invalidate(block: Block): void {
    this.entries.delete(block);
  }

  rowsFor(block: Block, index: number, width: number, options?: BlockRenderOptions): readonly string[] {
    if (!block.finalized) return renderBlock(block, width, options);
    const entries = this.entries.get(block);
    const revision = defaultTheme.colorRevision;
    const hit = entries?.find(entry =>
      entry.width === width &&
      entry.revision === revision &&
      entry.options?.imageProtocol === options?.imageProtocol &&
      entry.options?.thinkingShortcut === options?.thinkingShortcut);
    if (hit) {
      if (hit.blockIndex !== index) {
        hit.blockIndex = index;
        hit.sources = undefined;
      }
      return hit.rows;
    }
    const rows = renderBlock(block, width, options);
    const kept = (entries ?? []).filter(entry => entry.revision === revision);
    kept.unshift({ width, revision, rows, options, blockIndex: index });
    this.entries.set(block, kept.slice(0, MAX_CACHED_WIDTHS));
    return rows;
  }

  sourcesFor(
    block: Block,
    index: number,
    width: number,
    rows: readonly string[],
    options?: BlockRenderOptions,
  ): readonly (SourceLine | undefined)[] {
    if (!block.finalized) return sourceLinesFor(block, index, width, rows);
    const entry = this.entries.get(block)?.find(candidate => candidate.width === width
      && candidate.revision === defaultTheme.colorRevision
      && candidate.options?.imageProtocol === options?.imageProtocol
      && candidate.options?.thinkingShortcut === options?.thinkingShortcut);
    if (entry?.sources) return entry.sources;
    const sources = sourceLinesFor(block, index, width, rows);
    if (entry) entry.sources = sources;
    return sources;
  }
}
