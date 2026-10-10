import { createWriteStream, mkdirSync, type WriteStream } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

/**
 * What a command printed, kept in memory up to a limit and on disk past it.
 *
 * A command can print without limit, so holding all of it is a memory leak with a
 * friendly name. Dropping the excess is not the answer either: the beginning of a
 * long output is often where the reason for it is, and a reader handed only the
 * end cannot tell a clean run from a buried failure. So the end stays in memory —
 * a failure says why at the end — and everything is written to a file the reader
 * can open when the tail is not enough.
 *
 * The file is created only once the limit is passed, so a command that prints a
 * few lines costs nothing but the string it printed.
 */

/** A command's bounded tail and optional complete spill file. */
export interface OutputSink {
  /** Add decoded output. Pause the producer until a returned promise settles. */
  append(text: string): Promise<void> | void;
  /** The end of the output, which is what a reader is shown. */
  readonly tail: string;
  /** Whether anything was kept out of memory. */
  readonly truncated: boolean;
  /** Where the whole output went, once it outgrew the limit. */
  readonly spillPath: string | undefined;
  /** Flush and release the file. Safe to call more than once. */
  close(): Promise<void>;
  /** Abandon an unverified artifact and release only this sink's live descriptor. */
  abort?(): void;
}

export interface OutputSinkOptions {
  /** How much is kept in memory. Past this, the whole output goes to a file. */
  readonly limitBytes: number;
  /**
   * Where to put the file, when the output outgrows the limit.
   *
   * Absent means memory only: the tail is still kept and the reader is still told
   * what was dropped, but there is nowhere to recover it from. A caller with no
   * session directory to write into gets that rather than a guess at one.
   */
  readonly spillDirectory?: string;
  /** Names the file, so a directory of them can be told apart. */
  readonly label: string;
}

export function createOutputSink(options: OutputSinkOptions): OutputSink {
  if (!Number.isSafeInteger(options.limitBytes) || options.limitBytes < 0) {
    throw new Error("Output limit must be a non-negative safe integer");
  }
  let tail = "";
  let truncated = false;
  let spillPath: string | undefined;
  let stream: WriteStream | undefined;
  let closing: Promise<void> | undefined;
  let spillAttempted = false;
  let closed = false;

  const openSpill = (): void => {
    if (spillAttempted || !options.spillDirectory) return;
    spillAttempted = true;
    try {
      mkdirSync(options.spillDirectory, { recursive: true });
      const candidate = path.join(options.spillDirectory, `${options.label}-${randomUUID()}.log`);
      const opened = createWriteStream(candidate, { flags: "wx" });
      stream = opened;
      // A failed spill can never again promise the complete prefix.
      opened.on("error", () => { spillPath = undefined; });
      opened.once("open", () => { if (!opened.destroyed) spillPath = candidate; });
    } catch {
      stream = undefined;
      spillPath = undefined;
    }
  };

  return {
    abort(): void { closed = true; spillPath = undefined; stream?.destroy(); },
    append(text: string): Promise<void> | void {
      if (closed) throw new Error("Cannot append to closed output");
      if (!text) return;
      const combined = tail + text;
      const bytes = Buffer.from(combined);
      const firstOverflow = !truncated && bytes.length > options.limitBytes;
      if (firstOverflow) openSpill();
      truncated ||= bytes.length > options.limitBytes;
      let start = Math.max(0, bytes.length - options.limitBytes);
      // Never start the tail inside a multi-byte character.
      while (start < bytes.length && (bytes[start]! & 0xc0) === 0x80) start++;
      tail = bytes.subarray(start).toString("utf8");

      const active = stream;
      if (!active || active.destroyed) return;
      try {
        // Before overflow, tail held the entire prefix; no second buffer is needed.
        if (!active.write(firstOverflow ? combined : text)) return waitForDrain(active);
      } catch {
        spillPath = undefined;
        active.destroy();
      }
    },

    get tail(): string { return tail; },
    get truncated(): boolean { return truncated; },
    get spillPath(): string | undefined { return spillPath; },

    close(): Promise<void> {
      closed = true;
      closing ??= new Promise<void>((resolve) => {
        const active = stream;
        if (!active || active.closed) { resolve(); return; }
        // Close follows finish/error and confirms that no more file work remains.
        active.once("close", resolve);
        active.end();
      });
      return closing;
    },
  };
}

/** Drain, failure and closure all release a paused producer. */
function waitForDrain(stream: WriteStream): Promise<void> {
  return new Promise(resolve => {
    const done = (): void => {
      stream.off("drain", done);
      stream.off("error", done);
      stream.off("close", done);
      resolve();
    };
    stream.once("drain", done);
    stream.once("error", done);
    stream.once("close", done);
  });
}
