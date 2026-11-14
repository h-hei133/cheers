import { describe, expect, it } from 'vitest';
import { pngImage } from '../../test-utils/image.js';
import { getImageDimensions } from './metadata.js';

describe('image metadata format identity', () => {
  const png = pngImage(320, 160);

  it('rejects an explicitly unknown MIME instead of guessing from unrelated bytes', () => {
    expect(getImageDimensions(png.data, 'image/svg+xml')).toBeUndefined();
    expect(getImageDimensions(png.data)).toEqual({ widthPx: 320, heightPx: 160 });
  });

  it('requires the complete PNG signature and the actual IHDR chunk', () => {
    const bytes = Buffer.from(png.data, 'base64');
    for (const offset of [4, 5, 6, 7, 11, 12, 13, 14, 15]) {
      const invalid = Buffer.from(bytes); invalid[offset] ^= 1;
      expect(getImageDimensions(invalid.toString('base64'), 'image/png'), `header byte ${offset}`).toBeUndefined();
    }
    expect(getImageDimensions(bytes.subarray(0, 24).toString('base64'), 'image/png')).toBeUndefined();
  });

  it.each(['VP8 ', 'VP8L'])('requires the %s bitstream signature before accepting dimension fields', tag => {
    const bytes = Buffer.alloc(30);
    bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WEBP', 8); bytes.write(tag, 12);
    bytes.writeUInt32LE(10, 16);
    if (tag === 'VP8 ') {
      bytes.set([0x9d, 0x01, 0x2a], 23); bytes.writeUInt16LE(320, 26); bytes.writeUInt16LE(160, 28);
    } else { bytes[20] = 0x2f; bytes.writeUInt32LE((319 | (159 << 14)) >>> 0, 21); }
    expect(getImageDimensions(bytes.toString('base64'), 'image/webp')).toEqual({ widthPx: 320, heightPx: 160 });
    bytes[tag === 'VP8 ' ? 23 : 20] = 0;
    expect(getImageDimensions(bytes.toString('base64'), 'image/webp')).toBeUndefined();
  });
});
