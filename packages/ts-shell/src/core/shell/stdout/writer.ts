export type RawStdoutWrite = (text: string, callback: (error?: Error | null) => void) => boolean;

const MAX_PENDING_BYTES = 64 * 1024 * 1024;
const MAX_PENDING_FRAMES = 1024;
const MAX_TRANSIENT_RETRIES = 8;
const RETRY_DELAY_MS = 10;
const WRITE_DEADLINE_MS = 30_000;

interface Frame {
  readonly text: string;
  readonly bytes: number;
  readonly deadline: number;
}

interface Failure {
  readonly error: unknown;
}

type Completion = { readonly error: unknown } | { readonly completed: true };

function outputError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

function isTransient(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error
    && (error.code === 'EAGAIN' || error.code === 'ENOBUFS' || error.code === 'EWOULDBLOCK'));
}

/** A single captured device owner with finite admission and callback budgets. */
export class StdoutWriter {
  private readonly queue: Frame[] = [];
  private pendingBytes = 0;
  private pendingFrames = 0;
  private sequence = 0;
  private running: Promise<void> | undefined;
  private draining: Promise<void> | undefined;
  private failure: Failure | undefined;
  private wake: ((error: unknown) => void) | undefined;

  constructor(private readonly rawWrite: RawStdoutWrite) {}

  write(text: string): void {
    this.assertWritable();
    if (!text) return;
    const bytes = Buffer.byteLength(text, 'utf8');
    if (this.pendingBytes + bytes > MAX_PENDING_BYTES) {
      this.fail(outputError('STDOUT_BACKLOG_LIMIT', 'Stdout pending byte limit exceeded.'));
      this.assertWritable();
    }
    if (this.pendingFrames >= MAX_PENDING_FRAMES) {
      this.fail(outputError('STDOUT_BACKLOG_LIMIT', 'Stdout pending frame limit exceeded.'));
      this.assertWritable();
    }
    this.sequence++;
    this.admit(text, bytes);
  }

  flush(): Promise<void> {
    if (this.failure) return Promise.reject(this.failure.error);
    if (this.draining) return this.draining;
    const pending = this.drain();
    this.draining = pending;
    void pending.then(
      () => { if (this.draining === pending) this.draining = undefined; },
      () => { if (this.draining === pending) this.draining = undefined; },
    );
    return pending;
  }

  retire(): void {
    this.fail(outputError('STDOUT_RETIRED', 'Stdout writer was retired.'));
  }

  private admit(text: string, bytes: number): void {
    this.queue.push({ text, bytes, deadline: Date.now() + WRITE_DEADLINE_MS });
    this.pendingBytes += bytes;
    this.pendingFrames++;
    this.start();
  }

  private start(): void {
    if (this.running) return;
    this.running = Promise.resolve()
      .then(() => this.run())
      .catch(error => { this.fail(error); })
      .then(() => {
        this.running = undefined;
        if (this.queue.length && !this.failure) this.start();
      });
  }

  private async run(): Promise<void> {
    while (this.queue.length && !this.failure) {
      const frame = this.queue.shift()!;
      try { await this.writeFrame(frame); }
      catch (error) { this.fail(error); }
      finally {
        this.pendingBytes -= frame.bytes;
        this.pendingFrames--;
      }
    }
  }

  private async drain(): Promise<void> {
    const timer = setTimeout(() => this.fail(outputError('STDOUT_WRITE_TIMEOUT', 'Stdout drain deadline exceeded.')),
      WRITE_DEADLINE_MS);
    try {
      for (;;) {
        this.assertWritable();
        const observed = this.sequence;
        await this.running;
        this.assertWritable();
        if (this.sequence !== observed || this.running) continue;
        // The empty device barrier uses the same FIFO as every product frame.
        this.admit('', 0);
        await this.running;
        this.assertWritable();
        if (this.sequence === observed && !this.running) return;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  private async writeFrame(frame: Frame): Promise<void> {
    let retries = 0;
    for (;;) {
      this.assertWritable();
      if (Date.now() >= frame.deadline) throw outputError('STDOUT_WRITE_TIMEOUT', 'Stdout write deadline exceeded.');
      try { await this.attempt(frame); return; }
      catch (error) {
        this.assertWritable();
        if (!isTransient(error)) throw error;
        if (retries++ >= MAX_TRANSIENT_RETRIES) throw outputError('STDOUT_RETRY_LIMIT', 'Stdout transient retry limit exceeded.');
        await this.delay(frame.deadline);
      }
    }
  }

  private attempt(frame: Frame): Promise<void> {
    return new Promise((resolve, reject) => {
      let returned = false;
      let settled = false;
      let callbackResult: Completion | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = (result: Completion): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (this.wake === wake) this.wake = undefined;
        if ('error' in result) {
          if (!isTransient(result.error)) this.fail(result.error);
          reject(result.error);
        } else resolve();
      };
      const wake = (error: unknown): void => finish({ error });
      const complete = (error?: Error | null): void => {
        if (settled || callbackResult) return;
        callbackResult = error == null ? { completed: true } : { error };
        if (returned) finish(callbackResult);
      };
      this.wake = wake;
      timer = setTimeout(() => wake(outputError('STDOUT_WRITE_TIMEOUT', 'Stdout write deadline exceeded.')),
        Math.max(0, frame.deadline - Date.now()));
      try { this.rawWrite(frame.text, complete); }
      catch (error) {
        returned = true;
        finish({ error });
        return;
      }
      returned = true;
      if (callbackResult) finish(callbackResult);
      // A true return only accepts the write; its callback still owns delivery.
    });
  }

  private delay(deadline: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const wake = (error: unknown): void => {
        clearTimeout(timer);
        if (this.wake === wake) this.wake = undefined;
        reject(error);
      };
      const timer = setTimeout(() => {
        if (this.wake === wake) this.wake = undefined;
        if (Date.now() >= deadline) reject(outputError('STDOUT_WRITE_TIMEOUT', 'Stdout write deadline exceeded.'));
        else resolve();
      }, Math.max(0, Math.min(RETRY_DELAY_MS, deadline - Date.now())));
      this.wake = wake;
    });
  }

  private fail(error: unknown): void {
    if (this.failure) return;
    this.failure = { error };
    for (const frame of this.queue) this.pendingBytes -= frame.bytes;
    this.pendingFrames -= this.queue.length;
    this.queue.length = 0;
    this.wake?.(error);
  }

  private assertWritable(): void {
    if (this.failure) throw this.failure.error;
  }
}
