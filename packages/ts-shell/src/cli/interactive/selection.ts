import type { MouseReport } from "../../presentation/tui/input/mouse.js";
import { nextClickCount, spanForClick, type ClickRecord } from "./clickSelect.js";
import {
  extractSelection,
  orderSpan,
  type SelectionPoint,
  type SelectionSpan,
} from "../../presentation/tui/transcript/selection.js";

export { extractSelection, highlightSelection } from "../../presentation/tui/transcript/selection.js";
export type { SelectionPoint, SelectionSpan } from "../../presentation/tui/transcript/selection.js";

/**
 * Drag-to-copy over the rows currently on screen.
 *
 * The gesture lives here; what a selection *is* — which cells it covers, how it
 * is shaded, and how it is turned back into text — is owned by the transcript
 * module, so every surface shades and copies the same way.
 *
 * Holding Shift bypasses this and hands the drag back to the terminal, which is
 * how a selection is made across scrollback the screen no longer holds.
 *
 * A selection nobody can see is indistinguishable from no selection at all, so the
 * span is also published for the frame to paint. Owning the drag means owning that
 * too: the terminal is not tracking a selection of its own to shade in for us.
 */

export interface ScreenText {
  /** Painted rows of the whole screen, top row first. */
  rows(): readonly string[];
}

export class DragSelection {
  private anchor: SelectionPoint | undefined;
  private focus: SelectionPoint | undefined;
  private inFlight = false;
  private lastClick: ClickRecord | undefined;
  /** The current run is a word or line selection, so a drag extends it. */
  private granularity: "character" | "word" | "line" = "character";

  constructor(
    private readonly screen: ScreenText,
    private readonly copy: (text: string) => void,
  ) {}

  /** True while a drag is being tracked, so the frame can be left alone. */
  get dragging(): boolean {
    return this.inFlight;
  }
  /** The span under the pointer right now, for the frame to shade. */
  get span(): SelectionSpan | undefined {
    if (!this.anchor || !this.focus) return undefined;
    return orderSpan(this.anchor, this.focus);
  }

  /** Cancel any in-progress drag without copying. */
  clear(): void {
    this.inFlight = false;
    this.anchor = undefined;
    this.focus = undefined;
    // The click run ends with the selection: otherwise a click after a copied
    // selection would count as a continuation of the one before it.
    this.lastClick = undefined;
    this.granularity = "character";
  }

  /** Copy the currently selected text and clear the selection. Returns true if a selection was active. */
  copyAndClear(): boolean {
    const span = this.span;
    if (!span) {
      this.clear();
      return false;
    }
    const text = extractSelection(this.screen.rows(), span.from, span.to);
    this.clear();
    if (text) {
      this.copy(text);
    }
    return true;
  }
  /**
   * Handle one report. Returns false for anything not claimed — a Shift-held
   * drag, the wheel, a non-left button — so the caller can ignore it rather than
   * treat it as a selection.
   */
  handle(report: MouseReport, contentCoord?: SelectionPoint, now: number = Date.now()): boolean {
    if (report.shift) {
      this.clear();
      return false;
    }
    const coord = contentCoord ?? { row: report.row, column: report.column };
    switch (report.kind) {
      case "press": {
        if (report.button !== 0) return false;
        this.inFlight = true;
        // Repeated presses on one cell widen what is selected: twice for the word,
        // three times for the line. The run is remembered so a drag that follows
        // takes the whole word rather than shrinking to the exact cell under the
        // pointer, which is the behaviour of every editor that has this gesture.
        const count = nextClickCount(this.lastClick, coord, now);
        this.lastClick = { row: coord.row, column: coord.column, at: now, count };
        this.granularity = count === 2 ? "word" : count === 3 ? "line" : "character";
        const span =
          this.granularity === "character"
            ? undefined
            : spanForClick(this.screen.rows(), coord, this.granularity);
        // A word click that landed on whitespace has no word to take, so it falls
        // back to a character anchor rather than selecting nothing at all.
        this.anchor = span?.from ?? coord;
        this.focus = span?.to ?? coord;
        return true;
      }
      case "drag":
        if (!this.anchor) return false;
        this.inFlight = true;
        // A word or line selection stays whole while the pointer moves: the unit
        // was chosen by the click, and a drag adjusts which units are covered
        // rather than dissolving back into individual characters.
        if (this.granularity !== "character") {
          const span = spanForClick(this.screen.rows(), coord, this.granularity);
          if (span) this.focus = span.to;
          return true;
        }
        this.focus = coord;
        return true;
      case "release": {
        this.inFlight = false;
        const anchor = this.anchor;
        if (!anchor) return false;
        // A word or line selection was already decided by the click, so the release
        // point does not redefine it. Overwriting the focus here is what made a
        // double click copy a fragment: the span had been widened to the word, and
        // the release column narrowed it back to wherever the pointer stopped.
        const focus = this.granularity === "character" ? coord : this.focus ?? coord;
        this.focus = focus;
        if (anchor.row === focus.row && anchor.column === focus.column) {
          this.clear();
          return false;
        }
        const text = extractSelection(this.screen.rows(), anchor, focus);
        if (!text) {
          this.clear();
          return false;
        }
        this.copy(text);
        return true;
      }
      default:
        return false;
    }
  }
}
