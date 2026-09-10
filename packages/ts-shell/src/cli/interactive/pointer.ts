import type { MouseReport } from "../../presentation/tui/input/mouse.js";
import { DragSelection, type SelectionSpan } from "./selection.js";
import type { InteractiveView } from "../../presentation/tui/view.js";

/**
 * What the mouse does.
 *
 * Three gestures, all of them only possible because the session has a screen of
 * its own: the wheel scrolls the conversation, a drag selects and copies it
 * without the layout, and a click opens or closes whatever is under the pointer.
 * On the normal screen the wheel belongs to the terminal, and taking it would cost
 * the user their scrollback — which is the trade this surface no longer has to make.
 */

/** Rows one wheel notch moves the conversation. */
const WHEEL_ROWS = 3;

export interface PointerContext {
  /** The surface currently on screen, read per event so a swapped view is honoured. */
  view(): InteractiveView;
  /** Every row currently on screen, for turning a drag back into text. */
  rows(): readonly string[];
  copy(text: string): void;
  redraw(): void;
}

export class Pointer {
  private readonly drag: DragSelection;
  private scrollbarDrag: { readonly grabOffset: number } | undefined;

  constructor(private readonly context: PointerContext) {
    this.drag = new DragSelection({ rows: () => context.rows() }, (text) => context.copy(text));
  }

  /** What the pointer has covered so far, for the frame to shade. */
  get selection(): SelectionSpan | undefined {
    return this.drag.span;
  }

  /** Clear any active drag selection. Returns true if there was a selection. */
  clearSelection(): boolean {
    this.scrollbarDrag = undefined;
    const hadSelection = this.drag.span !== undefined;
    this.drag.clear();
    return hadSelection;
  }

  /** Copy the active selection to clipboard and clear it. Returns true if copied. */
  copySelection(): boolean {
    return this.drag.copyAndClear();
  }

  /** Handle one report. */
  handle(report: MouseReport): void {
    if (report.kind === "wheel") {
      this.context.view().scroll(report.button * WHEEL_ROWS);
      this.context.redraw();
      return;
    }

    // 1. If currently dragging the scrollbar:
    if (this.scrollbarDrag) {
      if (report.kind === "release") {
        this.scrollbarDrag = undefined;
        this.context.redraw();
        return;
      }
      this.context.view().scrollToThumb(report.row, this.scrollbarDrag.grabOffset);
      this.context.redraw();
      return;
    }

    // 2. Click or press on the scrollbar track / thumb:
    const geo = this.context.view().scrollbarGeometry();
    if (
      geo &&
      report.kind === "press" &&
      report.button === 0 &&
      report.column === geo.column &&
      report.row >= geo.trackTop &&
      report.row < geo.trackTop + geo.trackHeight
    ) {
      this.clearSelection();
      const onThumb = report.row >= geo.thumbTop && report.row < geo.thumbTop + geo.thumbHeight;
      const grabOffset = onThumb ? report.row - geo.thumbTop : Math.floor(geo.thumbHeight / 2);
      if (!onThumb) {
        this.context.view().scrollToThumb(report.row, grabOffset);
      }
      this.scrollbarDrag = { grabOffset };
      this.context.redraw();
      return;
    }

    // 3. Normal selection drag and click:
    const contentCoord = this.context.view().screenToContent(report.row, report.column);
    const handled = this.drag.handle(report, contentCoord);
    if (handled) {
      this.context.redraw();
      return;
    }
    if (report.kind === "release" && !report.shift) {
      this.toggle(report.row);
      this.context.redraw();
    }
  }
  private toggle(row: number): void {
    const block = this.context.view().blockAtScreenRow(row);
    if (!block || block.collapsed === undefined) return;
    this.context.view().transcript.setCollapsed(block, !block.collapsed);
    this.context.redraw();
  }
}
