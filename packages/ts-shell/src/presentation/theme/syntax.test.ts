import { expect, it, vi } from "vitest";
import { highlightCode } from "./syntax.js";
import { Theme } from "./theme.js";
import { getDefaultTheme } from "../themes/index.js";
import { stripAnsi } from "../tui/text/ansi.js";

const theme = new Theme(getDefaultTheme(), "truecolor");

it.each([
  ["js", "const value = 42;", "const"],
  ["ts", "interface Value { size: number }", "interface"],
  ["python", "def run():\n    return True", "def"],
  ["sh", 'echo "hello"', '"hello"'],
  ["zsh", 'echo "hello"', '"hello"'],
  ["json", '{"value": 42}', '"value"'],
])("highlights explicit %s grammar without changing source", (language, code, token) => {
  const output = highlightCode(code, language, theme);
  expect(stripAnsi(output)).toBe(code);
  expect(output).toContain(`${token}\x1b[39m`);
  expect(output).toContain("\x1b[38;2;");
});

it("carries multiline lexical context but closes color before each newline", () => {
  const output = highlightCode("/* first\nsecond */\nconst x = 1;", "js", theme).split("\n");
  expect(output[0]).toBe(theme.fg("muted", "/* first"));
  expect(output[1]).toBe(theme.fg("muted", "second */"));
  expect(output[2]).toContain(theme.fg("commandFlag", "const"));
});

it.each(["xml", "js", "python"])("decodes escaped source exactly for %s", (language) => {
  const code = '<span class="hljs-keyword">&amp; < > " \'</span>\n\t😀中文';
  expect(stripAnsi(highlightCode(code, language, theme))).toBe(code);
});

it("leaves unknown, unlabelled and oversized blocks untouched", () => {
  for (const language of ["unknown", ""]) {
    expect(highlightCode("const x = 1;", language, theme)).toBe("const x = 1;");
  }
  const code = "x".repeat(65_537);
  expect(highlightCode(code, "js", theme)).toBe(code);
});

it("falls back to source if rendering fails", () => {
  const broken = new Theme(getDefaultTheme());
  vi.spyOn(broken, "fg").mockImplementation(() => { throw new Error("unavailable"); });
  expect(highlightCode("const x = 1;", "js", broken)).toBe("const x = 1;");
});

it.each(["none", "16", "256", "truecolor"] as const)("uses the theme's %s encoding", (mode) => {
  const code = "const x = 1;";
  const palette = new Theme(getDefaultTheme(), mode);
  const output = highlightCode(code, "js", palette);
  expect(stripAnsi(output)).toBe(code);
  expect(output).toContain(palette.fg("commandFlag", "const"));
  if (mode === "none") expect(output).toBe(code);
});
