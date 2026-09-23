import { describe, expect, it } from "vitest";
import darkJson from "../themes/dark.json" with { type: "json" };
import lightJson from "../themes/light.json" with { type: "json" };
import { Theme, defaultTheme, getTheme, type ThemeColorToken } from "../theme/theme.js";
import { listThemes } from "../themes/index.js";

/**
 * The palette, and the promise that a theme is usable.
 *
 * A theme missing tokens is not a cosmetic problem. `Theme.apply` replaces the
 * color map wholesale, so a token the theme omits falls back to a hardcoded
 * white — which on the light theme meant body text rendered white on a
 * near-white background. The assertion below is what makes "the theme loads"
 * different from "the theme can be read".
 */
const ALL_TOKENS: readonly ThemeColorToken[] = Object.keys(darkJson.colors) as ThemeColorToken[];

describe("built-in themes", () => {
  it("define every token the palette has", () => {
    // Not "defines some tokens": the union is the contract, and a theme that
    // covers part of it renders the rest as whatever the fallback happens to be.
    for (const [name, theme] of [["dark", darkJson], ["light", lightJson]] as const) {
      const missing = ALL_TOKENS.filter((token) => !(token in theme.colors));
      expect(missing, `${name} is missing ${missing.join(", ")}`).toEqual([]);
    }
  });

  it("define no token the palette does not have", () => {
    // A typo in a theme file would otherwise sit there doing nothing.
    for (const [name, theme] of [["dark", darkJson], ["light", lightJson]] as const) {
      const unknown = Object.keys(theme.colors).filter(
        (token) => !ALL_TOKENS.includes(token as ThemeColorToken),
      );
      expect(unknown, `${name} has unknown ${unknown.join(", ")}`).toEqual([]);
    }
  });

  it("renders body text in something other than the missing-token fallback", () => {
    // The specific defect: `text` was absent from light, and the fallback is
    // pure white. Asserting the rendered sequence rather than the token list is
    // what ties the palette to what a reader actually sees.
    // `#ffffff` is what `fg` falls back to for a token the theme does not
    // define, so it is the exact sequence the defect produced.
    const FALLBACK_WHITE = "\x1b[38;5;231m";
    const light = new Theme(lightJson).fg("text", "x");
    const dark = new Theme(darkJson).fg("text", "x");

    expect(light).not.toContain(FALLBACK_WHITE);
    expect(dark).not.toContain(FALLBACK_WHITE);
    // And the two themes are distinguishable from each other.
    expect(light).not.toBe(dark);
  });
});

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

describe("recoloring in place", () => {
  it("reports a new revision when the palette changes", () => {
    // Rendered rows are memoised, and a theme is recolored in place, so a cache
    // that keys only on width keeps serving rows in the old colors. The revision
    // is what lets a cache notice the palette moved.
    const theme = new Theme({ name: "a", colors: { text: "#111111" } as never });
    const before = theme.colorRevision;
    theme.apply({ name: "b", colors: { text: "#222222" } as never });
    expect(theme.colorRevision).toBeGreaterThan(before);
  });

  it("never moves the revision backwards, so a stale row cannot look current", () => {
    const theme = new Theme({ name: "a", colors: { text: "#111111" } as never });
    const seen = [theme.colorRevision];
    theme.apply({ name: "b", colors: { text: "#222222" } as never });
    seen.push(theme.colorRevision);
    theme.apply({ name: "a", colors: { text: "#111111" } as never });
    seen.push(theme.colorRevision);

    expect([...seen].sort((left, right) => left - right)).toEqual(seen);
    expect(new Set(seen).size).toBe(seen.length);
  });
});
