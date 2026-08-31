import { describe, it, expect } from "vitest";
import { defaultTheme, Theme } from "./theme.js";

describe("Semantic Theme Engine", () => {
  it("formats text with semantic foreground color tokens", () => {
    const output = defaultTheme.fg("success", "Build passing");
    expect(output).toContain("Build passing");
    expect(output.startsWith("\x1b[32m")).toBe(true);
    expect(output.endsWith("\x1b[0m")).toBe(true);
  });

  it("formats backgrounds and inverse text styles", () => {
    const inv = defaultTheme.inverse("diff-word");
    expect(inv).toContain("\x1b[7m");
    expect(inv).toContain("diff-word");

    const bg = defaultTheme.bg("toolSuccessBg", "OK");
    expect(bg).toContain("\x1b[42m");
  });

  it("allows overriding custom theme maps", () => {
    const custom = new Theme({ success: "\x1b[92m" });
    const output = custom.fg("success", "Custom green");
    expect(output).toContain("\x1b[92m");
  });
});
