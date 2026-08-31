import { describe, it, expect } from "vitest";
import { truncateToVisualLines } from "./visualTruncate.js";

describe("Visual Line Wrapping Truncator", () => {
  it("keeps short lines intact without wrapping or truncation", () => {
    const text = "short line 1\nshort line 2";
    const res = truncateToVisualLines(text, 10, 80);
    expect(res.skippedCount).toBe(0);
    expect(res.visualLines.length).toBe(2);
  });

  it("wraps long lines exceeding terminal width", () => {
    const longLine = "a".repeat(100);
    const res = truncateToVisualLines(longLine, 10, 40);
    // 100 chars at 40 width wraps to 3 lines (40 + 40 + 20)
    expect(res.visualLines.length).toBe(3);
    expect(res.skippedCount).toBe(0);
  });

  it("truncates lines exceeding maxVisualLines and reports skippedCount", () => {
    const lines = Array.from({ length: 20 }, (_, i) => `Line ${i + 1}`).join("\n");
    const res = truncateToVisualLines(lines, 5, 80);
    expect(res.visualLines.length).toBe(5);
    expect(res.skippedCount).toBe(15);
    expect(res.visualLines[4]).toBe("Line 20");
  });
});
