import { createWriteStream, mkdirSync, type WriteStream } from "node:fs";
import path from "node:path";

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

/** A command's output, bounded in memory and complete on disk. */
export interface OutputSink {
  /** Add what the command just printed. */
  append(text: string): void;
  /** The end of the output, which is what a reader is shown. */
  readonly tail: string;
  /** Whether anything was kept out of memory. */
  readonly truncated: boolean;
  /** Where the whole output went, once it outgrew the limit. */
  readonly spillPath: string | undefined;
  /** Flush and release the file. Safe to call more than once. */
  close(): Promise<void>;
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
  let tail = "";
  let truncated = false;
  let spillPath: string | undefined;
  let stream: WriteStream | undefined;
  let closing: Promise<void> | undefined;
  /**
   * Everything read so far, kept only until the limit is passed.
   *
   * Up to the limit this is the same text as `tail`, so holding both costs
   * nothing; past it the buffer is released and the file takes over. Keeping it
   * is what lets the file be opened late and still begin at the beginning —
   * spilling from the moment of overflow would lose everything before it.
   */
  let buffered: string[] = [];

  const openSpill = (): void => {
    if (!options.spillDirectory || stream) return;
    try {
      mkdirSync(options.spillDirectory, { recursive: true });
      spillPath = path.join(
        options.spillDirectory,
        `${options.label}-${Date.now().toString(36)}-${process.pid}.log`,
      );
      const opened = createWriteStream(spillPath, { flags: "w" });
      // A file that cannot be written is not worth failing a command over: the
      // tail is still kept, and the notice then says the excess was dropped.
      opened.on("error", () => {
        stream = undefined;
        spillPath = undefined;
      });
      for (const chunk of buffered) opened.write(chunk);
      buffered = [];
      stream = opened;
    } catch {
      stream = undefined;
      spillPath = undefined;
    }
  };

  return {
    append(text: string): void {
      if (!text) return;
      const combined = tail + text;
      if (combined.length <= options.limitBytes && !stream) {
        tail = combined;
        buffered.push(text);
        return;
      }

      if (stream) {
        stream.write(text);
      } else {
        // First time past the limit: the buffer still holds the whole beginning,
        // which is what makes the file complete rather than a continuation.
        buffered.push(text);
        openSpill();
      }

      truncated = true;
      tail = combined.slice(combined.length - options.limitBytes);
    },

    get tail(): string {
      return tail;
    },

    get truncated(): boolean {
      return truncated;
    },

    get spillPath(): string | undefined {
      return spillPath;
    },

    close(): Promise<void> {
      closing ??= new Promise<void>((resolve) => {
        const active = stream;
        stream = undefined;
        if (!active) {
          resolve();
          return;
        }
        active.end(() => resolve());
      });
      return closing;
    },
  };
}
