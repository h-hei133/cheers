import { runCopyCommand } from "../../core/commands/copyCommandRuntime.js";
import { readMouseCopy, writeMouseCopy } from "./tuiSettings.js";

/**
 * Clipboard side of the interactive surface.
 *
 * Both ways of copying end here — a drag over the screen and a block chosen from
 * a list — so there is one clipboard path rather than two that can drift. Whether
 * a drag copies at all is a stored preference, because asking the terminal for
 * mouse reports takes the wheel away from it, and this surface is built on the
 * terminal's own scrollback.
 */

export interface ClipboardContext {
  readonly projectRoot: string;
  readonly cwd: string;
  readonly sessionId: string;
  /** Ask the renderer to start or stop requesting mouse reports. */
  setTracking(enabled: boolean): void;
  /** Report what happened, in the transcript. */
  notify(text: string): void;
}

export class Clipboard {
  private enabled: boolean;

  constructor(private readonly context: ClipboardContext) {
    this.enabled = readMouseCopy(context.projectRoot);
  }

  /** Whether a drag currently copies rather than the terminal selecting. */
  get dragEnabled(): boolean {
    return this.enabled;
  }

  /** Apply the stored preference; called once the renderer owns the terminal. */
  applyStoredPreference(): void {
    this.context.setTracking(this.enabled);
  }

  /** Turn drag-to-copy on or off, persisting the choice and saying what changed. */
  setDragEnabled(enabled: boolean): string {
    this.enabled = enabled;
    this.context.setTracking(enabled);
    const path = writeMouseCopy(this.context.projectRoot, enabled);
    return enabled
      ? `Drag to copy is on (saved to ${path}). Hold shift for the terminal's own selection; the wheel now belongs to this session.`
      : `Drag to copy is off (saved to ${path}). The terminal owns the mouse again.`;
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
