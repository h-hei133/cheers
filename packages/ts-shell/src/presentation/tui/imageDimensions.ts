export interface ImageDimensions {
  readonly widthPx: number;
  readonly heightPx: number;
}

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
function headerPrefixBuffer(base64Data: string, maxChars = 128): Buffer {
  if (base64Data.length <= maxChars) return Buffer.from(base64Data, "base64");
  const aligned = maxChars - (maxChars % 4);
  return Buffer.from(base64Data.slice(0, aligned), "base64");
}

function getPngDimensions(base64Data: string): ImageDimensions | undefined {
  const buffer = headerPrefixBuffer(base64Data, 64);
  if (buffer.length < 24) return undefined;
  if (buffer[0] !== 0x89 || buffer[1] !== 0x50 || buffer[2] !== 0x4e || buffer[3] !== 0x47) return undefined;
  const widthPx = buffer.readUInt32BE(16);
  const heightPx = buffer.readUInt32BE(20);
  return widthPx > 0 && heightPx > 0 ? { widthPx, heightPx } : undefined;
}

function getGifDimensions(base64Data: string): ImageDimensions | undefined {
  const buffer = headerPrefixBuffer(base64Data, 32);
  if (buffer.length < 10) return undefined;
  const sig = buffer.subarray(0, 6).toString("ascii");
  if (sig !== "GIF87a" && sig !== "GIF89a") return undefined;
  const widthPx = buffer.readUInt16LE(6);
  const heightPx = buffer.readUInt16LE(8);
  return widthPx > 0 && heightPx > 0 ? { widthPx, heightPx } : undefined;
}

function getWebpDimensions(base64Data: string): ImageDimensions | undefined {
  const buffer = headerPrefixBuffer(base64Data, 64);
  if (buffer.length < 16) return undefined;
  if (buffer.subarray(0, 4).toString("ascii") !== "RIFF" || buffer.subarray(8, 12).toString("ascii") !== "WEBP") {
    return undefined;
  }
  const chunk = buffer.subarray(12, 16).toString("ascii");
  if (chunk === "VP8 ") {
    if (buffer.length < 30) return undefined;
    const widthPx = buffer.readUInt16LE(26) & 0x3fff;
    const heightPx = buffer.readUInt16LE(28) & 0x3fff;
    return widthPx > 0 && heightPx > 0 ? { widthPx, heightPx } : undefined;
  }
  if (chunk === "VP8L") {
    if (buffer.length < 25) return undefined;
    const bits = buffer.readUInt32LE(21);
    const widthPx = (bits & 0x3fff) + 1;
    const heightPx = ((bits >> 14) & 0x3fff) + 1;
    return widthPx > 0 && heightPx > 0 ? { widthPx, heightPx } : undefined;
  }
  if (chunk === "VP8X") {
    if (buffer.length < 30) return undefined;
    const widthPx = (buffer[24]! | (buffer[25]! << 8) | (buffer[26]! << 16)) + 1;
    const heightPx = (buffer[27]! | (buffer[28]! << 8) | (buffer[29]! << 16)) + 1;
    return widthPx > 0 && heightPx > 0 ? { widthPx, heightPx } : undefined;
  }
  return undefined;
}

function parseJpegBuffer(buffer: Buffer): ImageDimensions | undefined {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return undefined;
  let offset = 2;
  while (offset < buffer.length - 9) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1]!;
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    if (marker >= 0xc0 && marker <= 0xc2) {
      const heightPx = buffer.readUInt16BE(offset + 5);
      const widthPx = buffer.readUInt16BE(offset + 7);
      return widthPx > 0 && heightPx > 0 ? { widthPx, heightPx } : undefined;
    }
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    if (offset + 3 >= buffer.length) return undefined;
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2) return undefined;
    offset += 2 + length;
  }
  return undefined;
}

function getJpegDimensions(base64Data: string): ImageDimensions | undefined {
  const prefix = headerPrefixBuffer(base64Data, 65536);
  const found = parseJpegBuffer(prefix);
  if (found || base64Data.length <= 65536) return found;
  return parseJpegBuffer(Buffer.from(base64Data, "base64"));
}

/** Parse pixel dimensions from PNG, JPEG, GIF, or WebP base64 payloads. */
export function getImageDimensions(base64Data: string, mimeType?: string): ImageDimensions | undefined {
  try {
    if (!base64Data) return undefined;
    if (mimeType === "image/png") return getPngDimensions(base64Data);
    if (mimeType === "image/jpeg") return getJpegDimensions(base64Data);
    if (mimeType === "image/gif") return getGifDimensions(base64Data);
    if (mimeType === "image/webp") return getWebpDimensions(base64Data);
    return (
      getPngDimensions(base64Data) ??
      getGifDimensions(base64Data) ??
      getWebpDimensions(base64Data) ??
      getJpegDimensions(base64Data)
    );
  } catch {
    return undefined;
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
