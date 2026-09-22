import { describe, it, expect } from "vitest";
import { defaultTheme, Theme, getTheme } from "./theme.js";
import { listThemes } from "../themes/index.js";

describe("Semantic Theme Engine", () => {
  it("formats text with semantic foreground color tokens", () => {
    const output = defaultTheme.fg("success", "Build passing");
    expect(output).toContain("Build passing");
    expect(output.startsWith("\x1b[")).toBe(true);
    expect(output.endsWith("\x1b[0m")).toBe(true);
  });

  it("formats backgrounds and inverse text styles", () => {
    const inv = defaultTheme.inverse("diff-word");
    expect(inv).toContain("\x1b[7m");
    expect(inv).toContain("diff-word");

    const bg = defaultTheme.bg("toolSuccessBg", "OK");
    expect(bg).toContain("OK");
  });

  it("allows loading a custom theme config", () => {
    const custom = new Theme({ name: "custom", description: "", colors: { success: "#00ff00" } });
    const output = custom.fg("success", "Custom green");
    expect(output).toContain("Custom green");
    expect(output.startsWith("\x1b[")).toBe(true);
  });

  it("lists available themes", () => {
    const themes = listThemes();
    expect(themes).toContain("dark");
    expect(themes).toContain("light");
  });

  it("loads theme by name", () => {
    const dark = getTheme("dark");
    const light = getTheme("light");
    expect(dark.name).toBe("dark");
    expect(light.name).toBe("light");
  });

  it("has diff tokens with different colors", () => {
    const added = defaultTheme.fg("diffAdded", "+ line");
    const removed = defaultTheme.fg("diffRemoved", "- line");
    expect(added).not.toBe(removed);
  });

  it("has filename token (blue)", () => {
    const filename = defaultTheme.fg("filename", "test.ts");
    expect(filename).toContain("test.ts");
  });
});
