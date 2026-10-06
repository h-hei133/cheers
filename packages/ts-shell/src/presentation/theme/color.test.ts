import { afterEach, expect, it, vi } from "vitest";
import { colorToAnsi, detectColorMode } from "./color.js";
import { Theme, getTheme } from "./theme.js";

afterEach(() => vi.unstubAllEnvs());

it("passes detected capability into named themes", () => {
  vi.stubEnv("FORCE_COLOR", "3");
  vi.stubEnv("COLORTERM", "truecolor");
  expect(getTheme("dark").fg("accent", "body")).toMatch(/^\x1b\[38;2;/);
});

it.each([
  ["", "16"], ["0", "none"], ["false", "none"], ["1", "16"],
  ["true", "16"], ["2", "256"], ["3", "truecolor"], ["invalid", "none"],
] as const)("honors FORCE_COLOR=%s before NO_COLOR", (force, expected) => {
  expect(detectColorMode({ FORCE_COLOR: force, NO_COLOR: "1", COLORTERM: "truecolor" })).toBe(expected);
});

it("honors nonempty NO_COLOR without removing text attributes", () => {
  expect(detectColorMode({ NO_COLOR: "0", COLORTERM: "truecolor" })).toBe("none");
  expect(detectColorMode({ NO_COLOR: "", COLORTERM: "truecolor" })).toBe("truecolor");
  const theme = new Theme({ name: "plain", description: "", colors: { text: "#123456", selectedBg: "#ffffff" } }, "none");
  expect(theme.fg("text", "body")).toBe("body");
  expect(theme.bg("selectedBg", "body")).toBe("body");
  expect(theme.style("text", "body", { bg: "selectedBg", bold: true })).toBe("\x1b[1mbody\x1b[22m");
});

it("detects and encodes truecolor without quantizing RGB channels", () => {
  expect(detectColorMode({ COLORTERM: "truecolor" })).toBe("truecolor");
  expect(detectColorMode({ TERM: "xterm-256color" })).toBe("256");
  expect(colorToAnsi("#123456", "truecolor")).toBe("\x1b[38;2;18;52;86m");
  expect(colorToAnsi("#123456", "truecolor", true)).toBe("\x1b[48;2;18;52;86m");
  expect(colorToAnsi("#ff0000", "256")).toBe("\x1b[38;5;196m");
});

it("supports real basic colors for foreground and background", () => {
  expect(colorToAnsi("#ff0000", "16")).toBe("\x1b[91m");
  expect(colorToAnsi("#ff0000", "16", true)).toBe("\x1b[101m");
  expect(colorToAnsi("blue", "256", true)).toBe("\x1b[44m");
});

it("invalidates cached theme output when the color mode changes", () => {
  const config = { name: "test", description: "", colors: { text: "#123456" } };
  const theme = new Theme(config, "256");
  const previous = theme.colorRevision;
  theme.apply(config, "truecolor");
  expect(theme.fg("text", "value")).toBe("\x1b[38;2;18;52;86mvalue\x1b[39m");
  expect(theme.colorRevision).toBeGreaterThan(previous);
});
