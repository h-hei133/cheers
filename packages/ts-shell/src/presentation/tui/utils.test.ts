import { describe, it, expect } from "vitest";
import { visibleWidth, sliceWithWidth, stripAnsi } from "./utils.js";

describe("Unicode East Asian Width & CJK Column Alignment", () => {
  it("calculates ASCII characters as 1 visual column", () => {
    expect(visibleWidth("hello")).toBe(5);
    expect(visibleWidth("abc 123")).toBe(7);
  });

  it("calculates CJK Chinese characters as 2 visual columns each", () => {
    expect(visibleWidth("你好")).toBe(4);
    expect(visibleWidth("中文测试")).toBe(8);
    expect(visibleWidth("Hello 世界")).toBe(10); // 5 (Hello) + 1 (space) + 4 (世界) = 10
  });

  it("calculates Emoji characters as 2 visual columns", () => {
    expect(visibleWidth("✨")).toBe(2);
    expect(visibleWidth("🚀 test")).toBe(6); // 🚀 counted as 1 wide char + 1 space + 4 = 6
  });

  it("slices CJK strings based on visual columns rather than byte length", () => {
    const text = "你好世界";
    const sliced = sliceWithWidth(text, 0, 4);
    expect(sliced.text).toBe("你好");
    expect(sliced.width).toBe(4);
  });

  it("strips APC cursor sentinel tokens to zero visual columns", () => {
    const textWithCursor = "input\x1b_cursor:c\x07";
    expect(stripAnsi(textWithCursor)).toBe("input");
    expect(visibleWidth(textWithCursor)).toBe(5);
  });
});
