import type { MouseReport } from "../../presentation/tui/input/mouse.js";
import { DragSelection, type SelectionSpan } from "./selection.js";
import type { InteractiveSurface } from "./frameSurface.js";

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
  readonly surface: InteractiveSurface;
  /** Every row currently on screen, for turning a drag back into text. */
  rows(): readonly string[];
  copy(text: string): void;
  redraw(): void;
}

export class Pointer {
  private readonly drag: DragSelection;

  constructor(private readonly context: PointerContext) {
    this.drag = new DragSelection({ rows: () => context.rows() }, (text) => context.copy(text));
  }

  /** What the pointer has covered so far, for the frame to shade. */
  get selection(): SelectionSpan | undefined {
    return this.drag.span;
  }

  /** Handle one report. */
  handle(report: MouseReport): void {
    if (report.kind === "wheel") {
      this.context.surface.scroll(report.button * WHEEL_ROWS);
      this.context.redraw();
      return;
    }
    // A drag that covered text is a selection and has been copied. A release that
    // covered nothing was a click, which is how a collapsed block is opened.
    if (this.drag.handle(report)) {
      this.context.redraw();
      return;
    }
    if (report.kind === "release" && !report.shift) this.toggle(report.row);
  }

  private toggle(row: number): void {
    const block = this.context.surface.blockAtScreenRow(row);
    if (!block || block.collapsed === undefined) return;
    block.collapsed = !block.collapsed;
    this.context.redraw();
  }
}
