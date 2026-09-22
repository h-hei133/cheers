import { insertSpan, removeSpan, type DraftText } from "./spans.js";
import type { KillRing } from "./killRing.js";

/**
 * Where the last yank landed, so the next one can replace it.
 *
 * A yank is not typing. Pressing the key again asks for a *different* cut, not for
 * the same text twice, so the previous insertion has to be removed before the new
 * one goes in — otherwise cycling through the ring appends every entry instead of
 * showing one. The anchor is what makes that possible: where the insertion began,
 * and how long it was.
 *
 * Holding it here rather than in the editor keeps the arithmetic on lines and
 * columns in one place, with the editor supplying and adopting the draft.
 */

/** The draft, as this needs to read and write it. */
export interface DraftHost {
  read(): DraftText;
  adopt(next: DraftText): void;
}

interface Anchor {
  readonly row: number;
  readonly column: number;
  readonly length: number;
}

export class YankPlacement {
  private anchor: Anchor | undefined;

  constructor(private readonly host: DraftHost) {}

  /** Put the newest cut in, replacing whatever the previous yank inserted. */
  take(ring: KillRing): boolean {
    const newest = ring.newest();
    if (newest === undefined) return false;
    this.place(newest);
    return true;
  }

  /**
   * Replace the last yank with the previous entry in the ring.
   *
   * Reports false when there is nothing to cycle to — before a yank has happened,
   * or with a single entry — so the key does not claim to have done something.
   */
  cycle(ring: KillRing): boolean {
    if (!this.anchor || ring.size < 2) return false;
    const next = ring.rotate();
    if (next === undefined) return false;
    this.place(next);
    return true;
  }

  private place(text: string): void {
    if (this.anchor) {
      this.host.adopt(removeSpan(this.host.read(), this.anchor, this.anchor.length));
    }
    // The anchor is where the insertion begins, which is where the caret is now.
    const at = this.host.read();
    const start = { row: at.row, column: at.column };
    this.host.adopt(insertSpan(at, start, text));
    this.anchor = { ...start, length: text.length };
  }
}
