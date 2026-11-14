import { defaultTheme } from '../../theme/theme.js';
import { type Block, renderBlock, type BlockRenderOptions } from './blocks.js';
import { sourceLinesFor, type SourceLine } from './source.js';
import { getCellDimensions, type CellDimensions } from '../imageDimensions.js';

interface CacheEntry {
  options?: BlockRenderOptions;
  readonly width: number;
  readonly revision: number;
  readonly cellSize?: CellDimensions;
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
    const cellSize = options?.imageProtocol && block.images?.length ? getCellDimensions() : undefined;
    const hit = entries?.find(entry =>
      entry.width === width &&
      entry.revision === revision &&
      entry.cellSize === cellSize &&
      entry.options?.imageProtocol === options?.imageProtocol &&
      entry.options?.supportsHyperlinks === options?.supportsHyperlinks &&
      entry.options?.thinkingShortcut === options?.thinkingShortcut);
    if (hit) {
      if (hit.blockIndex !== index) {
        hit.blockIndex = index;
        hit.sources = undefined;
      }
      return hit.rows;
    }
    const rows = renderBlock(block, width, options);
    const kept = (entries ?? []).filter(entry => entry.revision === revision && entry.cellSize === cellSize);
    kept.unshift({ width, revision, cellSize, rows, options: options ? { ...options } : undefined, blockIndex: index });
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
    if (!block.finalized) return sourceLinesFor(block, index, width, rows, options);
    const entry = this.entries.get(block)?.find(candidate => candidate.width === width
      && candidate.revision === defaultTheme.colorRevision
      && candidate.rows === rows
      && candidate.options?.imageProtocol === options?.imageProtocol
      && candidate.options?.supportsHyperlinks === options?.supportsHyperlinks
      && candidate.options?.thinkingShortcut === options?.thinkingShortcut);
    if (entry?.sources) return entry.sources;
    const sources = sourceLinesFor(block, index, width, rows, options);
    if (entry) entry.sources = sources;
    return sources;
  }
}
