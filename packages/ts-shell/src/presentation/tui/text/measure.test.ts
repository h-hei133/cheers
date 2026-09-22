import { describe, expect, it } from "vitest";
import { graphemeBoundaries, lineCells, sliceWithWidth, visibleWidth } from "./measure.js";
import { ansiSequenceEnd, stripAnsi } from "./ansi.js";
import { getClusterWidth, getCodePointWidth } from "./width.js";

describe("cell width", () => {
  it("counts ASCII one cell per character", () => {
    expect(visibleWidth("hello")).toBe(5);
  });

  it("counts East Asian wide characters as two cells", () => {
    expect(visibleWidth("你好")).toBe(4);
    expect(visibleWidth("Hello 世界")).toBe(10);
  });

  it("keeps narrow dingbats at one cell", () => {
    // These are the glyphs the prompt and transcript actually use; treating the
    // whole U+2600..U+27BF block as wide drifts the cursor on every row.
    expect(visibleWidth("❯")).toBe(1);
    expect(visibleWidth("✔")).toBe(1);
    expect(visibleWidth("✗")).toBe(1);
    expect(visibleWidth("╰─ ")).toBe(3);
  });

  it("treats emoji presentation and pictographs as two cells", () => {
    expect(visibleWidth("🚀")).toBe(2);
    expect(visibleWidth("⚡")).toBe(2);
    expect(visibleWidth("✔️")).toBe(2);
  });

  it("collapses a grapheme cluster to a single advance", () => {
    expect(visibleWidth("é")).toBe(1);
    expect(visibleWidth("👨‍👩‍👧")).toBe(2);
    expect(getClusterWidth("👨‍👩‍👧")).toBe(2);
  });

  it("gives combining marks and control characters no width", () => {
    expect(getCodePointWidth(0x0301)).toBe(0);
    expect(getCodePointWidth(0x200d)).toBe(0);
    expect(getCodePointWidth(0x0007)).toBe(0);
  });

  it("ignores escape sequences of every family", () => {
    expect(visibleWidth("\x1b[31mabc\x1b[0m")).toBe(3);
    expect(visibleWidth("\x1b[2Kabc")).toBe(3);
    expect(visibleWidth("abc\x1b_c\x07")).toBe(3);
    expect(visibleWidth("\x1b]8;;http://x\x07link\x1b]8;;\x07")).toBe(4);
  });
});

describe("escape scanning", () => {
  it("ends a CSI sequence on any final byte, not only on m", () => {
    expect(ansiSequenceEnd("\x1b[2Kx", 0)).toBe(4);
    expect(ansiSequenceEnd("\x1b[31mx", 0)).toBe(5);
    expect(ansiSequenceEnd("\x1b[1;5Hx", 0)).toBe(6);
  });

  it("ends string sequences on BEL or ST", () => {
    expect(ansiSequenceEnd("\x1b_c\x07x", 0)).toBe(4);
    expect(ansiSequenceEnd("\x1bP1$r\x1b\\x", 0)).toBe(7);
  });

  it("strips without swallowing the remainder of the line", () => {
    expect(stripAnsi("\x1b[2Kabc\x1b[Kdef")).toBe("abcdef");
  });
});

describe("cell slicing", () => {
  it("never splits a wide cluster", () => {
    expect(sliceWithWidth("你好世界", 0, 4).text).toBe("你好");
    expect(sliceWithWidth("你好世界", 0, 3).text).toBe("你");
  });

  it("carries the colour state of the skipped prefix into the slice", () => {
    expect(sliceWithWidth("\x1b[31mabcdef", 2, 2).text).toBe("\x1b[31mcd");
  });

  it("keeps slicing past a non-SGR sequence", () => {
    expect(sliceWithWidth("\x1b[2Kabcdef", 0, 3).text).toBe("\x1b[2Kabc");
  });

  it("reports the cells actually taken", () => {
    expect(sliceWithWidth("你好", 0, 3).width).toBe(2);
  });
});

describe("cluster boundaries", () => {
  it("lists one offset per cursor stop plus the end", () => {
    expect(graphemeBoundaries("a🚀b")).toEqual([0, 1, 3, 4]);
  });

  it("exposes cells with their escape prefixes", () => {
    const cells = [...lineCells("\x1b[31mab")];
    expect(cells.map((cell) => cell.cluster)).toEqual(["a", "b"]);
    expect(cells[0]?.prefix).toBe("\x1b[31m");
  });
});
