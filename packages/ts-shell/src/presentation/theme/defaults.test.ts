import { describe, expect, it } from "vitest";
import { colorToAnsi } from "./color.js";
import { Theme } from "./theme.js";
import { wrapToWidth, truncateToWidth } from "../tui/text/layout.js";
import { coalesceAdjacentSgr } from "../tui/text/sgr.js";

// A small independent SGR observer for these basic-color fixtures. Values are
// effective terminal slots, so harmless repeated/default sequences are ignored.
function colors(text: string): Record<string, [number, number]> {
  let fg = 39, bg = 49;
  const result: Record<string, [number, number]> = {};
  for (const match of text.matchAll(/\x1b\[([\d;]*)m|([^\x1b]+)/g)) {
    if (match[1] !== undefined) {
      for (const code of match[1].split(";").map(Number)) {
        if (code === 0) { fg = 39; bg = 49; }
        else if (code >= 30 && code <= 39) fg = code;
        else if (code >= 40 && code <= 49) bg = code;
      }
    } else for (const char of match[2]!) result[char] = [fg, bg];
  }
  return result;
}

const palette = { name: "scopes", description: "", colors: { text: "default", accent: "red", success: "green", selectedBg: "blue", userMessageBg: "default" } };
const theme = new Theme(palette, "16");

describe("explicit terminal defaults", () => {
  it.each(["16", "256", "truecolor", "none"] as const)("encodes defaults in %s without hardcoding terminal RGB", mode => {
    expect(colorToAnsi("default", mode)).toBe(mode === "none" ? "" : "\x1b[39m");
    expect(colorToAnsi("default", mode, true)).toBe(mode === "none" ? "" : "\x1b[49m");
    const plain = new Theme(palette, mode);
    if (mode === "none") expect(plain.bg("userMessageBg", plain.fg("text", "body"))).toBe("body");
  });

  it("restores three nested foreground scopes while keeping the inner default explicit", () => {
    const body = theme.fg("accent", "A" + theme.fg("text", "B" + theme.fg("success", "C") + "D") + "E");
    expect(colors(body)).toEqual({ A: [31, 49], B: [39, 49], C: [32, 49], D: [39, 49], E: [31, 49] });
    expect(colors(coalesceAdjacentSgr(body))).toEqual(colors(body));
  });

  it("keeps foreground and background scopes independent through resets, wrapping and truncation", () => {
    const inner = theme.style("text", "B\x1b[0mC", { bg: "userMessageBg" });
    const body = theme.style("accent", "A" + inner + "D", { bg: "selectedBg" });
    const expected = { A: [31, 44], B: [39, 49], C: [39, 49], D: [31, 44] };
    expect(colors(body)).toEqual(expected);
    const wrapped = wrapToWidth(body, 2).map(row => theme.fg("success", row));
    expect(Object.assign({}, ...wrapped.map(row => colors(coalesceAdjacentSgr(row))))).toEqual(expected);
    expect(colors(theme.fg("success", truncateToWidth(body, 3)))).toMatchObject({ A: [31, 44], B: [39, 49] });
  });
});
