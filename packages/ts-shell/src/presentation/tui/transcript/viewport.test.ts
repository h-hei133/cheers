import { describe, expect, it } from "vitest";
import { stripAnsi } from "../text/ansi.js";
import { defaultTheme } from "../../theme/theme.js";
import {
  needsScrollbar,
  paintScrollbar,
  scrollbarGeometry,
  thumbTargetTop,
  TranscriptWindow,
} from "./viewport.js";

describe("scrollbar geometry", () => {
  it("is absent while the content fits", () => {
    expect(scrollbarGeometry(10, 10, 0, 39)).toBeUndefined();
    expect(scrollbarGeometry(5, 10, 0, 39)).toBeUndefined();
    expect(needsScrollbar(10, 10, 80)).toBe(false);
  });

  it("is withheld on screens too narrow to spare a column", () => {
    expect(needsScrollbar(50, 10, 9)).toBe(false);
    expect(needsScrollbar(50, 10, 10)).toBe(true);
  });

  it("sizes the thumb to the visible fraction and places it by scroll position", () => {
    const top = scrollbarGeometry(100, 10, 0, 79)!;
    expect(top.thumbTop).toBe(0);
    expect(top.thumbHeight).toBe(1);
    expect(top.maxScrollTop).toBe(90);
    const end = scrollbarGeometry(100, 10, 90, 79)!;
    expect(end.thumbTop).toBe(9);
    const half = scrollbarGeometry(20, 10, 5, 79)!;
    expect(half.thumbHeight).toBe(5);
    expect(half.thumbTop).toBe(3);
  });

  it("paints the track in the last column and the thumb over its rows", () => {
    const rows = paintScrollbar(["a", "b", "c", "d"], scrollbarGeometry(8, 4, 0, 9)!, 10);
    const plain = rows.map(stripAnsi);
    expect(plain.every((row) => row.length === 10)).toBe(true);
    expect(plain[0]!.endsWith("█")).toBe(true);
    expect(plain[1]!.endsWith("█")).toBe(true);
    expect(plain[2]!.endsWith("│")).toBe(true);
    expect(plain[3]!.endsWith("│")).toBe(true);
  });

  it("maps a dragged thumb back to a content top, clamped to the track", () => {
    const geometry = scrollbarGeometry(100, 10, 0, 79)!;
    expect(thumbTargetTop(geometry, 0, 0)).toBe(0);
    expect(thumbTargetTop(geometry, 9, 0)).toBe(90);
    expect(thumbTargetTop(geometry, 50, 0)).toBe(90);
    expect(thumbTargetTop(geometry, -5, 0)).toBe(0);
    // Grabbing the thumb two rows below its top keeps that offset under the pointer.
    const tall = scrollbarGeometry(20, 10, 0, 79)!;
    expect(thumbTargetTop(tall, 2, 2)).toBe(0);
    expect(thumbTargetTop(tall, 7, 2)).toBe(10);
  });

  it("refuses to move a thumb that fills its track", () => {
    expect(thumbTargetTop({ column: 0, trackTop: 0, trackHeight: 5, thumbTop: 0, thumbHeight: 5, maxScrollTop: 0 }, 3, 0)).toBeUndefined();
  });
});

