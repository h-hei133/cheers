import { afterEach, describe, expect, it } from 'vitest';
import {
  flushRawStdout,
  isStdoutTakenOver,
  restoreStdout,
  takeOverStdout,
  writeRawStdout,
} from './outputGuard.js';

afterEach(() => {
  restoreStdout();
});

describe('outputGuard', () => {
  it('redirects stray stdout writes to stderr while keeping raw protocol frames on stdout', async () => {
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    const fakeStdout = {
      write: (chunk: string | Uint8Array, encOrCb?: unknown, cb?: unknown): boolean => {
        stdoutChunks.push(String(chunk));
        if (typeof encOrCb === 'function') (encOrCb as () => void)();
        else if (typeof cb === 'function') (cb as () => void)();
        return true;
      },
    };
    const fakeStderr = {
      write: (chunk: string | Uint8Array, encOrCb?: unknown, cb?: unknown): boolean => {
        stderrChunks.push(String(chunk));
        if (typeof encOrCb === 'function') (encOrCb as () => void)();
        else if (typeof cb === 'function') (cb as () => void)();
        return true;
      },
    };

    takeOverStdout(fakeStdout as never, fakeStderr as never);
    expect(isStdoutTakenOver()).toBe(true);

    fakeStdout.write('stray log\n');
    writeRawStdout('{"type":"turn.completed"}\n');
    await flushRawStdout();

    expect(stderrChunks).toEqual(['stray log\n']);
    expect(stdoutChunks).toEqual(['{"type":"turn.completed"}\n']);

    restoreStdout();
    expect(isStdoutTakenOver()).toBe(false);
    fakeStdout.write('normal\n');
    expect(stdoutChunks).toEqual(['{"type":"turn.completed"}\n', 'normal\n']);
  });

  it('retries EAGAIN errors before resolving flushRawStdout', async () => {
    let attempts = 0;
    const stdoutChunks: string[] = [];
    const fakeStdout = {
      write: (chunk: string | Uint8Array, encOrCb?: unknown, cb?: unknown): boolean => {
        attempts += 1;
        const done = typeof encOrCb === 'function' ? encOrCb : cb;
        if (attempts === 1) {
          const err = Object.assign(new Error('Resource temporarily unavailable'), { code: 'EAGAIN' });
          (done as ((error?: Error | null) => void) | undefined)?.(err);
          return false;
        }
        stdoutChunks.push(String(chunk));
        (done as ((error?: Error | null) => void) | undefined)?.(null);
        return true;
      },
    };
    const fakeStderr = { write: () => true };

    takeOverStdout(fakeStdout as never, fakeStderr as never);
    writeRawStdout('{"ok":true}\n');
    await flushRawStdout();

    expect(attempts).toBe(2);
    expect(stdoutChunks).toEqual(['{"ok":true}\n']);
  });
});
