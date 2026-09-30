import { detectTerminalCapabilities } from "../tui/terminalCapabilities.js";

export type ColorMode = "none" | "16" | "256" | "truecolor";

export const COLOR_NAMES = [
  "black", "red", "green", "yellow", "blue", "magenta", "cyan", "white",
  "brightblack", "brightred", "brightgreen", "brightyellow", "brightblue", "brightmagenta", "brightcyan", "brightwhite",
] as const;

const BASIC_RGB = [
  [0, 0, 0], [128, 0, 0], [0, 128, 0], [128, 128, 0],
  [0, 0, 128], [128, 0, 128], [0, 128, 128], [192, 192, 192],
  [128, 128, 128], [255, 0, 0], [0, 255, 0], [255, 255, 0],
  [0, 0, 255], [255, 0, 255], [0, 255, 255], [255, 255, 255],
] as const;

export function detectColorMode(env: NodeJS.ProcessEnv = process.env): ColorMode {
  // Explicit overrides take precedence over passive capability detection.
  switch (env.FORCE_COLOR?.toLowerCase()) {
    case "0": case "false": return "none";
    case "": case "1": case "true": return "16";
    case "2": return "256";
    case "3": return "truecolor";
  }
  if (env.NO_COLOR) return "none";
  return detectTerminalCapabilities(env).hasTrueColor ? "truecolor" : "256";
}

function indexedColor(r: number, g: number, b: number): number {
  const spread = Math.max(Math.abs(r - g), Math.abs(r - b), Math.abs(g - b));
  if (spread < 12) {
    const average = (r + g + b) / 3;
    if (average < 4) return 16;
    if (average > 248) return 231;
    return Math.round(232 + ((average - 8) / 240) * 23);
  }
  return 16 + 36 * Math.round(r / 255 * 5) + 6 * Math.round(g / 255 * 5) + Math.round(b / 255 * 5);
}

function basicColor(r: number, g: number, b: number): number {
  let nearest = 0;
  let distance = Infinity;
  for (let index = 0; index < BASIC_RGB.length; index++) {
    const [red, green, blue] = BASIC_RGB[index]!;
    const candidate = (r - red) ** 2 + (g - green) ** 2 + (b - blue) ** 2;
    if (candidate < distance) { distance = candidate; nearest = index; }
  }
  return nearest;
}

/** One encoder for foreground and background, with explicit terminal capability. */
export function colorToAnsi(color: string, mode: ColorMode, background = false): string {
  if (mode === "none") return "";
  const named = COLOR_NAMES.indexOf(color.toLowerCase() as typeof COLOR_NAMES[number]);
  let index = named;
  if (/^#[\da-f]{6}$/i.test(color)) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    const channel = background ? 48 : 38;
    if (mode === "truecolor") return `\x1b[${channel};2;${r};${g};${b}m`;
    if (mode === "256") return `\x1b[${channel};5;${indexedColor(r, g, b)}m`;
    index = basicColor(r, g, b);
  }
  if (index < 0) index = background ? 0 : 7;
  const base = index < 8 ? (background ? 40 : 30) : (background ? 100 : 90);
  return `\x1b[${base + index % 8}m`;
}
