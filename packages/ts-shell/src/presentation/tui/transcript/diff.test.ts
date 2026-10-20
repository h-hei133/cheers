import { describe, expect, it } from "vitest";
import { createUnifiedDiff, renderDiff, renderSideBySide } from "./diff.js";
import { stripAnsi } from "../text/ansi.js";
import { visibleWidth } from "../text/measure.js";
import { defaultTheme } from "../../theme/theme.js";
import { getDefaultTheme } from "../../themes/index.js";

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

  it("keeps emoji graphemes intact when adding emphasis", () => {
    const rows = renderDiff("-a🙂x\n+a🙃x", WIDTH).map(stripAnsi);
    expect(rows[0]).toContain("a🙂x");
    expect(rows[1]).toContain("a🙃x");
    for (const row of rows) expect(Buffer.from(row, "utf8").toString("utf8")).not.toContain("�");
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

  it("bounds unified rows and bytes independently", () => {
    const long = "+x\n".repeat(1000);
    const rows = renderDiff(long, WIDTH, { maxRows: 21 });
    expect(rows).toHaveLength(21);
    expect(stripAnsi(rows.at(-1)!)).toContain("truncated");
    const zeroWidth = "+" + "\u200b".repeat(70000);
    expect(stripAnsi(renderDiff(zeroWidth, WIDTH, { maxBytes: 1024 }).at(-1)!)).toContain("truncated");
  });

  it("keeps an exactly filled row budget without a false truncation marker", () => {
    const rows = renderDiff("-old\n+new", WIDTH, { maxRows: 2 }).map(stripAnsi);
    expect(rows).toEqual(["-old", "+new"]);
  });

  it("treats maxBytes as the exact UTF-8 input boundary", () => {
    expect(renderDiff("-a\n+b", WIDTH, { maxBytes: 5 }).map(stripAnsi)).toEqual(["-a", "+b"]);
    expect(stripAnsi(renderDiff("-a\n+b", WIDTH, { maxBytes: 4 }).at(-1)!)).toContain("truncated");
  });

  it.each([
    ["UTF-8 emoji", "-🙂\n+🙃"],
    ["CRLF", "-old\r\n+new\r\n"],
    ["trailing newline", "-a\n+b\n"],
  ])("keeps the exact %s boundary without truncation", (_name, input) => {
    const exact = Buffer.byteLength(input, "utf8");
    expect(stripAnsi(renderDiff(input, WIDTH, { maxBytes: exact }).at(-1)!)).not.toContain("truncated");
    expect(stripAnsi(renderDiff(input, WIDTH, { maxBytes: exact - 1 }).at(-1)!)).toContain("truncated");
  });

  it("keeps file headers out of removed/added emphasis", () => {
    defaultTheme.apply(getDefaultTheme(), "truecolor");
    try {
      const rows = renderDiff("--- a/file.txt\n+++ b/file.txt", WIDTH);
      expect(rows[0]).toContain(defaultTheme.fg("muted", "--- a/file.txt"));
      expect(rows[1]).toContain(defaultTheme.fg("muted", "+++ b/file.txt"));
      expect(rows.join("")).not.toContain("\x1b[7m");
    } finally {
      defaultTheme.apply(getDefaultTheme(), "none");
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
    expect(renderSideBySide(long, 120, { maxRows: 20 }).length).toBeLessThanOrEqual(20);
    const zeroWidth = "@@ -1 +1 @@\n+" + "\u200b".repeat(70000);
    const rows = renderSideBySide(zeroWidth, 120, { maxBytes: 1024 }).map(stripAnsi);
    expect(rows.at(-1)).toContain("truncated");
  });

  it("marks the row budget even when the next row would exceed it", () => {
    const rows = renderSideBySide("@@ -1,2 +1,2 @@\n-a\n-b\n+x\n+y", 120, { maxRows: 2 }).map(stripAnsi);
    expect(rows).toHaveLength(2);
    expect(rows.at(-1)).toContain("truncated");
  });

  it("treats maxBytes as the exact UTF-8 input boundary", () => {
    const exact = renderSideBySide("-a\n+b", 120, { maxBytes: 5 }).map(stripAnsi);
    expect(exact).toHaveLength(1);
    expect(exact[0]).not.toContain("truncated");
    expect(renderSideBySide("-a\n+b", 120, { maxBytes: 4 }).map(stripAnsi).at(-1)).toContain("truncated");
  });

  it.each([
    ["UTF-8 emoji", "-🙂\n+🙃"],
    ["CRLF", "-old\r\n+new\r\n"],
    ["trailing newline", "-a\n+b\n"],
  ])("keeps the exact %s boundary without truncation", (_name, input) => {
    const exact = Buffer.byteLength(input, "utf8");
    expect(renderSideBySide(input, 120, { maxBytes: exact }).map(stripAnsi).at(-1)).not.toContain("truncated");
    expect(renderSideBySide(input, 120, { maxBytes: exact - 1 }).map(stripAnsi).at(-1)).toContain("truncated");
  });

  it("stops a removed run before the next file header", () => {
    const rows = renderSideBySide("-old\n--- a/next.txt\n+++ b/next.txt", 120).map(stripAnsi);
    expect(rows).toHaveLength(3);
    expect(rows[1]).toBe("--- a/next.txt");
    expect(rows[2]).toBe("+++ b/next.txt");
  });

  it("keeps every row inside the width, including wide glyphs", () => {
    const rows = renderSideBySide("@@ -1 +1 @@\n-中文内容\n+中文更新", 120);
    for (const row of rows) expect(visibleWidth(row)).toBeLessThanOrEqual(120);
  });
});

describe("diff facts", () => {
  it("records a pure rename even when the content is unchanged", () => {
    const diff = createUnifiedDiff("new.txt", "same", "same", {
      oldPath: "old.txt",
      newPath: "new.txt",
    });
    expect(diff).toContain("rename from old.txt");
    expect(diff).toContain("rename to new.txt");
    expect(renderDiff(diff, WIDTH).map(stripAnsi)).toEqual(["rename from old.txt", "rename to new.txt"]);
  });

  it("records rename, BOM, line-ending, and EOF facts", () => {
    const diff = createUnifiedDiff("new.txt", "\uFEFFold\r\n", "new", {
      oldPath: "old.txt",
      newPath: "new.txt",
    });
    expect(diff).toContain("rename from old.txt");
    expect(diff).toContain("rename to new.txt");
    expect(diff).toContain("BOM: old=present, new=absent");
    expect(diff).toContain("EOL: old=CRLF, new=none");
    expect(diff).toContain("No newline at end of file");
  });
});
