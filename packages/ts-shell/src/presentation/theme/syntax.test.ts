import { expect, it, vi } from "vitest";
import { highlightCode } from "./syntax.js";
import { Theme } from "./theme.js";
import { parseTheme } from "../themes/schema.js";
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
  expect(output[0]).toBe(theme.fg("syntaxComment", "/* first"));
  expect(output[1]).toBe(theme.fg("syntaxComment", "second */"));
  expect(output[2]).toContain(theme.fg("syntaxKeyword", "const"));
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

it("skips scope rendering when colors are disabled", () => {
  const plain = new Theme(getDefaultTheme(), "none");
  const render = vi.spyOn(plain, "fg");
  const code = "const value = 42;\n".repeat(2000);
  expect(highlightCode(code, "js", plain)).toBe(code);
  expect(render).not.toHaveBeenCalled();
});

it.each(["none", "16", "256", "truecolor"] as const)("uses the theme's %s encoding", (mode) => {
  const code = "const x = 1;";
  const palette = new Theme(getDefaultTheme(), mode);
  const output = highlightCode(code, "js", palette);
  expect(stripAnsi(output)).toBe(code);
  expect(output).toContain(palette.fg("syntaxKeyword", "const"));
  if (mode === "none") expect(output).toBe(code);
});


it.each([
  ["syntaxKeyword", "js", "const value = 42;", "const"],
  ["syntaxString", "js", 'const value = "hello";', '"hello"'],
  ["syntaxNumber", "js", "const value = 42;", "42"],
  ["syntaxComment", "js", "/* note */", "/* note */"],
  ["syntaxFunction", "python", "def run(arg): return True", "run"],
  ["syntaxType", "c", "int main() {}", "int"],
  ["syntaxVariable", "json", '{"field": 42}', '"field"'],
  ["syntaxMeta", "c", "#include <stdio.h>", "#"],
  ["syntaxBuiltin", "python", "print(42)", "print"],
  ["syntaxText", "js", "const value = 42;", " value = "],
] as const)("uses %s independently of command and chrome colors", (token, language, code, word) => {
  const base = getDefaultTheme();
  const custom = new Theme({ ...base, colors: { ...base.colors, [token]: "#123456" } }, "truecolor");
  const output = highlightCode(code, language, custom);
  expect(stripAnsi(output)).toBe(code);
  expect(output).toContain(custom.fg(token, word));
});


it("preserves legacy parameter and nested variable colors", () => {
  const legacy = parseTheme({ colors: { text: "#123456", filename: "#abcdef", commandString: "#778899" } }, "legacy", getDefaultTheme());
  const palette = new Theme(legacy, "truecolor");
  expect(highlightCode("def run(arg): return arg", "python", palette)).toContain(palette.fg("text", "arg"));
  expect(highlightCode('echo "$HOME"', "bash", palette)).toContain(palette.fg("commandString", "$HOME"));
});
