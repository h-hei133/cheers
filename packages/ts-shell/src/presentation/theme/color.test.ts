import { afterEach, expect, it, vi } from "vitest";
import { colorToAnsi, detectColorMode } from "./color.js";
import { Theme, getTheme } from "./theme.js";

afterEach(() => vi.unstubAllEnvs());

it("passes detected capability into named themes", () => {
  vi.stubEnv("COLORTERM", "truecolor");
  expect(getTheme("dark").fg("text", "body")).toMatch(/^\x1b\[38;2;/);
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
