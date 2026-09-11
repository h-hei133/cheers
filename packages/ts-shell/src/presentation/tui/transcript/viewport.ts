import { padToWidth } from "../text/layout.js";
import { visibleWidth } from "../text/measure.js";
import { highlightSelection, type SelectionPoint, type SelectionSpan } from "./selection.js";

/**
 * Geometry of the transcript window.
 *
 * Every surface shows the same thing: a slice of the rendered transcript,
 * bottom-anchored, with a scrollbar on the right when the whole does not fit.
 * The arithmetic that maps a screen row back to a content row, projects a
 * content-space selection onto the screen, and places the scrollbar thumb is
 * therefore owned once, here, so no surface can drift from another by a row.
 */

export interface ScrollbarGeometry {
  readonly column: number;
  readonly trackTop: number;
  readonly trackHeight: number;
  readonly thumbTop: number;
  readonly thumbHeight: number;
  readonly maxScrollTop: number;
}

export type ScrollbarMode = "auto" | "always" | "never";

export interface ScrollbarTheme {
  readonly track: (text: string) => string;
  readonly thumb: (text: string) => string;
}

export interface ScrollbarStyle {
  readonly track: string;
  readonly thumb: string;
}

/** Narrowest screen on which a scrollbar column is worth its cell. */
const MIN_SCROLLBAR_WIDTH = 10;

/** Whether a transcript of `totalRows` needs a scrollbar in `capacity` rows at `width`. */
export function needsScrollbar(
  totalRows: number,
  capacity: number,
  width: number,
  mode: ScrollbarMode = "auto",
): boolean {
  if (capacity <= 0 || width < MIN_SCROLLBAR_WIDTH) return false;
  if (mode === "never") return false;
  if (mode === "always") return true;
  return totalRows > capacity;
}

/** The rows with a viewport scrollbar painted in the last column. */
export function paintScrollbar(
  rows: readonly string[],
  geometry: ScrollbarGeometry,
  width: number,
  style: ScrollbarStyle = { track: "\x1b[90m│\x1b[0m", thumb: "\x1b[37m█\x1b[0m" },
): string[] {
  return rows.map((row, index) => {
    const isThumb = index >= geometry.thumbTop && index < geometry.thumbTop + geometry.thumbHeight;
    return `${padToWidth(row, width - 1)}${isThumb ? style.thumb : style.track}`;
  });
}

export function scrollbarGeometry(
  totalRows: number,
  trackHeight: number,
  top: number,
  column: number,
): ScrollbarGeometry | undefined {
  if (trackHeight <= 0 || totalRows <= trackHeight) return undefined;
  const thumbHeight = Math.max(
    1,
    Math.min(trackHeight, Math.round((trackHeight * trackHeight) / totalRows)),
  );
  const maxScrollTop = Math.max(0, totalRows - trackHeight);
  const maxThumbTop = trackHeight - thumbHeight;
  const thumbTop = maxScrollTop === 0 ? 0 : Math.round((top / maxScrollTop) * maxThumbTop);
  return { column, trackTop: 0, trackHeight, thumbTop, thumbHeight, maxScrollTop };
}


/**
 * The content row the window should start at when the thumb is dragged so that
 * its grab point sits on `pointerRow`, or nothing when the bar cannot move.
 */
export function thumbTargetTop(
  geometry: ScrollbarGeometry,
  pointerRow: number,
  grabOffset: number,
): number | undefined {
  const maxThumbOffset = geometry.trackHeight - geometry.thumbHeight;
  if (geometry.maxScrollTop <= 0 || maxThumbOffset <= 0) return undefined;
  const thumbOffset = Math.max(0, Math.min(maxThumbOffset, pointerRow - geometry.trackTop - grabOffset));
  return Math.round((thumbOffset / maxThumbOffset) * geometry.maxScrollTop);
}

export interface WindowLayout {
  /** Index of the first content row on screen. */
  readonly top: number;
  /** Blank rows padded in above the transcript, pushing it to the bottom. */
  readonly filler: number;
  /** Content rows actually on screen. */
  readonly visible: number;
  /** Every rendered row of the transcript at the frame width. */
  readonly rows: readonly string[];
  /** For each rendered row, the index of the block that produced it. */
  readonly owners: readonly number[];
}

/**
 * The window a frame showed, kept so the next pointer event can be answered
 * against what is actually on screen rather than against a fresh layout.
 */
export class TranscriptWindow {
  static readonly EMPTY = new TranscriptWindow({ top: 0, filler: 0, visible: 0, rows: [], owners: [] });

  constructor(readonly layout: WindowLayout) {}

  /**
   * Map a screen row and column to a content row and column.
   *
   * A short conversation is pushed to the bottom of the screen, so screen row 0 is
   * not content row `top` — it is filler. Rows above the transcript answer with its
   * first visible row; columns past the end of a line clamp to the line, so a
   * selection anchors on real text rather than floating in the void.
   */
  screenToContent(row: number, column: number): SelectionPoint {
    const { top, filler, rows } = this.layout;
    const within = row - filler;
    if (within < 0) return { row: top, column: 0 };
    const maxContentRow = Math.max(0, rows.length - 1);
    const contentRow = Math.min(maxContentRow, top + within);
    const lineWidth = visibleWidth(rows[contentRow] ?? "");
    return { row: contentRow, column: Math.max(0, Math.min(column, lineWidth)) };
  }

  /** A content-space span on the current screen rows, or nothing when off screen. */
  contentToScreenSpan(span: SelectionSpan): SelectionSpan | undefined {
    const { top, filler, visible } = this.layout;
    if (visible <= 0) return undefined;
    const maxVisibleRow = top + visible - 1;
    if (span.to.row < top || span.from.row > maxVisibleRow) return undefined;
    const fromScreenRow = filler + (span.from.row - top);
    const toScreenRow = filler + (span.to.row - top);
    return {
      from: {
        row: Math.max(filler, fromScreenRow),
        column: fromScreenRow < filler ? 0 : span.from.column,
      },
      to: {
        row: Math.min(filler + visible - 1, toScreenRow),
        column: span.to.row > maxVisibleRow ? Number.MAX_SAFE_INTEGER : span.to.column,
      },
    };
  }

  /**
   * The block index under screen row `row`, for a click that lands on the
   * transcript. Padding above and chrome below answer with nothing rather than
   * with the nearest block, so a click on the status band cannot fold away
   * whatever happens to sit at that offset.
   */
  blockIndexAt(row: number): number | undefined {
    const { top, filler, visible, owners } = this.layout;
    const within = row - filler;
    if (within < 0 || within >= visible) return undefined;
    return owners[top + within];
  }

  /** The screen rows with a content-space selection shaded, if any of it is on screen. */
  shade(screenRows: readonly string[], span: SelectionSpan | undefined): string[] {
    if (!span) return [...screenRows];
    const screenSpan = this.contentToScreenSpan(span);
    return screenSpan ? highlightSelection(screenRows, screenSpan) : [...screenRows];
  }
}
