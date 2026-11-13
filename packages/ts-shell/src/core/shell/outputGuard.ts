type WriteFn = (
  chunk: string | Uint8Array,
  encodingOrCallback?: BufferEncoding | ((error?: Error | null) => void),
  callback?: (error?: Error | null) => void,
) => boolean;

interface StdoutTakeoverState {
  readonly stdout: { write: WriteFn };
  readonly stderr: { write: WriteFn };
  readonly rawStdoutWrite: (chunk: string, callback?: (error?: Error | null) => void) => boolean;
  readonly rawStderrWrite: (chunk: string, callback?: (error?: Error | null) => void) => boolean;
  readonly originalStdoutWrite: WriteFn;
}

const RAW_STDOUT_RETRY_DELAY_MS = 10;

let stdoutTakeoverState: StdoutTakeoverState | undefined;
let rawStdoutWriteTail: Promise<void> = Promise.resolve();

function isRetryableWriteError(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('code' in error)) return false;
  return error.code === 'EAGAIN' || error.code === 'ENOBUFS';
}

function getRawStdoutWrite(): (chunk: string, callback?: (error?: Error | null) => void) => boolean {
  if (stdoutTakeoverState) return stdoutTakeoverState.rawStdoutWrite;
  return process.stdout.write.bind(process.stdout) as (chunk: string, callback?: (error?: Error | null) => void) => boolean;
}

async function writeRawStdoutChunk(text: string): Promise<void> {
  for (;;) {
    const rawWrite = getRawStdoutWrite();
    let syncError: unknown;
    let callbackError: unknown;
    let drained = false;

    const settled = new Promise<void>((resolve) => {
      let resolved = false;
      const done = (): void => {
        if (resolved) return;
        resolved = true;
        resolve();
      };
      try {
        drained = rawWrite(text, (error?: Error | null) => {
          callbackError = error;
          done();
        });
        if (drained) done();
      } catch (error) {
        syncError = error;
        done();
      }
    });

    await settled;
    const writeError = syncError ?? callbackError;
    if (writeError) {
      if (isRetryableWriteError(writeError)) {
        await new Promise((resolve) => setTimeout(resolve, RAW_STDOUT_RETRY_DELAY_MS));
        continue;
      }
      throw writeError;
    }
    if (!drained) {
      await new Promise((resolve) => setTimeout(resolve, RAW_STDOUT_RETRY_DELAY_MS));
    }
    return;
  }
}

/**
 * Redirect stray `stdout.write` calls to `stderr` while keeping an unguarded
 * raw writer for protocol frames (such as `--json` event lines).
 */
export function takeOverStdout(
  stdout: { write: WriteFn } = process.stdout as unknown as { write: WriteFn },
  stderr: { write: WriteFn } = process.stderr as unknown as { write: WriteFn },
): void {
  if (stdoutTakeoverState) return;
  const originalStdoutWrite = stdout.write;
  const rawStdoutWrite = stdout.write.bind(stdout) as (chunk: string, callback?: (error?: Error | null) => void) => boolean;
  const rawStderrWrite = stderr.write.bind(stderr) as (chunk: string, callback?: (error?: Error | null) => void) => boolean;

  stdout.write = ((
    chunk: string | Uint8Array,
    encodingOrCallback?: BufferEncoding | ((error?: Error | null) => void),
    callback?: (error?: Error | null) => void,
  ): boolean => {
    const fn = rawStderrWrite as unknown as WriteFn;
    return typeof encodingOrCallback === 'function'
      ? fn(chunk, encodingOrCallback)
      : fn(chunk, encodingOrCallback, callback);
  }) as WriteFn;

  stdoutTakeoverState = { stdout, stderr, rawStdoutWrite, rawStderrWrite, originalStdoutWrite };
}

export function restoreStdout(): void {
  if (!stdoutTakeoverState) return;
  stdoutTakeoverState.stdout.write = stdoutTakeoverState.originalStdoutWrite;
  stdoutTakeoverState = undefined;
}

export function isStdoutTakenOver(): boolean {
  return stdoutTakeoverState !== undefined;
}

let lastWriteError: unknown;

export function writeRawStdout(text: string): void {
  rawStdoutWriteTail = rawStdoutWriteTail
    .catch(() => {})
    .then(() => writeRawStdoutChunk(text))
    .catch((error: unknown) => {
      lastWriteError = error;
    });
}

export async function flushRawStdout(): Promise<void> {
  await rawStdoutWriteTail;
  if (lastWriteError !== undefined) {
    const error = lastWriteError;
    lastWriteError = undefined;
    throw error;
  }
}
