import { ReadChangedError, readRevision, withVerifiedReadTarget } from './read.js';
import type { TextFileReadExecutionRequest } from './types.js';

export class SnapshotLimitError extends Error {
  constructor() { super('Upload source exceeds the byte limit.'); }
}

/** Bounded bytes from the verified file handle, rejecting mutation during capture. */
export async function readBinarySnapshot(request: Pick<TextFileReadExecutionRequest, 'absolutePath' | 'workspaceRoot' | 'assertFileAccess' | 'abortSignal' | 'onCapturedSource'>, maxBytes: number): Promise<Buffer> {
  return withVerifiedReadTarget(request, 'file', async (handle, verify) => {
    const before = await handle.stat({ bigint: true });
    if (before.size > BigInt(maxBytes)) throw new SnapshotLimitError();
    const chunks: Buffer[] = [];
    let bytes = 0;
    for (;;) {
      await verify();
      const chunk = Buffer.alloc(Math.min(64 * 1024, maxBytes - bytes + 1));
      const read = await handle.read(chunk, 0, chunk.length, bytes);
      if (!read.bytesRead) break;
      bytes += read.bytesRead;
      if (bytes > maxBytes) throw new SnapshotLimitError();
      chunks.push(chunk.subarray(0, read.bytesRead));
    }
    await verify();
    const after = await handle.stat({ bigint: true });
    if (readRevision(before) !== readRevision(after)) throw new ReadChangedError();
    return Buffer.concat(chunks, bytes);
  });
}
