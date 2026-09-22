import { describe, expect, it } from "vitest";
import {
  padToWidth,
  truncateToVisualLines,
  truncateToWidth,
  truncateToWidthWithMode,
  widthPad,
  wrapToWidth,
} from "./layout.js";
import { visibleWidth } from "./measure.js";

describe("truncation", () => {
  it("leaves text that already fits untouched", () => {
    expect(truncateToWidth("abc", 5)).toBe("abc");
  });

  it("reserves one cell for the ellipsis", () => {
    expect(truncateToWidth("abcdefgh", 5)).toBe("abcd…");
    expect(visibleWidth(truncateToWidth("abcdefgh", 5))).toBe(5);
  });

  it("stays within budget when the cut lands on a wide cluster", () => {
    expect(truncateToWidth("你好世界", 5)).toBe("你好…");
    expect(visibleWidth(truncateToWidth("你好世界", 5))).toBeLessThanOrEqual(5);
  });

  it("places the ellipsis at the requested end", () => {
    expect(truncateToWidthWithMode("abcdefgh", 5, "start")).toBe("…efgh");
    expect(truncateToWidthWithMode("abcdefgh", 5, "middle")).toBe("ab…gh");
  });
});

describe("padding", () => {
  it("pads by cells, not by code units", () => {
    expect(padToWidth("你好", 6)).toBe("你好  ");
    expect(widthPad("你好", 6)).toBe("  ");
  });

  it("truncates when the text overflows the target", () => {
    expect(visibleWidth(padToWidth("abcdef", 4))).toBe(4);
  });
});

describe("soft wrapping", () => {
  it("returns a single row when the text fits", () => {
    expect(wrapToWidth("abc", 10)).toEqual(["abc"]);
  });

  it("breaks after the last space that fits", () => {
    expect(wrapToWidth("aaa bbb ccc", 7)).toEqual(["aaa ", "bbb ccc"]);
  });

  it("breaks a word with no break opportunity at the cell boundary", () => {
    expect(wrapToWidth("abcdefghij", 4)).toEqual(["abcd", "efgh", "ij"]);
  });

  it("never splits a wide cluster across rows", () => {
    expect(wrapToWidth("你好世界你好", 5)).toEqual(["你好", "世界", "你好"]);
  });

  it("keeps every row inside the budget", () => {
    for (const row of wrapToWidth("the quick brown fox jumped over it", 9)) {
      expect(visibleWidth(row)).toBeLessThanOrEqual(9);
    }
  });
});

describe("visual line budget", () => {
  it("keeps the trailing rows and reports what was dropped", () => {
    const result = truncateToVisualLines("one\ntwo\nthree", 20, 2);
    expect(result.rows).toEqual(["two", "three"]);
    expect(result.skipped).toBe(1);
  });
});
