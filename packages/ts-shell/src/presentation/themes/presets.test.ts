import { expect, it } from "vitest";
import dark from "./dark.json" with { type: "json" };
import light from "./light.json" with { type: "json" };
import darkContrast from "./dark-contrast.json" with { type: "json" };
import lightContrast from "./light-contrast.json" with { type: "json" };
import { parseTheme } from "./schema.js";
import { loadTheme, listThemes } from "./index.js";
import { THEME_COLOR_TOKENS } from "../theme/tokens.js";

it.each([dark, light, darkContrast, lightContrast])("ships a complete, valid $name palette", (preset) => {
  expect(Object.keys(preset.colors).sort()).toEqual([...THEME_COLOR_TOKENS].sort());
  expect(parseTheme(preset, preset.name, dark)).toEqual(preset);
  expect(listThemes()).toContain(preset.name);
  expect(loadTheme(preset.name)?.name).toBe(preset.name);
});

function luminance(hex: string): number {
  const values = hex.slice(1).match(/.{2}/g)!.map((channel) => {
    const value = Number.parseInt(channel, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * values[0]! + 0.7152 * values[1]! + 0.0722 * values[2]!;
}

function contrast(foreground: string, background: string): number {
  const a = luminance(foreground), b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

it.each([[darkContrast, "#000000"], [lightContrast, "#ffffff"]] as const)(
  "keeps contrast preset foregrounds readable on its documented background",
  (preset, background) => {
    for (const [token, color] of Object.entries(preset.colors)) {
      if (token.endsWith("Bg")) continue;
      expect(contrast(color, background), `${preset.name}.${token}`).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(preset.colors.userMessageText, preset.colors.userMessageBg)).toBeGreaterThanOrEqual(7);
    for (const foreground of [preset.colors.text, preset.colors.dim, preset.colors.accent, preset.colors.warning]) {
      expect(contrast(foreground, preset.colors.statusBandBg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(foreground, preset.colors.selectedBg)).toBeGreaterThanOrEqual(4.5);
    }
  },
);


it("ships the approved dark palette and exactly 54 semantic roles", () => {
  expect(THEME_COLOR_TOKENS).toHaveLength(54);
  expect(dark.colors).toMatchObject({
    border: "#178fb9", borderAccent: "#0088fa", borderMuted: "#3d424a", mdHeading: "#febc38",
    text: "default", userMessageText: "default", toolTitle: "default", commandArg: "default",
    statusBandBg: "#121212", scrollbarTrack: "#808080", scrollbarThumb: "#e5e5e5",
    syntaxComment: "#6A9955", syntaxKeyword: "#569CD6", syntaxString: "#CE9178", syntaxNumber: "#B5CEA8",
    syntaxType: "#4EC9B0", syntaxFunction: "#DCDCAA", syntaxVariable: "#9CDCFE", syntaxBuiltin: "#9CDCFE",
    commandFlag: "#569CD6", commandString: "#CE9178", commandNumber: "#B5CEA8",
    mdQuoteText: "#777d88", mdCodeBorder: "#777d88",
    statusLineModel: "#d787af", statusLinePath: "#00afaf", statusLineGitClean: "#5faf5f",
    statusLineGitDirty: "#d7af5f", statusLineContext: "#8787af", mdCodeBlock: "#9CDCFE",
  });
});
