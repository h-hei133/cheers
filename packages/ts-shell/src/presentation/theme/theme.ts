/**
 * Semantic Theme Engine & ANSI Downsampling Palette
 *
 * Implements:
 * 1. Semantic Color Tokens (toolTitle, diffAdded, diffRemoved, syntax, etc.)
 * 2. Theme loading from JSON config files
 * 3. ANSI color escape sequences
 */

import { loadTheme, getDefaultTheme, type ThemeConfig } from "../themes/index.js";

export type ThemeColorToken =
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
  | "success"
  | "error"
  | "warning"
  | "muted"
  | "dim"
  | "accent"
  | "border"
  | "selectedBg"
  | "userMessageBg"
  | "toolPendingBg"
  | "toolSuccessBg"
  | "toolErrorBg"
  | "syntaxKeyword"
  | "syntaxFunction"
  | "syntaxString"
  | "syntaxComment";

export class Theme {
  readonly name: string;
  private readonly colors: Map<ThemeColorToken, string>;

  constructor(theme: ThemeConfig) {
    this.name = theme.name;
    this.colors = new Map(Object.entries(theme.colors) as [ThemeColorToken, string][]);
  }

  fg(token: ThemeColorToken, text: string): string {
    const color = this.colors.get(token) ?? "#ffffff";
    return this.colorToAnsi(color) + text + "\x1b[0m";
  }

  bg(token: ThemeColorToken, text: string): string {
    const color = this.colors.get(token) ?? "#000000";
    return this.colorToAnsiBg(color) + text + "\x1b[0m";
  }

  /** The opening sequence alone, for rows that re-open the shade after resets. */
  bgOpen(token: ThemeColorToken): string {
    const color = this.colors.get(token) ?? "#000000";
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
    // Handle hex colors
    if (color.startsWith("#")) {
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);
      // Try to find closest 256 color
      const index = this.closestColor(r, g, b);
      if (index < 16) {
        return `\x1b[3${index}m`;
      }
      return `\x1b[38;5;${index}m`;
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
    return "\x1b[37m"; // fallback to white
  }

  private colorToAnsiBg(color: string): string {
    if (color.startsWith("#")) {
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);
      const index = this.closestColor(r, g, b);
      if (index < 16) {
        return `\x1b[4${index}m`;
      }
      return `\x1b[48;5;${index}m`;
    }
    return "\x1b[40m"; // fallback to black
  }

  private closestColor(r: number, g: number, b: number): number {
    // Simple mapping: keep values in 16-231 range (256-color palette)
    const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
    const rn = Math.round(clamp(r) / 255 * 5);
    const gn = Math.round(clamp(g) / 255 * 5);
    const bn = Math.round(clamp(b) / 255 * 5);
    // 256-color palette offset + index
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
