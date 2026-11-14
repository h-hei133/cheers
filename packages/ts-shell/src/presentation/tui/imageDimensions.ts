import { getImageDimensions, type ImageDimensions } from '../../model-adapters/image/metadata.js';
export { getImageDimensions, type ImageDimensions } from '../../model-adapters/image/metadata.js';

export interface CellDimensions {
  readonly widthPx: number;
  readonly heightPx: number;
}

const DEFAULT_CELL_DIMENSIONS: CellDimensions = Object.freeze({ widthPx: 9, heightPx: 18 });
let currentCellDimensions: CellDimensions = DEFAULT_CELL_DIMENSIONS;

export function getCellDimensions(): CellDimensions {
  return currentCellDimensions;
}

export function setCellDimensions(dimensions: CellDimensions): void {
  if (Number.isSafeInteger(dimensions.widthPx) && Number.isSafeInteger(dimensions.heightPx)
    && dimensions.widthPx > 0 && dimensions.heightPx > 0
    && (dimensions.widthPx !== currentCellDimensions.widthPx || dimensions.heightPx !== currentCellDimensions.heightPx)) {
    currentCellDimensions = Object.freeze({ widthPx: dimensions.widthPx, heightPx: dimensions.heightPx });
  }
}
/** Compute terminal cell row count preserving image aspect ratio. */
export function calculateImageRows(
  dimensions: ImageDimensions,
  targetColumns: number,
  cellSize: CellDimensions = currentCellDimensions,
): number {
  if (dimensions.widthPx <= 0 || dimensions.heightPx <= 0 || targetColumns <= 0) return 1;
  const renderedHeightPx = (targetColumns * cellSize.widthPx * dimensions.heightPx) / dimensions.widthPx;
  return Math.max(1, Math.ceil(renderedHeightPx / cellSize.heightPx));
}

/** Bound both dimensions before constructing rows, including extreme image aspect ratios. */
export function imageCellSize(dimensions: ImageDimensions, availableColumns: number): { readonly columns: number; readonly rows: number } {
  const columns = Math.max(1, Math.min(48, Math.floor(availableColumns)));
  const cell = currentCellDimensions;
  const scale = Math.min(columns * cell.widthPx / dimensions.widthPx, 48 * cell.heightPx / dimensions.heightPx);
  return {
    columns: Math.max(1, Math.min(columns, Math.ceil(dimensions.widthPx * scale / cell.widthPx))),
    rows: Math.max(1, Math.min(48, Math.ceil(dimensions.heightPx * scale / cell.heightPx))),
  };
}

/** Estimate terminal-side decoded RGBA framebuffer bytes for eviction accounting. */
export function estimateDecodedImageBytes(base64Data: string, mimeType?: string): number {
  const dims = getImageDimensions(base64Data, mimeType);
  if (dims) {
    return dims.widthPx * dims.heightPx * 4;
  }
  return Math.ceil((base64Data.length * 3) / 4) * 4;
}
