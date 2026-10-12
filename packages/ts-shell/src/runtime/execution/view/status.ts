import type { FileHandle } from 'node:fs/promises';

export class NativeReadLaunchError extends Error {
  constructor() { super('Native enumeration did not confirm a complete child exit. No complete native answer is available.'); }
}

/** A launcher exit is not a native answer until its child completion is proven. */
export async function verifyNativeExit(handle: FileHandle, expected: number | null): Promise<void> {
  const size = (await handle.stat()).size;
  if (!size || size > 4096) throw new NativeReadLaunchError();
  const bytes = Buffer.alloc(size);
  const { bytesRead } = await handle.read(bytes, 0, size, 0);
  if (bytesRead !== size || bytes[size - 1] !== 10) throw new NativeReadLaunchError();
  let started = false;
  let completed = false;
  try {
    for (const line of bytes.toString('utf8').trimEnd().split('\n')) {
      const record: unknown = JSON.parse(line);
      if (!record || typeof record !== 'object' || Array.isArray(record)) throw new NativeReadLaunchError();
      if ('child-pid' in record) {
        if (started || completed || !Number.isSafeInteger(record['child-pid']) || Number(record['child-pid']) <= 0) throw new NativeReadLaunchError();
        started = true;
      }
      if ('exit-code' in record) {
        if (!started || completed || !Number.isSafeInteger(record['exit-code']) || record['exit-code'] !== expected) throw new NativeReadLaunchError();
        completed = true;
      }
    }
  } catch { throw new NativeReadLaunchError(); }
  if (!started || !completed) throw new NativeReadLaunchError();
}
