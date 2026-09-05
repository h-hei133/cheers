import { describe, expect, it } from "vitest";
import { createUnifiedDiff, renderDiff } from "./diff.js";
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

describe("createUnifiedDiff", () => {
  it("returns empty string when content is identical", () => {
    expect(createUnifiedDiff("a.ts", "hello\n", "hello\n")).toBe("");
  });

  it("produces standard unified diff with additions and deletions", () => {
    const diff = createUnifiedDiff("src/app.ts", "const x = 1;\nconst y = 2;\n", "const x = 1;\nconst y = 20;\n");
    expect(diff).toContain("--- a/src/app.ts");
    expect(diff).toContain("+++ b/src/app.ts");
    expect(diff).toContain("-const y = 2;");
    expect(diff).toContain("+const y = 20;");
  });
});
