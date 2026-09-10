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

function cleanComposerSelection(text: string): string {
  return text.replace(/^(?:\x1b\[[0-9;]*m)*╰─\s*(?:\x1b\[[0-9;]*m)*/u, "");
}

export class Pointer {
  private readonly drag: DragSelection;
  private readonly composerDrag: DragSelection;
  private dragTarget: "transcript" | "composer" | undefined;
  private scrollbarDrag: { readonly grabOffset: number } | undefined;

  constructor(private readonly context: PointerContext) {
    this.drag = new DragSelection({ rows: () => context.rows() }, (text) => context.copy(text));
    this.composerDrag = new DragSelection(
      {
        rows: () => {
          const geo = context.view().composerGeometry?.();
          return geo ? geo.rows : [];
        },
      },
      (text) => {
        const clean = cleanComposerSelection(text);
        if (clean.trim().length > 0) context.copy(clean);
      },
    );
  }

  /** What the pointer has covered in the transcript, for the frame to shade. */
  get selection(): SelectionSpan | undefined {
    return this.dragTarget === "transcript" || (this.dragTarget === undefined && this.drag.span)
      ? this.drag.span
      : undefined;
  }

  /** What the pointer has covered in the composer, for the frame to shade. */
  get composerSelection(): SelectionSpan | undefined {
    return this.dragTarget === "composer" || (this.dragTarget === undefined && this.composerDrag.span)
      ? this.composerDrag.span
      : undefined;
  }

  /** Clear any active drag selection. Returns true if there was a selection. */
  clearSelection(): boolean {
    this.scrollbarDrag = undefined;
    const hadSelection = this.drag.span !== undefined || this.composerDrag.span !== undefined;
    this.drag.clear();
    this.composerDrag.clear();
    this.dragTarget = undefined;
    return hadSelection;
  }

  /** Copy the active selection to clipboard and clear it. Returns true if copied. */
  copySelection(): boolean {
    if (this.composerDrag.span) {
      this.dragTarget = undefined;
      return this.composerDrag.copyAndClear();
    }
    if (this.drag.span) {
      this.dragTarget = undefined;
      return this.drag.copyAndClear();
    }
    return false;
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
    // 3. Normal selection drag in composer or transcript:
    const compGeo = this.context.view().composerGeometry?.();
    const isComposerRow = compGeo !== undefined && report.row >= compGeo.top && report.row <= compGeo.bottom;

    if (report.kind === "press") {
      if (isComposerRow && compGeo) {
        this.dragTarget = "composer";
        this.drag.clear();
        const coord = {
          row: Math.max(0, Math.min(compGeo.rows.length - 1, report.row - compGeo.top)),
          column: report.column,
        };
        this.composerDrag.handle(report, coord);
        this.context.redraw();
        return;
      }
      this.dragTarget = "transcript";
      this.composerDrag.clear();
      const contentCoord = this.context.view().screenToContent(report.row, report.column);
      this.drag.handle(report, contentCoord);
      this.context.redraw();
      return;
    }

    if (this.dragTarget === "composer" && compGeo) {
      const clampedRow = Math.max(compGeo.top, Math.min(compGeo.bottom, report.row));
      const coord = {
        row: Math.max(0, Math.min(compGeo.rows.length - 1, clampedRow - compGeo.top)),
        column: report.column,
      };
      const handled = this.composerDrag.handle(report, coord);
      if (handled) {
        this.context.redraw();
        return;
      }
    } else if (this.dragTarget === "transcript") {
      const maxTranscriptRow = compGeo ? compGeo.top - 1 : Infinity;
      const clampedRow = Math.min(maxTranscriptRow, report.row);
      const contentCoord = this.context.view().screenToContent(clampedRow, report.column);
      const handled = this.drag.handle(report, contentCoord);
      if (handled) {
        this.context.redraw();
        return;
      }
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
