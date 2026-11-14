import { createHash } from 'node:crypto';
import type { BigIntStats } from 'node:fs';
import type { FileHandle } from 'node:fs/promises';
import { sameArtifactRevision } from './directory.js';

export type ArtifactSource = Uint8Array | AsyncIterable<Uint8Array>;
export interface ArtifactReceipt {
  readonly sha256: string;
  readonly totalBytes: number;
  readonly totalLines: number;
}
export const ARTIFACT_CHUNK_BYTES = 64 * 1024;

/** Digest only bytes confirmed written; a partial write cannot invent a receipt. */
export class ArtifactDigest {
  private readonly hash = createHash('sha256');
  private newlines = 0;
  totalBytes = 0;

  record(bytes: Uint8Array): void {
    if (!Number.isSafeInteger(this.totalBytes + bytes.byteLength)) throw new Error('Artifact byte count exceeds its limit.');
    this.hash.update(bytes);
    this.totalBytes += bytes.byteLength;
    for (const byte of bytes) if (byte === 10) this.newlines++;
  }

  receipt(): ArtifactReceipt {
    return { sha256: this.hash.copy().digest('hex'), totalBytes: this.totalBytes, totalLines: this.newlines + 1 };
  }
}

/** Copy at most one block so caller mutation cannot change a pending write. */
export async function writeArtifactChunk(handle: FileHandle, bytes: Uint8Array, digest: ArtifactDigest,
  signal?: AbortSignal, verify?: () => Promise<void>): Promise<void> {
  if (!(bytes instanceof Uint8Array)) throw new Error('Artifact source must yield bytes.');
  for (let offset = 0; offset < bytes.byteLength; offset += ARTIFACT_CHUNK_BYTES) {
    const block = Buffer.from(bytes.subarray(offset, offset + ARTIFACT_CHUNK_BYTES));
    let written = 0;
    while (written < block.length) {
      signal?.throwIfAborted(); await verify?.(); signal?.throwIfAborted();
      const result = await handle.write(block, written, block.length - written, digest.totalBytes);
      if (!Number.isSafeInteger(result.bytesWritten) || result.bytesWritten < 1 || result.bytesWritten > block.length - written) {
        throw new Error('Artifact staging write did not complete.');
      }
      digest.record(block.subarray(written, written + result.bytesWritten));
      written += result.bytesWritten;
      await verify?.();
    }
  }
  signal?.throwIfAborted(); await verify?.(); signal?.throwIfAborted();
}

/** Sources must yield bounded chunks. Abort also releases a stalled next(). */
export async function writeArtifactSource(handle: FileHandle, source: ArtifactSource, signal?: AbortSignal,
  verify?: () => Promise<void>, digest = new ArtifactDigest()): Promise<ArtifactReceipt> {
  if (source instanceof Uint8Array) {
    await writeArtifactChunk(handle, source, digest, signal, verify);
    return digest.receipt();
  }
  const iterator = source[Symbol.asyncIterator]();
  let complete = false;
  try {
    for (;;) {
      const result = await nextArtifactChunk(iterator, signal);
      if (result.done) { complete = true; break; }
      await writeArtifactChunk(handle, result.value, digest, signal, verify);
    }
    return digest.receipt();
  } finally {
    // An async generator with a pending next may also stall return. Its owner
    // retains cleanup responsibility; late failures are observed, never awaited.
    if (!complete) {
      try {
        const retire = iterator.return;
        if (retire) void Promise.resolve(retire.call(iterator)).catch(() => {});
      } catch { /* no product failure from source retirement */ }
    }
  }
}

async function nextArtifactChunk(iterator: AsyncIterator<Uint8Array>, signal?: AbortSignal): Promise<IteratorResult<Uint8Array>> {
  signal?.throwIfAborted();
  if (!signal) return iterator.next();
  return new Promise((resolve, reject) => {
    const abort = (): void => { signal.removeEventListener('abort', abort); reject(signal.reason); };
    signal.addEventListener('abort', abort, { once: true });
    // Promise admission catches synchronous next failures and observes late ones.
    void Promise.resolve().then(() => { signal.throwIfAborted(); return iterator.next(); }).then(
      value => { signal.removeEventListener('abort', abort); resolve(value); },
      error => { signal.removeEventListener('abort', abort); reject(error); },
    );
    if (signal.aborted) abort();
  });
}

/** One fixed read buffer plus an EOF probe binds digest, exact size and revision. */
export async function verifyArtifactContent(handle: FileHandle, expected: ArtifactReceipt, signal?: AbortSignal,
  verify?: () => Promise<void>): Promise<BigIntStats> {
  signal?.throwIfAborted(); await verify?.(); signal?.throwIfAborted();
  const before = await handle.stat({ bigint: true });
  if (!before.isFile() || before.size !== BigInt(expected.totalBytes)) throw new Error('Artifact publication byte verification failed.');
  const digest = new ArtifactDigest();
  const buffer = Buffer.alloc(ARTIFACT_CHUNK_BYTES);
  while (digest.totalBytes < expected.totalBytes) {
    signal?.throwIfAborted(); await verify?.(); signal?.throwIfAborted();
    const read = await handle.read(buffer, 0, Math.min(buffer.length, expected.totalBytes - digest.totalBytes), digest.totalBytes);
    if (!read.bytesRead) throw new Error('Artifact publication byte verification failed.');
    digest.record(buffer.subarray(0, read.bytesRead));
  }
  signal?.throwIfAborted(); await verify?.(); signal?.throwIfAborted();
  if ((await handle.read(buffer, 0, 1, expected.totalBytes)).bytesRead) throw new Error('Artifact publication byte verification failed.');
  const after = await handle.stat({ bigint: true });
  const actual = digest.receipt();
  if (!sameArtifactRevision(before, after) || actual.sha256 !== expected.sha256 || actual.totalLines !== expected.totalLines) {
    throw new Error('Artifact publication changed during verification.');
  }
  signal?.throwIfAborted(); await verify?.(); signal?.throwIfAborted();
  return after;
}
