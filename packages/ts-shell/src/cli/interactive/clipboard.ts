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

  /** Put `text` on the clipboard and report how much was taken. */
  copy(text: string): void {
    void runCopyCommand([text], { cwd: this.context.cwd, sessionId: this.context.sessionId })
      .then(() => {
        const lines = text.split("\n").length;
        this.context.notify(
          `Copied ${text.length} characters${lines > 1 ? ` across ${lines} lines` : ""}.`,
        );
      })
      .catch(() => undefined);
  }
}
