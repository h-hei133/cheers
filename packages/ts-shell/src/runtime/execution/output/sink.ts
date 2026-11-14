import { createWriteStream, mkdirSync, type WriteStream } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

/** A producer-owned spill; closing seals it while disposal releases its resources. */
export interface OutputSpill {
  write(bytes: Uint8Array): Promise<void>;
  close(): Promise<void>;
  read(): AsyncIterable<Uint8Array>;
  dispose(): Promise<void>;
}

export interface OutputSink {
  append(text: string): Promise<void> | void;
  readonly tail: string;
  readonly truncated: boolean;
  readonly spillPath: string | undefined;
  close(): Promise<void>;
  abort?(): void;
}

export interface OutputSinkOptions {
  readonly limitBytes: number;
  readonly spillDirectory?: string;
  readonly label: string;
  /** A verified storage owner may supply the spill without exposing a pathname. */
  readonly openSpill?: () => Promise<OutputSpill>;
}

export interface OutputSinkSnapshot {
  readonly tail: string;
  readonly totalBytes: number;
  readonly totalLines: number;
  readonly totalNewlines: number;
  readonly tailStartsAtLineBoundary: boolean;
  readonly truncated: boolean;
}

interface CapturedOutputSink extends OutputSink {
  readonly complete: boolean;
  snapshot(): OutputSinkSnapshot;
  source(): AsyncIterable<Uint8Array>;
  dispose(): Promise<void>;
}

export function createOutputSink(options: OutputSinkOptions & { readonly capture: true }): CapturedOutputSink;
export function createOutputSink(options: OutputSinkOptions): OutputSink;
/** One bounded tail; overflow preserves its original prefix before dropping memory. */
export function createOutputSink(options: OutputSinkOptions): CapturedOutputSink {
  if (!Number.isSafeInteger(options.limitBytes) || options.limitBytes < 0) {
    throw new Error('Output limit must be a non-negative safe integer');
  }
  let tail = '';
  let truncated = false;
  let totalBytes = 0;
  let totalNewlines = 0;
  let openLine = false;
  let tailStartsAtLineBoundary = true;
  let spillPath: string | undefined;
  let stream: WriteStream | undefined;
  let staging: Promise<OutputSpill> | undefined;
  let pendingWrite: Promise<void> | undefined;
  let closing: Promise<void> | undefined;
  let disposing: Promise<void> | undefined;
  let spillAttempted = false;
  let closed = false;
  let abandoned = false;
  let complete = true;

  const openSpill = (): void => {
    if (spillAttempted) return;
    spillAttempted = true;
    if (options.openSpill) {
      try { staging = options.openSpill(); }
      catch { complete = false; }
      return;
    }
    if (!options.spillDirectory) return;
    try {
      mkdirSync(options.spillDirectory, { recursive: true });
      const candidate = path.join(options.spillDirectory, `${options.label}-${randomUUID()}.log`);
      const opened = createWriteStream(candidate, { flags: 'wx' });
      stream = opened;
      opened.on('error', () => { spillPath = undefined; complete = false; });
      opened.once('open', () => { if (!opened.destroyed) spillPath = candidate; });
    } catch { stream = undefined; spillPath = undefined; complete = false; }
  };

  return {
    abort(): void {
      closed = true;
      abandoned = true;
      complete = false;
      spillPath = undefined;
      stream?.destroy();
      // An opening descriptor may settle after the close deadline. Its original
      // owner must still release it, without reopening any mutable pathname.
      if (staging) {
        disposing ??= disposeStaging(staging, pendingWrite);
        void disposing.catch(() => {});
      }
    },
    append(text: string): Promise<void> | void {
      if (closed) throw new Error('Cannot append to closed output');
      if (!text) return;
      if (pendingWrite) { complete = false; throw new Error('Command output producer ignored backpressure.'); }
      totalBytes += Buffer.byteLength(text, 'utf8');
      for (let index = text.indexOf('\n'); index !== -1; index = text.indexOf('\n', index + 1)) totalNewlines++;
      openLine = !text.endsWith('\n');
      const combined = tail + text;
      const bytes = Buffer.from(combined);
      const firstOverflow = !truncated && bytes.length > options.limitBytes;
      if (firstOverflow) openSpill();
      truncated ||= bytes.length > options.limitBytes;
      let start = Math.max(0, bytes.length - options.limitBytes);
      while (start < bytes.length && (bytes[start]! & 0xc0) === 0x80) start++;
      if (start > 0) tailStartsAtLineBoundary = bytes[start - 1] === 0x0a;
      tail = bytes.subarray(start).toString('utf8');

      if (staging) {
        const content = firstOverflow ? bytes : Buffer.from(text, 'utf8');
        const pending = staging.then(async stage => {
          if (abandoned) return;
          await stage.write(content);
        }).catch(() => { complete = false; }).finally(() => { pendingWrite = undefined; });
        pendingWrite = pending;
        return pending;
      }
      const active = stream;
      if (!active || active.destroyed) return;
      try {
        if (!active.write(firstOverflow ? combined : text)) return waitForDrain(active);
      } catch { spillPath = undefined; complete = false; active.destroy(); }
    },
    get tail(): string { return tail; },
    get truncated(): boolean { return truncated; },
    get spillPath(): string | undefined { return spillPath; },
    get complete(): boolean { return complete && !abandoned && (!truncated || !!staging); },
    snapshot(): OutputSinkSnapshot {
      return { tail, totalBytes, totalLines: totalNewlines + (openLine ? 1 : 0), totalNewlines, tailStartsAtLineBoundary, truncated };
    },
    async *source(): AsyncIterable<Uint8Array> {
      if (!closed || abandoned || !complete) throw new Error('Complete command output is unavailable.');
      if (staging) { yield* (await staging).read(); return; }
      if (truncated) throw new Error('Complete command output is unavailable.');
      if (tail) yield Buffer.from(tail, 'utf8');
    },
    close(): Promise<void> {
      closed = true;
      closing ??= staging ? Promise.resolve(pendingWrite).then(() => staging!).then(stage => stage.close()).catch(error => { complete = false; throw error; })
        : new Promise<void>(resolve => {
          const active = stream;
          if (!active || active.closed) { resolve(); return; }
          active.once('close', resolve);
          active.end();
        });
      return closing;
    },
    dispose(): Promise<void> {
      disposing ??= staging ? disposeStaging(staging, pendingWrite) : Promise.resolve();
      return disposing.catch(error => { disposing = undefined; throw error; });
    },
  };
}

/** Failed creation may already have released its storage; otherwise retry only its retained capability. */
async function disposeStaging(opening: Promise<OutputSpill>, pending?: Promise<void>): Promise<void> {
  await pending;
  let stage: OutputSpill;
  try { stage = await opening; }
  catch (error) {
    const failure = error as { cleanup?: unknown; cleanupResource?: { close(): Promise<void> } } | null;
    if (failure?.cleanup === 'complete') return;
    if (failure?.cleanupResource) { await failure.cleanupResource.close(); return; }
    throw error;
  }
  await stage.dispose();
}

/** Drain, failure and closure all release a paused producer. */
function waitForDrain(stream: WriteStream): Promise<void> {
  return new Promise(resolve => {
    const done = (): void => {
      stream.off('drain', done); stream.off('error', done); stream.off('close', done); resolve();
    };
    stream.once('drain', done); stream.once('error', done); stream.once('close', done);
  });
}
