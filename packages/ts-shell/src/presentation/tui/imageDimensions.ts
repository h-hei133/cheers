import { getImageDimensions, type ImageDimensions } from '../../model-adapters/image/metadata.js';
export { getImageDimensions, type ImageDimensions } from '../../model-adapters/image/metadata.js';

export interface CellDimensions {
  readonly widthPx: number;
  readonly heightPx: number;
}

const DEFAULT_CELL_DIMENSIONS: CellDimensions = { widthPx: 9, heightPx: 18 };
let currentCellDimensions: CellDimensions = DEFAULT_CELL_DIMENSIONS;

export function getCellDimensions(): CellDimensions {
  return currentCellDimensions;
}

export function setCellDimensions(dimensions: CellDimensions): void {
  if (dimensions.widthPx > 0 && dimensions.heightPx > 0) {
    currentCellDimensions = dimensions;
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
  return Math.max(1, Math.round(renderedHeightPx / cellSize.heightPx));
}

/** Estimate terminal-side decoded RGBA framebuffer bytes for eviction accounting. */
export function estimateDecodedImageBytes(base64Data: string, mimeType?: string): number {
  const dims = getImageDimensions(base64Data, mimeType);
  if (dims) {
    return dims.widthPx * dims.heightPx * 4;
  }
  return Math.ceil((base64Data.length * 3) / 4) * 4;
}
