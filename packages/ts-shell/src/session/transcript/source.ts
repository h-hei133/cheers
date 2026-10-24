import * as fs from 'node:fs';
import { fileIdentity } from '../../core/workspace/files.js';

export interface TranscriptReadLimits {
  readonly maxBytes: number;
  readonly maxLines: number;
}

const CHUNK_BYTES = 64 * 1024;
const YIELD_LINES = 1024;

/** Consume complete prefix lines without retaining or allocating the entire source text. */
export async function readTranscriptPrefixAsync(
  target: string,
  limits: TranscriptReadLimits,
  accept: (line: string) => void,
  signal?: AbortSignal,
): Promise<boolean> {
  signal?.throwIfAborted();
  const before = await fs.promises.lstat(target);
  if (!before.isFile()) throw new Error('The saved transcript is unavailable.');
  const handle = await fs.promises.open(target,
    fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0) | (fs.constants.O_NONBLOCK ?? 0));
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || fileIdentity(opened) !== fileIdentity(before)) {
      throw new Error('The saved transcript changed while it was being read.');
    }
    const length = Math.min(opened.size, limits.maxBytes);
    let offset = 0;
    let lines = 0;
    let pending: Buffer[] = [];
    let pendingBytes = 0;
    let truncated = opened.size > length;
    while (offset < length && lines < limits.maxLines) {
      await yieldForAbort(signal);
      const bytes = Buffer.alloc(Math.min(CHUNK_BYTES, length - offset));
      const { bytesRead } = await handle.read(bytes, 0, bytes.length, offset);
      if (!bytesRead) throw new Error('The saved transcript changed while it was being read.');
      // A cancelled descriptor read must not start decoding or publish a prefix.
      signal?.throwIfAborted();
      let start = 0;
      let end = bytes.indexOf(10, start);
      while (end >= 0 && end < bytesRead && lines < limits.maxLines) {
        const part = bytes.subarray(start, end);
        const line = pendingBytes === 0 ? part : Buffer.concat([...pending, part], pendingBytes + part.length);
        accept(line.toString('utf8'));
        pending = []; pendingBytes = 0;
        lines++;
        start = end + 1;
        if (lines === limits.maxLines) {
          truncated = offset + start < opened.size;
          break;
        }
        if (lines % YIELD_LINES === 0) await yieldForAbort(signal);
        end = bytes.indexOf(10, start);
      }
      offset += bytesRead;
      if (lines < limits.maxLines && start < bytesRead) {
        const part = bytes.subarray(start, bytesRead);
        pending.push(part); pendingBytes += part.length;
      }
    }
    // Only a complete file can end in a line without a newline. A byte-limited
    // trailing fragment may split either JSON or a UTF-8 character and is omitted.
    if (lines < limits.maxLines && !truncated && pendingBytes > 0) {
      signal?.throwIfAborted();
      accept(Buffer.concat(pending, pendingBytes).toString('utf8'));
    }
    signal?.throwIfAborted();
    const after = await handle.stat();
    if (fileIdentity(after) !== fileIdentity(opened) || after.size !== opened.size
      || after.mtimeMs !== opened.mtimeMs || after.ctimeMs !== opened.ctimeMs) {
      throw new Error('The saved transcript changed while it was being read.');
    }
    return truncated;
  } finally {
    await handle.close();
  }
}

async function yieldForAbort(signal?: AbortSignal): Promise<void> {
  await new Promise<void>(resolve => setImmediate(resolve));
  signal?.throwIfAborted();
}
