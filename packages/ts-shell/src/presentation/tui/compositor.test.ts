import { describe, it, expect } from "vitest";
import { compositeTuiLine, stripAnsi, visibleWidth } from "./compositor.js";

describe("2D Viewport Compositor", () => {
  it("computes visible width ignoring ANSI escape codes", () => {
    const styled = "\x1b[31mRed Text\x1b[0m";
    expect(visibleWidth(styled)).toBe(8);
    expect(stripAnsi(styled)).toBe("Red Text");
  });

  it("composites floating overlay over base line without shifting indices", () => {
    const baseLine = "Line 1: const x = 10; // background code";
    const overlay = "[Autocomplete Dropdown]";
    const composited = compositeTuiLine(baseLine, overlay, 8, 23, 50);

    const stripped = stripAnsi(composited);
    expect(stripped.startsWith("Line 1: ")).toBe(true);
    expect(stripped).toContain("[Autocomplete Dropdown]");
  });
});
