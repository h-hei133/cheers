import { describe, expect, it } from "vitest";
import { renderDiff, renderSideBySide } from "./diff.js";
import { stripAnsi } from "../text/ansi.js";
import { visibleWidth } from "../text/measure.js";

const WIDTH = 40;

describe("unified diff", () => {
  it("returns nothing for empty input", () => {
    expect(renderDiff("", WIDTH)).toEqual([]);
  });

  it("keeps every marker and line", () => {
    const rows = renderDiff("@@ -1,2 +1,2 @@\n-was\n+now\n unchanged", WIDTH).map(stripAnsi);
    expect(rows).toEqual(["@@ -1,2 +1,2 @@", "-was", "+now", " unchanged"]);
  });

  it("emphasises only the part that differs in a changed pair", () => {
    // Colouring the whole line makes the reader diff two similar lines by eye.
    const rows = renderDiff("-const a = 1;\n+const a = 2;", WIDTH);
    // Only the digit differs, so only the digit is inverted.
    expect(rows[0]).toContain("\x1b[7m1\x1b[27m");
    expect(rows[1]).toContain("\x1b[7m2\x1b[27m");
  });

  it("gives added and removed lines different colours", () => {
    const rows = renderDiff("-gone\n+kept", WIDTH);
    expect(rows[0]).not.toBe(rows[1]);
  });

  it("drops the emphasis when the row had to be truncated", () => {
    const rows = renderDiff(`-${"a".repeat(80)}x\n+${"a".repeat(80)}y`, 20);
    expect(rows[0]).not.toContain("\x1b[7m");
    expect(visibleWidth(rows[0]!)).toBeLessThanOrEqual(20);
  });

  it("fits every row to the width", () => {
    for (const row of renderDiff("+" + "z".repeat(200), WIDTH)) {
      expect(visibleWidth(row)).toBeLessThanOrEqual(WIDTH);
    }
  });
});

describe("side-by-side diff", () => {
  it("pairs a removed/added run and keeps old/new line numbers", () => {
    const rows = renderSideBySide("@@ -3,2 +3,3 @@\n-old\n+new\n+extra\n same", 120).map(stripAnsi);
    expect(rows[0]).toContain("@@ -3,2 +3,3 @@");
    expect(rows[1]).toContain("old");
    expect(rows[1]).toContain("new");
    expect(rows[1]).toMatch(/3\s+3\s+│/);
    expect(rows[2]).toContain("extra");
    expect(rows[2]).not.toContain("old");
    expect(rows[3]).toContain("same");
  });

  it("falls back to unified when the surface is too narrow", () => {
    expect(renderDiff("@@ -1 +1 @@\n-a\n+b", 80, { sideBySide: true })).toEqual(renderDiff("@@ -1 +1 @@\n-a\n+b", 80));
  });

  it("bounds rows and bytes, including zero-width input", () => {
    const long = "@@ -1 +1 @@\n" + "+x\n".repeat(1000);
    expect(renderSideBySide(long, 120, { maxRows: 20 }).length).toBeLessThanOrEqual(21);
    const zeroWidth = "@@ -1 +1 @@\n+" + "\u200b".repeat(70000);
    const rows = renderSideBySide(zeroWidth, 120, { maxBytes: 1024 }).map(stripAnsi);
    expect(rows.at(-1)).toContain("truncated");
  });

  it("keeps every row inside the width, including wide glyphs", () => {
    const rows = renderSideBySide("@@ -1 +1 @@\n-中文内容\n+中文更新", 120);
    for (const row of rows) expect(visibleWidth(row)).toBeLessThanOrEqual(120);
  });
});
