import { StdoutWriter, type RawStdoutWrite } from './stdout/writer.js';

type WriteFn = (
  chunk: string | Uint8Array,
  encodingOrCallback?: BufferEncoding | ((error?: Error | null) => void),
  callback?: (error?: Error | null) => void,
) => boolean;

export interface StdoutGuard {
  write(text: string): void;
  flush(): Promise<void>;
  restore(): void;
}

interface StdoutTakeoverState {
  readonly stdout: { write: WriteFn };
  readonly originalStdoutWrite: WriteFn;
  readonly guard: StdoutGuard;
}

let stdoutTakeoverState: StdoutTakeoverState | undefined;
let unguardedWriter: StdoutWriter | undefined;

/** Redirect incidental writes while retaining one captured product-output owner. */
export function takeOverStdout(
  stdout: { write: WriteFn } = process.stdout as unknown as { write: WriteFn },
  stderr: { write: WriteFn } = process.stderr as unknown as { write: WriteFn },
): StdoutGuard {
  if (stdoutTakeoverState) return stdoutTakeoverState.guard;
  unguardedWriter?.retire();
  unguardedWriter = undefined;
  const originalStdoutWrite = stdout.write;
  const writer = new StdoutWriter(originalStdoutWrite.bind(stdout) as RawStdoutWrite);
  const rawStderrWrite = stderr.write.bind(stderr);
  const state: StdoutTakeoverState = {
    stdout,
    originalStdoutWrite,
    guard: {
      write: text => writer.write(text),
      flush: () => writer.flush(),
      restore: () => {
        if (stdoutTakeoverState !== state) return;
        state.stdout.write = state.originalStdoutWrite;
        stdoutTakeoverState = undefined;
        writer.retire();
      },
    },
  };
  stdout.write = (chunk, encodingOrCallback, callback) => typeof encodingOrCallback === 'function'
    ? rawStderrWrite(chunk, encodingOrCallback)
    : rawStderrWrite(chunk, encodingOrCallback, callback);
  stdoutTakeoverState = state;
  return state.guard;
}

export function restoreStdout(): void {
  stdoutTakeoverState?.guard.restore();
}

export function isStdoutTakenOver(): boolean {
  return stdoutTakeoverState !== undefined;
}

function rawWriter(): StdoutWriter {
  return unguardedWriter ??= new StdoutWriter(process.stdout.write.bind(process.stdout) as RawStdoutWrite);
}

export function writeRawStdout(text: string): void {
  if (stdoutTakeoverState) stdoutTakeoverState.guard.write(text);
  else rawWriter().write(text);
}

export function flushRawStdout(): Promise<void> {
  return stdoutTakeoverState ? stdoutTakeoverState.guard.flush() : rawWriter().flush();
}
