import { describe, it, expect } from "vitest";
import {
  parsePathSelector,
  sliceLinesBySelector,
} from "./selectorParser.js";

describe("Embedded Line Selector Parser", () => {
  it("parses clean path without selectors", () => {
    const res = parsePathSelector("src/index.ts");
    expect(res.cleanPath).toBe("src/index.ts");
    expect(res.hasSelector).toBe(false);
    expect(res.isRaw).toBe(false);
  });

  it("parses line range selector :50-200", () => {
    const res = parsePathSelector("src/index.ts:50-200");
    expect(res.cleanPath).toBe("src/index.ts");
    expect(res.hasSelector).toBe(true);
    expect(res.startLine).toBe(50);
    expect(res.endLine).toBe(200);
  });

  it("parses offset selector :50+100", () => {
    const res = parsePathSelector("src/index.ts:50+100");
    expect(res.cleanPath).toBe("src/index.ts");
    expect(res.hasSelector).toBe(true);
    expect(res.startLine).toBe(50);
    expect(res.endLine).toBe(149);
  });

  it("parses raw modifier :raw", () => {
    const res = parsePathSelector("src/index.ts:raw");
    expect(res.cleanPath).toBe("src/index.ts");
    expect(res.hasSelector).toBe(true);
    expect(res.isRaw).toBe(true);
  });

  it("slices lines accurately according to parsed selector", () => {
    const lines = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}`);
    const selector = parsePathSelector("file.ts:10-20");
    const sliced = sliceLinesBySelector(lines, selector);

    expect(sliced.selectedLines.length).toBe(11); // 10 to 20 inclusive
    expect(sliced.startLine).toBe(10);
    expect(sliced.endLine).toBe(20);
    expect(sliced.selectedLines[0]).toBe("Line 10");
    expect(sliced.selectedLines[10]).toBe("Line 20");
  });
});
