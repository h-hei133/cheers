import type { IncomingMessage } from 'node:http';
import { PassThrough, Readable, Transform, pipeline } from 'node:stream';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';
import { NetworkError } from './error.js';

function byteLimit(maxBytes: number, onLimit: () => void): Transform {
  let bytes = 0;
  return new Transform({ transform(chunk: Buffer, _encoding, callback) {
    bytes += chunk.byteLength;
    if (bytes > maxBytes) onLimit();
    callback(bytes > maxBytes ? new NetworkError('response_limit') : null, bytes > maxBytes ? undefined : chunk);
  } });
}

/** Count transfer bytes before decoding; downstream consumers separately cap decoded bytes. */
export function responseBody(message: IncomingMessage, maxBytes: number): ReadableStream<Uint8Array> {
  const declared = message.headers['content-length'];
  if (declared && /^\d+$/.test(declared) && Number(declared) > maxBytes) throw new NetworkError('response_limit');
  const encodings = (message.headers['content-encoding'] ?? 'identity').split(',').map(value => value.trim().toLowerCase());
  if (encodings.length > 3 || encodings.some(value => !['identity', 'gzip', 'deflate', 'br'].includes(value))) {
    throw new NetworkError('invalid_response');
  }
  const decoders = encodings.reverse().flatMap(encoding => encoding === 'gzip' ? [createGunzip()]
    : encoding === 'deflate' ? [createInflate()] : encoding === 'br' ? [createBrotliDecompress()] : []);
  const output = new PassThrough();
  let limitReached = false;
  for (const decoder of decoders) decoder.once('error', error => {
    // Stopping an over-budget stream can make its decoder report teardown as an error.
    output.destroy(limitReached ? new NetworkError('response_limit')
      : error instanceof NetworkError ? error : new NetworkError('invalid_response'));
  });
  const stream = Readable.toWeb(output, {
    strategy: { highWaterMark: 64 * 1024, size: (chunk: Buffer) => chunk.byteLength },
  }) as ReadableStream<Uint8Array>;
  const onLimit = (): void => { limitReached = true; };
  pipeline([message, byteLimit(maxBytes, onLimit), ...decoders.flatMap(decoder => [decoder, byteLimit(maxBytes, onLimit)]), output], error => {
    if (error) {
      const failure = limitReached ? new NetworkError('response_limit')
        : error instanceof NetworkError ? error : new NetworkError('invalid_response');
      output.destroy(failure);
    }
  });
  return stream;
}
