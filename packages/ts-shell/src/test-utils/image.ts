import { deflateSync } from 'node:zlib';
import type { ImageContent } from '../model-adapters/multimodal.js';

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, bytes: Buffer): Buffer {
  const output = Buffer.alloc(bytes.length + 12);
  output.writeUInt32BE(bytes.length);
  output.write(type, 4, 'ascii');
  bytes.copy(output, 8);
  output.writeUInt32BE(crc32(output.subarray(4, -4)), output.length - 4);
  return output;
}

/** Complete lossless PNG with a distinct optional text chunk for image identity. */
export function pngImage(width = 1, height = 1, label = ''): ImageContent {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const pixels = Buffer.alloc((width * 4 + 1) * height);
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      const offset = row * (width * 4 + 1) + 1 + column * 4;
      pixels[offset + 2] = 255;
      pixels[offset + 3] = 255;
    }
  }
  const bytes = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    ...(label ? [chunk('tEXt', Buffer.from(`Fixture\0${label}`))] : []),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return { type: 'image', mimeType: 'image/png', data: bytes.toString('base64') };
}
