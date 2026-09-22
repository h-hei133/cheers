import { describe, it, expect } from "vitest";
import {
  truncateHead,
  truncateTail,
  truncateLineWidth,
} from "./truncation.js";

describe("Directional Dual-Budget Truncator", () => {
  it("keeps content unchanged within line and byte limits", () => {
    const text = "line 1\nline 2\nline 3";
    const res = truncateHead(text, { maxLines: 10, maxBytes: 1024 });
    expect(res.truncated).toBe(false);
    expect(res.content).toBe(text);
  });

  it("applies head truncation keeping initial lines", () => {
    const lines = Array.from({ length: 50 }, (_, i) => `Line ${i + 1}`);
    const text = lines.join("\n");
    const res = truncateHead(text, { maxLines: 10, maxBytes: 1024 });
    expect(res.truncated).toBe(true);
    expect(res.direction).toBe("head");
    expect(res.shownLines).toBe(10);
    expect(res.content.startsWith("Line 1\nLine 2")).toBe(true);
  });

  it("applies tail truncation keeping ending lines (ideal for bash logs)", () => {
    const lines = Array.from({ length: 50 }, (_, i) => `Line ${i + 1}`);
    const text = lines.join("\n");
    const res = truncateTail(text, { maxLines: 10, maxBytes: 1024 });
    expect(res.truncated).toBe(true);
    expect(res.direction).toBe("tail");
    expect(res.shownLines).toBe(10);
    expect(res.content.endsWith("Line 49\nLine 50")).toBe(true);
  });

  it("truncates line width to prevent giant minified strings", () => {
    const giantLine = "a".repeat(1000);
    const safe = truncateLineWidth(giantLine, 50);
    expect(safe.length).toBe(64); // 50 + " … [truncated]" (14 chars)
    expect(safe.endsWith(" … [truncated]")).toBe(true);
  });
});
