import type { MouseReport } from "../../presentation/tui/input/mouse.js";
import { DragSelection, type SelectionSpan } from "./selection.js";
import type { ComposerGeometry, InteractiveView } from "../../presentation/tui/surface/contract.js";
import type { SourceSelection } from "../../presentation/tui/composer/contract.js";
import { selectionFromPoints } from "../../presentation/tui/composer/projection.js";
import { BlockClick } from './click.js';

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
  /** An open overlay takes priority over underlying selection and scrolling. */
  capture?(report: MouseReport): boolean;
}

function sameComposer(left: ComposerGeometry | undefined, right: ComposerGeometry): boolean {
  if (!left || left.top !== right.top) return false;
  const a = left.layout, b = right.layout;
  return a.sourceRevision === b.sourceRevision && a.source === b.source && a.width === b.width &&
    a.viewportStart === b.viewportStart && a.rows.length === b.rows.length && a.rows.every((row, index) => {
      const previous = b.rows[index]!;
      return row.kind === previous.kind && row.screenRow === previous.screenRow &&
        (row.kind !== "content" || previous.kind !== "content" ||
          (row.contentColumn === previous.contentColumn && row.contentCells === previous.contentCells &&
           row.sourceStart === previous.sourceStart && row.sourceEnd === previous.sourceEnd));
    });
}

export class Pointer {
  private readonly drag: DragSelection;
  private readonly composerDrag: DragSelection;
  private readonly click = new BlockClick();
  private composerAnchor: ComposerGeometry | undefined;
  private composerRange: SourceSelection | undefined;
  private transcriptSelectionRevision: number | undefined;
  private transcriptContentRevision: number | undefined;
  private transcriptTop: number | undefined;
  private dragTarget: "transcript" | "composer" | undefined;
  private scrollbarDrag: { readonly grabOffset: number } | undefined;
  private autoScrollTimer: ReturnType<typeof setInterval> | undefined;
  private choiceGesture = false;
  constructor(private readonly context: PointerContext) {
    this.drag = new DragSelection({
      rows: () => context.rows(),
      extract: (anchor, focus) => context.view().transcriptSource?.(anchor, focus),
    }, (text) => context.copy(text));
    this.composerDrag = new DragSelection(
      {
        rows: () => {
          const geo = context.view().composerGeometry?.();
          return geo ? geo.rows : [];
        },
        extract: (anchor, focus, options) => {
          const geometry = context.view().composerGeometry?.();
          if (!this.composerAnchor || !sameComposer(geometry, this.composerAnchor)) return undefined;
          if (options.kind !== "unit" && anchor.row === focus.row && anchor.column === focus.column) return undefined;
          const range = selectionFromPoints(geometry!.layout, anchor, focus);
          return geometry!.layout.source.slice(range.start, range.end) || undefined;
        },
      },
      (text) => context.copy(text),
    );
  }

  /** What the pointer has covered in the transcript, for the frame to shade. */
  get selection(): SelectionSpan | undefined {
    if (this.dragTarget === "transcript" && !this.transcriptSelectionCurrent()) return undefined;
    return this.dragTarget === "transcript" || (this.dragTarget === undefined && this.drag.span)
      ? this.drag.span
      : undefined;
  }

  /** What the pointer has covered in the composer, for the frame to shade. */
  get composerSelection(): SourceSelection | undefined {
    return this.composerAnchor && sameComposer(this.context.view().composerGeometry?.(), this.composerAnchor)
      ? this.composerRange : undefined;
  }

  /** Clear any active drag selection. Returns true if there was a selection. */
  clearSelection(): boolean {
    this.stopAutoScroll();
    this.click.cancel();
    this.scrollbarDrag = undefined;
    const hadSelection = this.drag.span !== undefined || this.composerDrag.span !== undefined;
    this.drag.clear();
    this.composerDrag.clear();
    this.composerAnchor = undefined;
    this.composerRange = undefined;
    this.transcriptSelectionRevision = undefined;
    this.transcriptContentRevision = undefined;
    this.transcriptTop = undefined;
    this.dragTarget = undefined;
    return hadSelection;
  }

  /** Copy the active selection to clipboard and clear it. Returns true if copied. */
  copySelection(): boolean {
    this.stopAutoScroll();
    if (this.composerDrag.span) {
      this.dragTarget = undefined;
      const copied = this.composerDrag.copyAndClear();
      this.composerAnchor = undefined;
      this.composerRange = undefined;
      return copied;
    }
    if (this.drag.span) {
      if (!this.transcriptSelectionCurrent()) {
        this.clearSelection();
        return false;
      }
      this.dragTarget = undefined;
      return this.drag.copyAndClear();
    }
    return false;
  }

