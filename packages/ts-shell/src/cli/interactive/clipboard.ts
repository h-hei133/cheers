import { runCopyCommand, setClipboardSink } from "../../core/commands/copyCommandRuntime.js";

/**
 * Clipboard side of the interactive surface.
 *
 * Every copy goes through here, so the transcript records what was taken and
 * there is one path rather than several that can drift. The terminal keeps its
 * own selection: a drag is the terminal's, which is why the rendered rows carry
 * no trailing padding for it to hand over.
 */

export interface ClipboardContext {
  readonly cwd: string;
  readonly sessionId: string;
  /** Report what happened, in the transcript. */
  notify(text: string): void;
  /** Write bytes through the renderer's device, never straight to stdout. */
  write(data: string): void;
}

export class Clipboard {
  constructor(private readonly context: ClipboardContext) {
    setClipboardSink((data) => context.write(data));
  }

  /** Give the terminal back, so a later non-interactive copy writes directly. */
  release(): void {
    setClipboardSink(undefined);
  }

  /**
   * Put `text` on the clipboard and report what actually happened.
   *
   * The report comes from the copy itself rather than being written here: a
   * terminal that silently ignores the escape sequence and a clipboard command
   * that took the text are different outcomes, and the drag that produced them
   * looked identical, so the difference has to be said.
   */
  copy(text: string): void {
    void runCopyCommand([text], { cwd: this.context.cwd, sessionId: this.context.sessionId })
      .then((result) => this.context.notify(result.output ?? ""))
      .catch(() => undefined);
  }
}