describe("scrollbar visibility", () => {
  it("uses a high-contrast thumb and track that remain visible in the default theme", () => {
    // The colours come from the theme rather than literal escapes, so this
    // asserts that the default palette gives the two a different colour — which
    // is what "visible" means here. Pinning the escapes would have passed for
    // any theme, including one where the thumb and track are the same colour.
    const geometry = scrollbarGeometry(40, 10, 0, 39)!;
    const rows = paintScrollbar(Array.from({ length: 10 }, () => "content"), geometry, 40);
    const thumb = defaultTheme.fg("scrollbarThumb", "█");
    const track = defaultTheme.fg("scrollbarTrack", "│");
    expect(rows[0]).toContain(thumb);
    expect(rows[9]).toContain(track);
    expect(thumb).not.toBe(track);
  });

  it("follows the theme it is rendered under", () => {
    // The defect this replaces: the scrollbar was two literal escape sequences,
    // so a theme could not change it and a light theme inherited a dark bar.
    const geometry = scrollbarGeometry(40, 10, 0, 39)!;
    const rows = paintScrollbar(Array.from({ length: 10 }, () => "content"), geometry, 40);
    expect(rows[0]).toMatch(/\x1b\[[0-9;]*m/);
    expect(defaultTheme.fg("scrollbarThumb", "█")).not.toBe("\x1b[37m█\x1b[0m");
  });

  it("supports auto, always, and never visibility models", () => {
    expect(needsScrollbar(40, 10, 80, "auto")).toBe(true);
    expect(needsScrollbar(5, 10, 80, "auto")).toBe(false);
    expect(needsScrollbar(5, 10, 80, "always")).toBe(true);
    expect(needsScrollbar(40, 10, 80, "never")).toBe(false);
    expect(needsScrollbar(40, 10, 9, "always")).toBe(true);
  });

  it("accepts caller-provided track and thumb styling", () => {
    const geometry = scrollbarGeometry(40, 10, 0, 39)!;
    const rows = paintScrollbar(["content"], geometry, 40, {
      track: "<track>",
      thumb: "<thumb>",
    });
    expect(rows[0]).toContain("<thumb>");
  });
});

describe("transcript window", () => {
  const rows = ["row 0", "row 1 is longer", "row 2", "row 3", "row 4", "row 5"];
  const owners = [0, 0, 1, 1, 2, 2];

  it("maps screen rows through the filler and the window top", () => {
    // Four content rows on screen starting at row 2, pushed down by one filler row.
    const window = new TranscriptWindow({ top: 2, filler: 1, visible: 4, rows, owners });
    expect(window.screenToContent(0, 3)).toEqual({ row: 2, column: 0 });
    expect(window.screenToContent(1, 3)).toEqual({ row: 2, column: 3 });
    expect(window.screenToContent(4, 3)).toEqual({ row: 5, column: 3 });
    expect(window.screenToContent(40, 3)).toEqual({ row: 5, column: 3 });
  });

  it("clamps a column past the end of a line to the line", () => {
    const window = new TranscriptWindow({ top: 0, filler: 0, visible: 6, rows, owners });
    expect(window.screenToContent(0, 50).column).toBe(5);
    expect(window.screenToContent(1, 50).column).toBe(15);
  });

  it("projects a content span onto the screen and clips what is off it", () => {
    const window = new TranscriptWindow({ top: 2, filler: 1, visible: 4, rows, owners });
    expect(window.contentToScreenSpan({ from: { row: 3, column: 1 }, to: { row: 4, column: 2 } })).toEqual({
      from: { row: 2, column: 1 },
      to: { row: 3, column: 2 },
    });
    // Starts above the window: the on-screen part begins at column 0 of the first row.
    expect(window.contentToScreenSpan({ from: { row: 0, column: 4 }, to: { row: 2, column: 2 } })).toEqual({
      from: { row: 1, column: 0 },
      to: { row: 1, column: 2 },
    });
    // Ends below the window: the last on-screen row is taken whole.
    const clipped = window.contentToScreenSpan({ from: { row: 5, column: 0 }, to: { row: 9, column: 2 } })!;
    expect(clipped.from).toEqual({ row: 4, column: 0 });
    expect(clipped.to.row).toBe(4);
    expect(clipped.to.column).toBe(Number.MAX_SAFE_INTEGER);
    expect(window.contentToScreenSpan({ from: { row: 0, column: 0 }, to: { row: 1, column: 0 } })).toBeUndefined();
    expect(TranscriptWindow.EMPTY.contentToScreenSpan({ from: { row: 0, column: 0 }, to: { row: 1, column: 0 } })).toBeUndefined();
  });

  it("answers a block only for rows inside the window", () => {
    const window = new TranscriptWindow({ top: 2, filler: 1, visible: 4, rows, owners });
    expect(window.blockIndexAt(0)).toBeUndefined();
    expect(window.blockIndexAt(1)).toBe(1);
    expect(window.blockIndexAt(3)).toBe(2);
    expect(window.blockIndexAt(5)).toBeUndefined();
  });

  it("shades only the on-screen part of a selection", () => {
    const window = new TranscriptWindow({ top: 2, filler: 1, visible: 4, rows, owners });
    const screen = ["", "row 2", "row 3", "row 4", "row 5"];
    const shaded = window.shade(screen, { from: { row: 3, column: 0 }, to: { row: 3, column: 2 } });
    expect(shaded[2]).toContain("\x1b[7m");
    expect(shaded[1]).not.toContain("\x1b[7m");
    expect(window.shade(screen, undefined)).toEqual(screen);
  });
});
