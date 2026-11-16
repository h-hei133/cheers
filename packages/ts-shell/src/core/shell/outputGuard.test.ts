import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  flushRawStdout,
  isStdoutTakenOver,
  restoreStdout,
  takeOverStdout,
  writeRawStdout,
} from './outputGuard.js';

afterEach(() => {
  restoreStdout();
  vi.useRealTimers();
});

type WriteCallback = (error?: Error | null) => void;

function device(write: (text: string, complete: WriteCallback) => boolean) {
  return {
    write(chunk: string | Uint8Array, encodingOrCallback?: unknown, callback?: unknown): boolean {
      const complete = typeof encodingOrCallback === 'function' ? encodingOrCallback : callback;
      return write(String(chunk), complete as WriteCallback);
    },
  };
}

async function settle(): Promise<void> {
  for (let index = 0; index < 12; index++) await Promise.resolve();
}

describe('outputGuard', () => {
  it('redirects stray stdout writes to stderr while keeping raw protocol frames on stdout', async () => {
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    const fakeStdout = {
      write: (chunk: string | Uint8Array, encOrCb?: unknown, cb?: unknown): boolean => {
        if (String(chunk)) stdoutChunks.push(String(chunk));
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
        const done = typeof encOrCb === 'function' ? encOrCb : cb;
        if (!String(chunk)) {
          (done as (() => void) | undefined)?.();
          return true;
        }
        attempts += 1;
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

describe('raw output settlement', () => {
  it.each([true, false])('waits for a callback when write accepts=%s', async accepted => {
    let complete: WriteCallback | undefined;
    const written: string[] = [];
    const stdout = device((text, callback) => {
      if (text === 'answer') { written.push(text); complete = callback; return accepted; }
      callback(); return true;
    });
    takeOverStdout(stdout as never, device((_text, callback) => { callback(); return true; }) as never);
    writeRawStdout('answer');
    let flushed = false;
    const pending = flushRawStdout().then(() => { flushed = true; });
    try {
      await settle();
      expect(flushed).toBe(false);
      complete?.();
      await pending;
      expect(written).toEqual(['answer']);
    } finally {
      complete?.();
      await pending.catch(() => {});
    }
  });

  it('retains an asynchronous callback error after write returned true', async () => {
    const failure = Object.assign(new Error('closed output'), { code: 'EPIPE' });
    let complete: WriteCallback | undefined;
    const stdout = device((_text, callback) => { complete = callback; return true; });
    takeOverStdout(stdout as never, device((_text, callback) => { callback(); return true; }) as never);
    writeRawStdout('answer');
    const pending = flushRawStdout();
    void pending.catch(() => {});
    try {
      await settle();
      complete?.(failure);
      await expect(pending).rejects.toBe(failure);
      await expect(flushRawStdout()).rejects.toBe(failure);
    } finally {
      complete?.();
      await pending.catch(() => {});
    }
  });

  it('ignores a duplicate callback after the first completion', async () => {
    let calls = 0;
    const stdout = device((_text, callback) => {
      calls++;
      callback();
      callback(new Error('duplicate callback'));
      return true;
    });
    takeOverStdout(stdout as never, device((_text, callback) => { callback(); return true; }) as never);
    writeRawStdout('answer');
    await expect(flushRawStdout()).resolves.toBeUndefined();
    expect(calls).toBe(2); // The frame and the final device barrier.
  });

  it('preserves a synchronous throw, including one after a callback', async () => {
    const failure = new Error('write threw');
    let calls = 0;
    const stdout = device((_text, callback) => { calls++; callback(); throw failure; });
    takeOverStdout(stdout as never, device((_text, callback) => { callback(); return true; }) as never);
    writeRawStdout('answer');
    await expect(flushRawStdout()).rejects.toBe(failure);
    expect(() => writeRawStdout('later')).toThrow(failure);
    await flushRawStdout().catch(() => {});
    expect(calls).toBe(1);
  });

  it('preserves the first failure and refuses queued or subsequent writes', async () => {
    const first = new Error('first write failure');
    const second = new Error('second write failure');
    const attempted: string[] = [];
    const stdout = device((text, callback) => {
      attempted.push(text);
      callback(text === 'first' ? first : second);
      return false;
    });
    takeOverStdout(stdout as never, device((_text, callback) => { callback(); return true; }) as never);
    writeRawStdout('first');
    writeRawStdout('second');
    try {
      await expect(flushRawStdout()).rejects.toBe(first);
      expect(attempted).toEqual(['first']);
      await expect(flushRawStdout()).rejects.toBe(first);
      expect(() => writeRawStdout('third')).toThrow(first);
    } finally {
      await flushRawStdout().catch(() => {});
    }
  });

  it('retains a thrown undefined as the first terminal failure', async () => {
    const stdout = device(() => { throw undefined; });
    takeOverStdout(stdout as never, device((_text, callback) => { callback(); return true; }) as never);
    writeRawStdout('answer');
    let rejected = false;
    await flushRawStdout().then(() => {}, error => {
      rejected = true;
      expect(error).toBeUndefined();
    });
    expect(rejected).toBe(true);
    let refused = false;
    try { writeRawStdout('later'); }
    catch (error) { refused = true; expect(error).toBeUndefined(); }
    expect(refused).toBe(true);
  });

  it.each(['EAGAIN', 'ENOBUFS', 'EWOULDBLOCK'])('bounds persistent %s retries', async code => {
    vi.useFakeTimers();
    let failing = true;
    let attempts = 0;
    const stdout = device((_text, callback) => {
      attempts++;
      callback(failing ? Object.assign(new Error('temporarily unavailable'), { code }) : undefined);
      return !failing;
    });
    takeOverStdout(stdout as never, device((_text, callback) => { callback(); return true; }) as never);
    writeRawStdout('answer');
    let observed: unknown;
    const pending = flushRawStdout().catch(error => { observed = error; });
    try {
      await vi.advanceTimersByTimeAsync(100);
      expect(observed).toMatchObject({ code: 'STDOUT_RETRY_LIMIT' });
      expect(attempts).toBeLessThanOrEqual(9);
    } finally {
      failing = false;
      await vi.advanceTimersByTimeAsync(20);
      await pending;
    }
  });

  it('settles a callback that never arrives within a finite deadline', async () => {
    vi.useFakeTimers();
    let complete: WriteCallback | undefined;
    const stdout = device((_text, callback) => { complete = callback; return false; });
    takeOverStdout(stdout as never, device((_text, callback) => { callback(); return true; }) as never);
    writeRawStdout('answer');
    let observed: unknown;
    const pending = flushRawStdout().catch(error => { observed = error; });
    try {
      await vi.advanceTimersByTimeAsync(31_000);
      expect(observed).toMatchObject({ code: 'STDOUT_WRITE_TIMEOUT' });
    } finally {
      complete?.();
      await vi.advanceTimersByTimeAsync(20);
      await pending;
    }
  });

  it('counts queue residence against the same write deadline', async () => {
    vi.useFakeTimers();
    let fast = false;
    const stdout = device((_text, callback) => {
      if (fast) callback(); else setTimeout(callback, 12_000);
      return fast;
    });
    takeOverStdout(stdout as never, device((_text, callback) => { callback(); return true; }) as never);
    writeRawStdout('one'); writeRawStdout('two'); writeRawStdout('three');
    let observed: unknown;
    const pending = flushRawStdout().catch(error => { observed = error; });
    try {
      await vi.advanceTimersByTimeAsync(31_000);
      expect(observed).toMatchObject({ code: 'STDOUT_WRITE_TIMEOUT' });
    } finally {
      fast = true;
      await vi.advanceTimersByTimeAsync(24_000);
      await pending;
    }
  });

  it('bounds UTF-8 bytes while keeping a held frame in the pending account', async () => {
    let complete: WriteCallback | undefined;
    let first = true;
    const stdout = device((_text, callback) => {
      if (first) { first = false; complete = callback; return false; }
      callback(); return true;
    });
    takeOverStdout(stdout as never, device((_text, callback) => { callback(); return true; }) as never);
    const chunk = 'é'.repeat(256 * 1024); // 512 KiB UTF-8; reused so the fixture stays small.
    writeRawStdout(chunk);
    await settle();
    for (let index = 1; index < 128; index++) writeRawStdout(chunk);
    try {
      expect(() => writeRawStdout(chunk)).toThrow(/pending byte limit/i);
      await expect(flushRawStdout()).rejects.toMatchObject({ code: 'STDOUT_BACKLOG_LIMIT' });
    } finally {
      complete?.();
      await flushRawStdout().catch(() => {});
    }
  });

  it('bounds pending frame count independently of byte size', async () => {
    let complete: WriteCallback | undefined;
    let first = true;
    const stdout = device((_text, callback) => {
      if (first) { first = false; complete = callback; return false; }
      callback(); return true;
    });
    takeOverStdout(stdout as never, device((_text, callback) => { callback(); return true; }) as never);
    writeRawStdout('x');
    await settle();
    for (let index = 1; index < 1024; index++) writeRawStdout('x');
    try {
      expect(() => writeRawStdout('x')).toThrow(/pending frame limit/i);
      await expect(flushRawStdout()).rejects.toMatchObject({ code: 'STDOUT_BACKLOG_LIMIT' });
    } finally {
      complete?.();
      await flushRawStdout().catch(() => {});
    }
  });

  it('does not enqueue arbitrary numbers of empty frames', async () => {
    let calls = 0;
    const stdout = device((_text, callback) => { calls++; callback(); return true; });
    takeOverStdout(stdout as never, device((_text, callback) => { callback(); return true; }) as never);
    for (let index = 0; index < 5000; index++) writeRawStdout('');
    await flushRawStdout();
    expect(calls).toBe(1);
  });

  it('drains writes admitted while a flush is already waiting', async () => {
    vi.useFakeTimers();
    let first: WriteCallback | undefined;
    let second: WriteCallback | undefined;
    const stdout = device((text, callback) => {
      if (text === 'first') { first = callback; return false; }
      if (text === 'second') { second = callback; return false; }
      callback(); return true;
    });
    takeOverStdout(stdout as never, device((_text, callback) => { callback(); return true; }) as never);
    writeRawStdout('first');
    let flushed = false;
    const pending = flushRawStdout().then(() => { flushed = true; });
    try {
      await settle();
      writeRawStdout('second');
      first?.();
      await vi.advanceTimersByTimeAsync(20);
      expect(second).toBeDefined();
      expect(flushed).toBe(false);
      second?.();
      await vi.advanceTimersByTimeAsync(20);
      await pending;
    } finally {
      first?.(); second?.();
      await vi.advanceTimersByTimeAsync(20);
      await pending.catch(() => {});
      await flushRawStdout().catch(() => {});
    }
  });

  it('isolates a successor writer from retired queues and late callbacks', async () => {
    vi.useFakeTimers();
    let oldComplete: WriteCallback | undefined;
    let newComplete: WriteCallback | undefined;
    const oldDevice = device((_text, callback) => { oldComplete = callback; return false; });
    const newWritten: string[] = [];
    const newDevice = device((text, callback) => {
      if (text) { newWritten.push(text); newComplete = callback; return false; }
      callback(); return true;
    });
    const stderr = device((_text, callback) => { callback(); return true; });
    takeOverStdout(oldDevice as never, stderr as never);
    writeRawStdout('old');
    let oldError: unknown;
    const oldPending = flushRawStdout().catch(error => { oldError = error; });
    await settle();
    restoreStdout();
    takeOverStdout(newDevice as never, stderr as never);
    writeRawStdout('new');
    let newFlushed = false;
    const newPending = flushRawStdout().then(() => { newFlushed = true; });
    try {
      await settle();
      expect(newWritten).toEqual(['new']);
      expect(oldError).toMatchObject({ code: 'STDOUT_RETIRED' });
      oldComplete?.(); oldComplete?.(new Error('late old callback'));
      await settle();
      expect(newFlushed).toBe(false);
      newComplete?.();
      await vi.advanceTimersByTimeAsync(20);
      await newPending;
    } finally {
      oldComplete?.();
      await vi.advanceTimersByTimeAsync(20);
      newComplete?.();
      await vi.advanceTimersByTimeAsync(20);
      await Promise.allSettled([oldPending, newPending]);
    }
  });

  it('keeps a captured guard from restoring or writing through its successor', async () => {
    const stderr = device((_text, callback) => { callback(); return true; });
    const oldDevice = device((_text, callback) => { callback(); return true; });
    const old = takeOverStdout(oldDevice as never, stderr as never) as unknown as {
      write(text: string): void; flush(): Promise<void>; restore(): void;
    };
    restoreStdout();
    const written: string[] = [];
    const successor = device((text, callback) => { if (text) written.push(text); callback(); return true; });
    takeOverStdout(successor as never, stderr as never);
    old.restore();
    expect(isStdoutTakenOver()).toBe(true);
    expect(() => old.write('old')).toThrow(/retired/i);
    await expect(old.flush()).rejects.toMatchObject({ code: 'STDOUT_RETIRED' });
    writeRawStdout('new');
    await flushRawStdout();
    expect(written).toEqual(['new']);
  });

  it('serializes the device barrier with frames admitted during it', async () => {
    let barrier: WriteCallback | undefined;
    let holdBarrier = true;
    const calls: string[] = [];
    const stdout = device((text, callback) => {
      calls.push(text);
      if (!text && holdBarrier) { barrier = callback; return false; }
      callback(); return true;
    });
    takeOverStdout(stdout as never, device((_text, callback) => { callback(); return true; }) as never);
    writeRawStdout('first');
    let flushed = false;
    const pending = flushRawStdout().then(() => { flushed = true; });
    try {
      await settle();
      expect(barrier).toBeDefined();
      writeRawStdout('second');
      await settle();
      expect(calls).toEqual(['first', '']);
      expect(flushed).toBe(false);
      holdBarrier = false;
      barrier?.();
      await pending;
      expect(calls).toEqual(['first', '', 'second', '']);
    } finally {
      holdBarrier = false;
      barrier?.();
      await pending.catch(() => {});
    }
  });

  it('shares one pending device barrier between concurrent flush callers', async () => {
    let complete: WriteCallback | undefined;
    let calls = 0;
    const stdout = device((_text, callback) => { calls++; complete = callback; return false; });
    takeOverStdout(stdout as never, device((_text, callback) => { callback(); return true; }) as never);
    const pending = Array.from({ length: 2000 }, () => flushRawStdout());
    try {
      await settle();
      expect(calls).toBe(1);
      complete?.();
      await Promise.all(pending);
      expect(calls).toBe(1);
    } finally {
      complete?.();
      await Promise.allSettled(pending);
    }
  });

  it('preserves redirected bytes, encoding and callback overloads', () => {
    const stdout = { write: vi.fn(() => true) };
    const stderr = { write: vi.fn((_chunk: unknown, encodingOrCallback?: unknown, callback?: unknown) => {
      const complete = typeof encodingOrCallback === 'function' ? encodingOrCallback : callback;
      (complete as WriteCallback | undefined)?.();
      return false;
    }) };
    takeOverStdout(stdout as never, stderr as never);
    const bytes = Buffer.from('é');
    const complete = vi.fn();
    expect((stdout.write as (...args: unknown[]) => boolean)(bytes, 'utf8', complete)).toBe(false);
    expect(stderr.write).toHaveBeenCalledWith(bytes, 'utf8', complete);
    expect(complete).toHaveBeenCalledOnce();
    const overloaded = vi.fn();
    (stdout.write as (...args: unknown[]) => boolean)('noise', overloaded);
    expect(stderr.write).toHaveBeenLastCalledWith('noise', overloaded);
    expect(overloaded).toHaveBeenCalledOnce();
  });
});
