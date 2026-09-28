import type { Block, BlockRenderOptions } from "../transcript/blocks.js";
import type { Transcript } from "../transcript/container.js";
import type { SelectionPoint, SelectionSpan } from "../transcript/selection.js";
import {
  needsScrollbar,
  paintScrollbar,
  scrollbarGeometry,
  thumbTargetTop,
  TranscriptWindow,
  type ScrollbarGeometry,
} from "../transcript/viewport.js";
import { ScrollModel } from "./scroll.js";

/**
 * The scrolling transcript area.
 *
 * The window follows the newest rows unless the user has scrolled away from
 * them. Following is the default because a conversation is read at its end; an
 * explicit scroll is a statement that the user is reading something else, and
 * new output must not move it — so a scrolled-back window keeps its content
 * rows, not its distance from the end.
 *
 * A short conversation is padded down to the bottom so the chrome stays put,
 * and a long one gets a scrollbar in the last column. Every geometry question
 * the host asks — which block is under a row, where a content selection sits on
 * screen — is answered against the window this last drew.
 */
export class TranscriptPane {
  private readonly scroller = new ScrollModel();
  private window = TranscriptWindow.EMPTY;
  private geometry: ScrollbarGeometry | undefined;
  private capacity = 0;
  private width = 80;
  private total = 0;

  constructor(private readonly transcript: Transcript) {}

  /**
   * The transcript rows for one frame: `capacity` rows at `width`, padded to
   * the bottom, shaded with `selection`, and carrying a scrollbar when needed.
   */
  render(
    width: number,
    capacity: number,
    selection: SelectionSpan | undefined,
    highlight?: (row: string, contentRow: number) => string,
    options?: BlockRenderOptions,
  ): string[] {
    const safeWidth = Math.max(1, Math.floor(width));
    const safeCapacity = Math.max(1, capacity);
    const hasScrollbar = needsScrollbar(
      this.transcript.rowCount(safeWidth),
      safeCapacity,
      safeWidth,
    );
    const contentWidth = hasScrollbar ? Math.max(1, safeWidth - 1) : safeWidth;
    const { rows, owners } = this.transcript.render(contentWidth, options);
    this.scroller.updateLayout(rows.length, safeCapacity);
    const top = this.scroller.scrollTop;
    const visible = rows.slice(top, top + safeCapacity);
    const filler = Math.max(0, safeCapacity - visible.length);
    this.window = new TranscriptWindow({ top, filler, visible: visible.length, rows, owners });
    this.capacity = safeCapacity;
    this.width = safeWidth;
    this.total = rows.length;
    this.geometry = hasScrollbar ? scrollbarGeometry(rows.length, safeCapacity, top, safeWidth - 1) : undefined;
    const shaded = this.window.shade([...Array<string>(filler).fill(""), ...visible], selection);
    // Search marks sit inside the shaded rows and before the scrollbar: a match
    // highlight must be part of the row the scrollbar is appended to, or shading
    // the matched cells would overwrite the track.
    const marked = highlight
      ? shaded.map((row, index) => (index < filler ? row : highlight(row, top + index - filler)))
      : shaded;
    return this.geometry ? paintScrollbar(marked, this.geometry, safeWidth) : marked;
  }

  /** How far back the window is, in rows; 0 means it is following the newest. */
  get scrolledBack(): number {
    return Math.max(0, this.total - this.capacity) - this.scroller.scrollTop;
  }

  /**
   * Scroll so `row` is on screen.
   *
   * Placed in the upper part rather than the middle: a match near the bottom edge
   * would otherwise be the last thing visible, with none of the context that makes
   * it worth looking at.
   */
  scrollToContentRow(row: number): boolean {
    const target = Math.max(0, Math.min(row - Math.floor(this.capacity / 3), Math.max(0, this.total - this.capacity)));
    if (target === this.scroller.scrollTop) return false;
    this.scroller.scrollTo(target);
    return true;
  }

  /** Move the window by `rows` (negative scrolls back). Returns whether it moved. */
  scroll(rows: number): boolean {
    // Bounded by what the last frame could actually reveal, so a key that had
    // nowhere to go says so instead of reporting a move that renders identically.
    return this.scroller.scrollBy(rows) !== rows;
  }

  /** Scroll by whole screens, for PageUp and PageDown. */
  scrollPage(direction: -1 | 1): boolean {
    return this.scroll(direction * Math.max(1, this.capacity - 1));
  }

  /** Jump to the newest rows, which is also what any new output implies. */
  scrollToEnd(): void {
    this.scroller.scrollToEnd();
  }

  scrollbarGeometry(): ScrollbarGeometry | undefined {
    return this.geometry;
  }

  /** Move the window so the thumb's grab point sits on `pointerRow`. Returns whether it moved. */
  scrollToThumb(pointerRow: number, grabOffset = 0): boolean {
    if (!this.geometry) return false;
    const target = thumbTargetTop(this.geometry, pointerRow, grabOffset);
    if (target === undefined || target === this.scroller.scrollTop) return false;
    this.scroller.scrollTo(target);
    return true;
  }

  screenToContent(row: number, column: number): SelectionPoint {
    return this.window.screenToContent(row, column);
  }

  contentToScreenSpan(span: SelectionSpan): SelectionSpan | undefined {
    return this.window.contentToScreenSpan(span);
  }

  /** Rendered rows of the full transcript at the last width, for selection copying. */
  /**
   * The whole transcript, not just the window onto it.
   *
   * A surface that owns its screen shows a window and scrolls it. A surface
   * appending to the terminal's scrollback has no window to show: every row is
   * history, and it is written once.
   */
  documentRows(width: number): readonly string[] {
    return this.transcript.render(Math.max(1, Math.floor(width))).rows;
  }

  contentRows(): readonly string[] {
    if (this.window.layout.rows.length > 0) return this.window.layout.rows;
    return this.transcript.render(this.geometry ? Math.max(1, this.width - 1) : this.width).rows;
  }

  /** The block under screen row `row`, or nothing for padding and chrome. */
  blockAtScreenRow(row: number): Block | undefined {
    const index = this.window.blockIndexAt(row);
    return index === undefined ? undefined : this.transcript.blockAt(index);
  }
}
