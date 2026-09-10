import type { Block } from "../transcript/blocks.js";
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
import { ScrollView } from "./scroll.js";
import { TranscriptView } from "./transcript.js";

/**
 * The scrolling transcript area every surface shares.
 *
 * The window follows the newest rows unless the user has scrolled away from them.
 * Following is the default because a conversation is read at its end; an explicit
 * scroll is a statement that the user is reading something else, and new output
 * must not move it — so a scrolled-back window keeps its content rows, not its
 * distance from the end.
 *
 * A short conversation is padded down to the bottom so the chrome stays put, and
 * a long one gets a scrollbar in the last column. Both surfaces compose their
 * frame from this one object, which is what keeps their geometry identical.
 */
export class TranscriptPane {
  private readonly document: TranscriptView;
  private readonly scroller: ScrollView;
  private window = TranscriptWindow.EMPTY;
  private geometry: ScrollbarGeometry | undefined;
  private capacity = 0;
  private width = 80;
  private total = 0;

  constructor(private readonly transcript: Transcript) {
    this.document = new TranscriptView(transcript);
    this.scroller = new ScrollView(this.document, { follow: "end", primary: true });
  }

  /**
   * The transcript rows for one frame: `capacity` rows at `width`, padded to
   * the bottom, shaded with `selection`, and carrying a scrollbar when needed.
   */
  render(width: number, capacity: number, selection: SelectionSpan | undefined): string[] {
    const safeCapacity = Math.max(1, capacity);
    const hasScrollbar = needsScrollbar(this.document.rowCount(width), safeCapacity, width);
    const contentWidth = hasScrollbar ? width - 1 : width;
    const rows = this.document.render(contentWidth);
    this.scroller.updateLayout(rows.length, safeCapacity, () => {});
    const top = this.scroller.scrollTop;
    const visible = rows.slice(top, top + safeCapacity);
    const filler = Math.max(0, safeCapacity - visible.length);
    this.window = new TranscriptWindow({
      top,
      filler,
      visible: visible.length,
      rows,
      owners: this.document.owners,
    });
    this.capacity = safeCapacity;
    this.width = width;
    this.total = rows.length;
    this.geometry = hasScrollbar ? scrollbarGeometry(rows.length, safeCapacity, top, width - 1) : undefined;
    const shaded = this.window.shade([...Array<string>(filler).fill(""), ...visible], selection);
    return this.geometry ? paintScrollbar(shaded, this.geometry, width) : shaded;
  }

  /** How far back the window is, in rows; 0 means it is following the newest. */
  get scrolledBack(): number {
    return Math.max(0, this.total - this.capacity) - this.scroller.scrollTop;
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
  contentRows(): readonly string[] {
    if (this.window.layout.rows.length > 0) return this.window.layout.rows;
    return this.document.render(this.geometry ? Math.max(1, this.width - 1) : this.width);
  }

  /** The block under screen row `row`, or nothing for padding and chrome. */
  blockAtScreenRow(row: number): Block | undefined {
    const index = this.window.blockIndexAt(row);
    return index === undefined ? undefined : this.transcript.blockAt(index);
  }
}
