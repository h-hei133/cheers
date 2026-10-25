import type { Block, BlockRenderOptions } from "../transcript/blocks.js";
import type { FrameLayout } from "../render/frame.js";
import type { Transcript } from "../transcript/container.js";
import type { SelectionPoint, SelectionSpan } from "../transcript/selection.js";
import { joinSourceLines, type SourceLine } from "../transcript/source.js";
import { stripAnsi } from "../text/ansi.js";
import { visibleWidth } from "../text/measure.js";
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
  private document: readonly Block[] | undefined;
  sensitiveRows: readonly string[] = [];
  /** Source lines aligned with the painted screen rows; filler rows have none. */
  private sources: readonly (SourceLine | undefined)[] = [];
  private paintedRows: readonly string[] = [];
  private owners: readonly number[] = [];
  private selectionRevisionValue = 0;
  private lastTranscriptRevision = -1;
  private lastSelectionWidth = -1;

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
    layout: FrameLayout = "viewport",
  ): string[] {
    const document = this.transcript.all();
    const documentChanged = document !== this.document;
    if (documentChanged) {
      this.scroller.scrollToEnd();
      this.document = document;
    }
    const safeWidth = Math.max(1, Math.floor(width));
    const selectionLayoutChanged = documentChanged || safeWidth !== this.lastSelectionWidth
      || this.transcript.revision !== this.lastTranscriptRevision;
    const hasScrollbar = layout === "viewport" && needsScrollbar(
      this.transcript.rowCount(safeWidth),
      Math.max(1, capacity),
      safeWidth,
    );
    const contentWidth = hasScrollbar ? Math.max(1, safeWidth - 1) : safeWidth;
    const rendered = this.transcript.render(contentWidth, options);
    const { rows, owners } = rendered;
    const safeCapacity = layout === "document" ? rows.length : Math.max(1, capacity);
    // A resize re-wraps every row, so an absolute scrollTop no longer names the
    // same content. Keep the block at the top and its offset inside that block.
    const previousTop = this.scroller.scrollTop;
    const anchor = !this.scroller.isFollowingEnd ? this.owners[previousTop] : undefined;
    const anchorOffset = anchor === undefined ? 0 : previousTop - this.owners.indexOf(anchor);
    this.scroller.updateLayout(rows.length, safeCapacity);
    if (anchor !== undefined && !this.scroller.isFollowingEnd) {
      const start = owners.indexOf(anchor);
      if (start >= 0) this.scroller.scrollTo(Math.min(owners.length - 1, start + anchorOffset));
    }
    const top = this.scroller.scrollTop;
    if (selectionLayoutChanged) {
      this.selectionRevisionValue++;
      this.lastSelectionWidth = safeWidth;
      this.lastTranscriptRevision = this.transcript.revision;
    }
    const visible = rows.slice(top, top + safeCapacity);
    const filler = Math.max(0, safeCapacity - visible.length);
    this.window = new TranscriptWindow({ top, filler, visible: visible.length, rows, owners });
    this.sources = [
      ...Array<SourceLine | undefined>(filler).fill(undefined),
      ...rendered.sources.slice(top, top + visible.length),
    ];
    this.capacity = safeCapacity;
    this.width = safeWidth;
    this.owners = owners;
    this.total = rows.length;
    this.geometry = hasScrollbar ? scrollbarGeometry(rows.length, safeCapacity, top, safeWidth - 1) : undefined;
    const shaded = this.window.shade([...Array<string>(filler).fill(""), ...visible], selection);
    // Search marks sit inside the shaded rows and before the scrollbar: a match
    // highlight must be part of the row the scrollbar is appended to, or shading
    // the matched cells would overwrite the track.
    const marked = highlight
      ? shaded.map((row, index) => (index < filler ? row : highlight(row, top + index - filler)))
      : shaded;
    const painted = this.geometry ? paintScrollbar(marked, this.geometry, safeWidth) : marked;
    this.sensitiveRows = painted.filter((row, index) => row && this.blockAtScreenRow(index)?.kind === 'user');
    this.paintedRows = painted;
    return painted;
  }

  toggleCollapsed(only?: "thinking" | "tool"): boolean {
    const collapsible = this.transcript
      .all()
      .filter((block) => block.collapsed !== undefined)
      .filter((block) => only === undefined || block.kind === only);
    if (collapsible.length === 0) return false;
    // One decision for the whole set, taken from the first: pressing the key
    // again must undo what it just did, which it cannot if some blocks were
    // already in the target state and flip the other way.
    const collapsed = !collapsible[0]!.collapsed;
    for (const block of collapsible) this.transcript.setCollapsed(block, collapsed);
    return true;
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
  contentRows(): readonly string[] {
    if (this.window.layout.rows.length > 0) return this.window.layout.rows;
    return this.transcript.render(this.geometry ? Math.max(1, this.width - 1) : this.width).rows;
  }

  /** Changes whenever source coordinates or their underlying transcript change. */
  selectionRevision(): number {
    return this.selectionRevisionValue;
  }

  selectionTop(): number {
    return this.scroller.scrollTop;
  }

  /** The block under screen row `row`, or nothing for padding and chrome. */
  blockAtScreenRow(row: number): Block | undefined {
    const index = this.window.blockIndexAt(row);
    return index === undefined ? undefined : this.transcript.blockAt(index);
  }

  /**
   * Copy the semantic source under a full-row selection.
   *
   * Returns nothing when the drag starts mid-row, crosses blocks, or lands on a
   * row whose renderer cannot state its source — the caller then falls back to
   * rendered-cell extraction rather than inventing text.
   */
  extractSource(anchor: SelectionPoint, focus: SelectionPoint): string | undefined {
    const contentFrom = anchor.row <= focus.row ? anchor : focus;
    const contentTo = anchor.row <= focus.row ? focus : anchor;
    const from = this.contentToScreenPoint(contentFrom);
    const to = this.contentToScreenPoint(contentTo);
    if (!from || !to) return undefined;
    const first = this.sources[from.row];
    const sideSelectable = first?.split !== undefined;
    const side = sideSelectable && from.column > first!.split! ? "right" : "left";
    if (from.column > 0 && !sideSelectable) return undefined;
    const selected: SourceLine[] = [];
    for (let row = from.row; row <= to.row; row++) {
      const line = this.sources[row];
      if (!line) return undefined;
      if (line.split !== undefined) {
        const text = side === "right" ? line.right : line.left;
        if (text === undefined) return undefined;
        selected.push({ ...line, text });
        continue;
      }
      if (sideSelectable) return undefined;
      if (row === to.row) {
        const text = stripAnsi(this.paintedRows[row] ?? "");
        if (to.column < Math.max(0, visibleWidth(text) - 1)) return undefined;
      }
      selected.push(line);
    }
    if (selected.length === 0) return undefined;
    const coverage = new Map<number, { readonly seen: Set<number>; readonly total: number }>();
    for (const line of selected) {
      if (line.node === undefined) continue;
      const entry = coverage.get(line.node) ?? { seen: new Set<number>(), total: line.nodeRows ?? 1 };
      entry.seen.add(line.nodeRow ?? 0);
      coverage.set(line.node, entry);
    }
    if ([...coverage.values()].some(entry => entry.seen.size !== entry.total)) return undefined;
    const block = selected[0]!.block;
    if (selected.some((line) => line.block !== block)) return undefined;
    const text = joinSourceLines(selected);
    return text || undefined;
  }

  /** Source rows are painted in screen space; pointer selections use content space. */
  private contentToScreenPoint(point: SelectionPoint): SelectionPoint | undefined {
    const { top, filler, visible } = this.window.layout;
    if (visible <= 0 || point.row < top || point.row >= top + visible) return undefined;
    return { row: filler + point.row - top, column: point.column };
  }
}
