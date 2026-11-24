import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { brotliDecompressSync } from 'node:zlib';
import { isRecord } from '../../../core/values/record.js';

const nativeRequire = createRequire(import.meta.url);
const MAX_BYTES = 8 * 1024 * 1024;

export function readInitializer(): Buffer {
  const asset = (typeof require === 'function' ? require('./asset.json') : nativeRequire('./asset.json')) as unknown;
  if (!isRecord(asset) || asset.version !== 1 || typeof asset.data !== 'string' || asset.data.length > 3 * 1024 * 1024
    || typeof asset.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(asset.sha256)
    || !Number.isSafeInteger(asset.bytes) || Number(asset.bytes) < 1 || Number(asset.bytes) > MAX_BYTES) {
    throw new Error('The bundled architecture initializer is invalid.');
  }
  const bytes = brotliDecompressSync(Buffer.from(asset.data, 'base64'), { maxOutputLength: MAX_BYTES });
  if (bytes.byteLength !== asset.bytes || createHash('sha256').update(bytes).digest('hex') !== asset.sha256) {
    throw new Error('The bundled architecture initializer failed its digest check.');
  }
  return bytes;
}