  /** Handle one report. */
  handle(report: MouseReport): void {
    if (report.kind === 'move') { this.context.capture?.(report); return; }
    if (this.composerAnchor && !sameComposer(this.context.view().composerGeometry?.(), this.composerAnchor)) {
      this.clearSelection();
      if (report.kind !== "press") {
        this.choiceGesture = report.kind !== "release";
        this.context.redraw();
        return;
      }
    }
    if (this.context.capture?.(report)) {
      this.clearSelection();
      if (report.kind === "press" || report.kind === "drag") this.choiceGesture = true;
      if (report.kind === "release") this.choiceGesture = false;
      this.context.redraw();
      return;
    }
    // A press consumed by a chooser cannot finish as a transcript click, even
    // when a redraw closes or moves the chooser before release.
    if (this.choiceGesture && report.kind !== "press") {
      if (report.kind === "release") this.choiceGesture = false;
      return;
    }
    this.choiceGesture = false;
    const view = this.context.view();
    const list = view.suggestionsOpen ? view.choiceRegions?.suggestions : undefined;
    if (list && report.row >= list.top && report.row < list.top + list.height &&
        report.column >= 0 && report.column < list.width) {
      this.clearSelection();
      if (report.kind === "drag") this.choiceGesture = true;
      if (report.kind === "press") {
        this.choiceGesture = true;
        if (report.button === 0 && !report.shift && !report.alt && !report.ctrl) {
          view.suggestions.selectRow(report.row - list.top);
        }
      }
      this.context.redraw();
      return;
    }
    if (report.kind === "wheel") {
      this.click.cancel();
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
      this.stopAutoScroll();
      this.click.cancel();
      if (isComposerRow && compGeo) {
        this.dragTarget = "composer";
        this.transcriptSelectionRevision = undefined;
        this.transcriptContentRevision = undefined;
        this.transcriptTop = undefined;
        this.drag.clear();
        this.composerAnchor = compGeo;
        const coord = {
          row: Math.max(0, Math.min(compGeo.rows.length - 1, report.row - compGeo.top)),
          column: report.column,
        };
        this.composerDrag.handle(report, coord);
        this.captureComposerRange(compGeo);
        this.context.redraw();
        return;
      }
      this.dragTarget = "transcript";
      this.transcriptSelectionRevision = this.transcriptRevision(this.context.view());
      this.transcriptContentRevision = this.context.view().transcript.revision;
      this.transcriptTop = this.transcriptTopFor(this.context.view());
      this.composerDrag.clear();
      this.composerAnchor = undefined;
      this.composerRange = undefined;
      const contentCoord = this.context.view().screenToContent(report.row, report.column);
      this.drag.handle(report, contentCoord);
      this.click.press(view, report, this.context.rows(), this.drag.span);
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
      this.captureComposerRange(compGeo);
      if (handled) {
        this.context.redraw();
        return;
      }
      // A composer click must never toggle a transcript block beneath it.
      if (report.kind === "release") { this.context.redraw(); return; }
    } else if (this.dragTarget === "transcript") {
      if (report.kind === 'drag') this.click.cancel();
      if (report.kind === 'release') {
        this.stopAutoScroll();
        const block = this.click.release(view, report, this.context.rows(), this.transcriptSelectionCurrent());
        if (block) {
          this.drag.clear();
          this.context.view().transcript.setCollapsed(block, !block.collapsed);
          this.context.redraw();
          return;
        }
      }
      if (!this.transcriptSelectionCurrent()) {
        this.clearSelection();
        this.context.redraw();
        return;
      }
      const maxTranscriptRow = compGeo ? compGeo.top - 1 : Infinity;
      const isTopEdge = report.kind === 'drag' && report.row <= 1;
      const isBottomEdge = report.kind === 'drag' && report.row >= maxTranscriptRow - 1;

      if (isTopEdge) {
        this.context.view().scroll(-1);
        this.transcriptTop = this.transcriptTopFor(this.context.view());
        const contentCoord = this.context.view().screenToContent(0, report.column);
        this.drag.handle(report, contentCoord);
        this.startAutoScroll(-1, 0, report.column);
        this.context.redraw();
        return;
      }

      if (isBottomEdge) {
        this.context.view().scroll(1);
        this.transcriptTop = this.transcriptTopFor(this.context.view());
        const clampedRow = Math.min(maxTranscriptRow, report.row);
        const contentCoord = this.context.view().screenToContent(clampedRow, report.column);
        this.drag.handle(report, contentCoord);
        this.startAutoScroll(1, clampedRow, report.column);
        this.context.redraw();
        return;
      }

      this.stopAutoScroll();
      const contentCoord = this.context.view().screenToContent(report.row, report.column);
      const handled = this.drag.handle(report, contentCoord);
      if (handled) {
        this.context.redraw();
        return;
      }
    }

    if (report.kind === "release") {
      this.stopAutoScroll();
      if (!report.shift) {
        this.context.redraw();
      }
    }
  }

  private transcriptSelectionCurrent(): boolean {
    const view = this.context.view();
    return this.transcriptSelectionRevision !== undefined
      && this.transcriptContentRevision === view.transcript.revision
      && this.transcriptTop === this.transcriptTopFor(view)
      && this.transcriptRevision(view) === this.transcriptSelectionRevision;
  }

  private transcriptTopFor(view: InteractiveView): number {
    return view.selectionTop?.() ?? 0;
  }

  private transcriptRevision(view: InteractiveView): number {
    return view.selectionRevision?.() ?? view.transcript.revision ?? 0;
  }

  private captureComposerRange(geometry: ComposerGeometry): void {
    const span = this.composerDrag.span;
    this.composerRange = span ? selectionFromPoints(geometry.layout, span.from, span.to) : undefined;
  }

  private stopAutoScroll(): void {
    if (this.autoScrollTimer) {
      clearInterval(this.autoScrollTimer);
      this.autoScrollTimer = undefined;
    }
  }

  private startAutoScroll(direction: -1 | 1, targetRow: number, column: number): void {
    this.stopAutoScroll();
    this.autoScrollTimer = setInterval(() => {
      const moved = this.context.view().scroll(direction);
      if (moved) {
        this.transcriptTop = this.transcriptTopFor(this.context.view());
        const contentCoord = this.context.view().screenToContent(targetRow, column);
        this.drag.handle(
          { kind: "drag", button: 0, row: targetRow, column, shift: false, alt: false, ctrl: false },
          contentCoord,
        );
        this.context.redraw();
      } else {
        this.stopAutoScroll();
      }
    }, 70);
    this.autoScrollTimer.unref?.();
  }

}
