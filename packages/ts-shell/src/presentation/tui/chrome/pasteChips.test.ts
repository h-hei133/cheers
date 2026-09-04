import { describe, expect, it } from "vitest";
import { renderPasteChips } from "./pasteChips.js";
import { stripAnsi } from "../text/ansi.js";
import { visibleWidth } from "../text/measure.js";

const chip = {
  id: 1,
  token: "⎘ #1",
  lines: 12,
  chars: 900,
  preview: "const alpha = 1",
};

describe("paste chip band", () => {
  it("renders nothing while nothing is staged", () => {
    expect(renderPasteChips([], 80)).toEqual([]);
  });

  it("renders one card per staged paste with its token, snippet, and size", () => {
    const rows = renderPasteChips([chip], 80);

    expect(rows).toHaveLength(1);
    expect(stripAnsi(rows[0]!)).toContain("⎘ #1");
    expect(stripAnsi(rows[0]!)).toContain("const alpha = 1");
    expect(stripAnsi(rows[0]!)).toContain("+12 lines");
  });

  it("counts characters for a single-line paste", () => {
    const rows = renderPasteChips([{ ...chip, lines: 1, chars: 900 }], 80);
    expect(stripAnsi(rows[0]!)).toContain("900 chars");
  });

  it("omits a card that does not fit instead of wrapping it", () => {
    const rows = renderPasteChips([chip, chip], 20);
    expect(rows).toHaveLength(0);
  });

  it("stays within the frame width", () => {
    for (const row of renderPasteChips([chip, { ...chip, id: 2, token: "⎘ #2" }], 100)) {
      expect(visibleWidth(row)).toBeLessThanOrEqual(100);
    }
  });
});
