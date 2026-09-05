/**
 * Semantic Theme Engine & ANSI Downsampling Palette
 *
 * Implements:
 * 1. Semantic Color Tokens (toolTitle, diffAdded, diffRemoved, syntax, etc.)
 * 2. Theme loading from JSON config files
 * 3. Truecolor where the terminal supports it, 256/16-color downsampling otherwise
 */

import { loadTheme, getDefaultTheme, type ThemeConfig } from "../themes/index.js";
import { detectTerminalCapabilities } from "../tui/terminalCapabilities.js";

export type ThemeColorToken =
  | "text"
  | "userMessageText"
  | "assistantText"
  | "thinkingText"
  | "toolTitle"
  | "toolOutput"
  | "diffAdded"
  | "diffRemoved"
  | "diffContext"
  | "filename"
  | "command"
  | "commandArg"
  | "commandFlag"
  | "commandString"
  | "commandNumber"
  | "commandPipe"
  | "mdHeading"
  | "mdCode"
  | "mdLink"
  | "success"
  | "error"
  | "warning"
  | "muted"
  | "dim"
  | "accent"
  | "border"
  | "borderAccent"
  | "borderMuted"
  | "selectedBg"
  | "userMessageBg"
  | "toolPendingBg"
  | "toolSuccessBg"
  | "toolErrorBg"
  | "syntaxKeyword"
  | "syntaxFunction"
  | "syntaxVariable"
  | "syntaxString"
  | "syntaxNumber"
  | "syntaxComment"
  | "syntaxOperator";

interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export class Theme {
  readonly name: string;
  private readonly colors: Map<ThemeColorToken, string>;
  private readonly truecolor: boolean;

  constructor(theme: ThemeConfig, truecolor = detectTerminalCapabilities().hasTrueColor) {
    this.name = theme.name;
    this.truecolor = truecolor;
    this.colors = new Map(Object.entries(theme.colors) as [ThemeColorToken, string][]);
  }

  fg(token: ThemeColorToken, text: string): string {
    const color = this.colors.get(token) ?? "#d4d4d4";
    return this.colorToAnsi(color) + text + "\x1b[0m";
  }

  bg(token: ThemeColorToken, text: string): string {
    return this.bgOpen(token) + text + "\x1b[0m";
  }

  /** The opening sequence alone, for rows that re-open the shade after resets. */
  bgOpen(token: ThemeColorToken): string {
    const color = this.colors.get(token) ?? "#1a1a1a";
    return this.colorToAnsiBg(color);
  }

  inverse(text: string): string {
    return "\x1b[7m" + text + "\x1b[27m";
  }

  bold(text: string): string {
    return "\x1b[1m" + text + "\x1b[22m";
  }

  dim(text: string): string {
    return "\x1b[2m" + text + "\x1b[22m";
  }

  private colorToAnsi(color: string): string {
    if (color.startsWith("#")) {
      const parsed = this.parseHex(color);
      if (!parsed) return "\x1b[39m";
      if (this.truecolor) {
        return `\x1b[38;2;${parsed.r};${parsed.g};${parsed.b}m`;
      }
      const index = this.closestColor(parsed.r, parsed.g, parsed.b);
      return index < 8 ? `\x1b[${30 + index}m` : `\x1b[38;5;${index}m`;
    }
    // Handle ANSI color names
    const ansiMap: Record<string, string> = {
      "black": "30",
      "red": "31",
      "green": "32",
      "yellow": "33",
      "blue": "34",
      "magenta": "35",
      "cyan": "36",
      "white": "37",
      "brightblack": "90",
      "brightred": "91",
      "brightgreen": "92",
      "brightyellow": "93",
      "brightblue": "94",
      "brightmagenta": "95",
      "brightcyan": "96",
      "brightwhite": "97",
    };
    const ansi = ansiMap[color.toLowerCase()];
    if (ansi) return `\x1b[${ansi}m`;
    return "\x1b[39m"; // default foreground
  }

  private colorToAnsiBg(color: string): string {
    if (color.startsWith("#")) {
      const parsed = this.parseHex(color);
      if (!parsed) return "\x1b[49m";
      if (this.truecolor) {
        return `\x1b[48;2;${parsed.r};${parsed.g};${parsed.b}m`;
      }
      const index = this.closestColor(parsed.r, parsed.g, parsed.b);
      return index < 8 ? `\x1b[${40 + index}m` : `\x1b[48;5;${index}m`;
    }
    return "\x1b[49m";
  }

  private parseHex(color: string): Rgb | undefined {
    const body = color.slice(1);
    if (!/^[0-9a-fA-F]{6}$/.test(body)) return undefined;
    return {
      r: parseInt(body.slice(0, 2), 16),
      g: parseInt(body.slice(2, 4), 16),
      b: parseInt(body.slice(4, 6), 16),
    };
  }

  private closestColor(r: number, g: number, b: number): number {
    // Grayscale ramp (232-255) for dark/light neutrals, preventing blue tint
    const maxDiff = Math.max(Math.abs(r - g), Math.abs(r - b), Math.abs(g - b));
    if (maxDiff < 12) {
      const avg = (r + g + b) / 3;
      if (avg < 4) return 16;
      if (avg > 248) return 231;
      return Math.round(232 + ((avg - 8) / 240) * 23);
    }
    const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
    const rn = Math.min(5, Math.max(0, Math.round((clamp(r) / 255) * 5)));
    const gn = Math.min(5, Math.max(0, Math.round((clamp(g) / 255) * 5)));
    const bn = Math.min(5, Math.max(0, Math.round((clamp(b) / 255) * 5)));
    return 16 + rn * 36 + gn * 6 + bn;
  }
}

let currentTheme: Theme | undefined;

export function getTheme(name: string): Theme {
  if (name === "default") return defaultTheme;
  const config = loadTheme(name);
  if (!config) {
    throw new Error(`Theme not found: ${name}`);
  }
  return new Theme(config);
}

export function setTheme(name: string): void {
  currentTheme = getTheme(name);
}

export function getDefaultThemeInstance(): Theme {
  return defaultTheme;
}

export const defaultTheme = new Theme(getDefaultTheme());
