import type { ImageContent } from '../multimodal.js';
import type { ModelImageResizeOptions } from '../../core/models/modalities.js';
import { getImageDimensions, type ImageDimensions } from './metadata.js';

const MAX_SOURCE_BYTES = 16 * 1024 * 1024;

/** Preserve the JPEG alias accepted by existing image consumers. */
export function canonicalImageMime(mimeType: string): string {
  return mimeType === 'image/jpg' ? 'image/jpeg' : mimeType;
}

export function imageMime(bytes: Buffer): string | undefined {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString('ascii'))) return 'image/gif';
  return undefined;
}

/** Validate bounded encoded input and its existing format headers without decoding pixels. */
export function inspectImage(image: ImageContent): ImageDimensions & { readonly bytes: number } {
  if (typeof image.data !== 'string' || typeof image.mimeType !== 'string'
    || image.data.length > Math.ceil(MAX_SOURCE_BYTES / 3) * 4) throw new Error('Image input exceeds the 16MiB source limit.');
  if (!image.data || image.data.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(image.data)) throw new Error('Image input is not valid base64.');
  const decoded = Buffer.from(image.data, 'base64');
  const mimeType = canonicalImageMime(image.mimeType);
  if (decoded.length > MAX_SOURCE_BYTES) throw new Error('Image input exceeds the 16MiB source limit.');
  if (decoded.toString('base64') !== image.data || imageMime(decoded) !== mimeType) throw new Error('Image input does not match its declared format.');
  if (mimeType === 'image/png' && (decoded.length < 33 || decoded.subarray(12, 16).toString('ascii') !== 'IHDR'
    || decoded.readUInt32BE(8) !== 13)) throw new Error('Image input has an invalid PNG header.');
  if (mimeType === 'image/jpeg' && (decoded[decoded.length - 2] !== 255 || decoded[decoded.length - 1] !== 217)) throw new Error('Image input has an incomplete JPEG frame.');
  if (mimeType === 'image/gif' && (decoded.length < 14 || decoded[decoded.length - 1] !== 59)) throw new Error('Image input has an incomplete GIF frame.');
  if (mimeType === 'image/webp' && (decoded.length < 25 || decoded.readUInt32LE(4) + 8 !== decoded.length)) throw new Error('Image input has an invalid WebP envelope.');
  const dimensions = getImageDimensions(image.data, mimeType);
  if (!dimensions) throw new Error('Image dimensions could not be verified.');
  return { ...dimensions, bytes: decoded.length };
}

export function imageExceedsLimits(image: ImageDimensions & { readonly bytes: number }, resize: ModelImageResizeOptions): boolean {
  return image.widthPx > (resize.maxWidth ?? Infinity) || image.heightPx > (resize.maxHeight ?? Infinity)
    || image.bytes > (resize.maxBytes ?? Infinity);
}
