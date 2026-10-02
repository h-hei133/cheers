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
