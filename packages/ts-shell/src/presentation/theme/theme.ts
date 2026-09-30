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
  | "text"
  | "userMessageText"
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
  | "statusBandBg"
  | "scrollbarTrack"
  | "scrollbarThumb";

/**
 * Every token, as a runtime value.
 *
 * The union above is a type and has no runtime presence, so anything that has to
 * check the palette at runtime — or check that every declared token has a reader —
 * needs the list as a value. Kept beside the union so the two cannot drift: the
 * `satisfies` rejects a name the union does not have, and the `never` below
 * rejects a union member missing from the list. Those two are compile-time and
 * live in production code, which is typechecked; the equivalent assertion placed
 * in a test file would not run, because tests are excluded from the build.
 */
export const THEME_COLOR_TOKENS = [
  "text",
  "userMessageText",
  "thinkingText",
  "toolTitle",
  "toolOutput",
  "diffAdded",
  "diffRemoved",
  "diffContext",
  "filename",
  "command",
  "commandArg",
  "commandFlag",
  "commandString",
  "commandNumber",
  "commandPipe",
  "mdHeading",
  "mdCode",
  "mdLink",
  "success",
  "error",
  "warning",
  "muted",
  "dim",
  "accent",
  "border",
  "borderAccent",
  "borderMuted",
  "selectedBg",
  "userMessageBg",
  "statusBandBg",
  "scrollbarTrack",
  "scrollbarThumb",
] as const satisfies readonly ThemeColorToken[];

/**
 * Proof that the list above names every member of the union.
 *
 * `satisfies` catches a name in the list that the union does not have. This
 * catches the other direction: a token added to `ThemeColorToken` and forgotten
 * here stops compiling, which is what stops it from being silently unread.
 */
type MissingToken = Exclude<ThemeColorToken, (typeof THEME_COLOR_TOKENS)[number]>;
const _everyTokenIsListed: [MissingToken] extends [never] ? true : false = true;
void _everyTokenIsListed;

export interface ThemeStyleOptions {
  readonly bg?: ThemeColorToken;
  readonly bold?: boolean;
  readonly dim?: boolean;
  readonly italic?: boolean;
  readonly underline?: boolean;
  readonly inverse?: boolean;
  readonly strikethrough?: boolean;
}

type StyleLayer = readonly [open: string, close: number];

const TEXT_ATTRIBUTES = [
  ["italic", "\x1b[3m", 23],
  ["underline", "\x1b[4m", 24],
  ["inverse", "\x1b[7m", 27],
  ["strikethrough", "\x1b[9m", 29],
] as const;

/** Reopen only the outer attributes that an embedded reset closes. */
function reopenStyles(text: string, prefix: string, openings: ReadonlyMap<number, string>): string {
  if (!text.includes("\x1b[")) return text;
  return text.replace(/\x1b\[([\d;:]*)m/g, (sequence, parameters: string) => {
    const parts = parameters.split(";");
    let restored = "";
    let start = 0;
    for (let index = 0; index < parts.length; index++) {
      const code = Number(parts[index]);
      if (code === 38 || code === 48 || code === 58) {
        // RGB channels and indexed colors are operands, even when their numbers
        // equal a reset code. Colon-delimited groups remain opaque.
        const mode = parts[index + 1];
        index += mode === "2" ? 4 : mode === "5" ? 2 : parts.length;
        continue;
      }
      const opening = code === 0 ? prefix : openings.get(code);
      if (!opening) continue;
      restored += `\x1b[${parts.slice(start, index + 1).join(";")}m${opening}`;
      start = index + 1;
    }
    if (start === 0) return sequence;
    if (start < parts.length) restored += `\x1b[${parts.slice(start).join(";")}m`;
    return restored;
  });
}

/** Open in order, close in reverse order, and preserve nesting of each property. */
function applyStyles(text: string, layers: readonly StyleLayer[]): string {
  let prefix = "";
  let suffix = "";
  const openings = new Map<number, string>();
  for (const [open, close] of layers) {
    prefix += open;
    suffix = `\x1b[${close}m${suffix}`;
    openings.set(close, open);
  }
  return prefix + reopenStyles(text, prefix, openings) + suffix;
}

export class Theme {
  name: string;
  private colors: Map<ThemeColorToken, string>;
  /**
   * Updated whenever the palette changes.
   *
   * A theme is recolored in place, so a surface that renders the same text twice
   * gets different output from an unchanged input. Anything caching rendered rows
   * has to key on this or it keeps serving rows in the old colors — the reload
   * would change the palette and nothing on screen would follow.
   */
  private revision = 0;

  constructor(theme: ThemeConfig) {
    this.name = theme.name;
    this.colors = new Map(Object.entries(theme.colors) as [ThemeColorToken, string][]);
  }

  /**
   * Adopt another theme's colors in place.
   *
   * Call sites hold this one instance rather than a name to look up, so swapping
   * the palette here is what lets a theme change reach every surface that was
   * already rendering.
   */
  apply(theme: ThemeConfig): void {
    this.name = theme.name;
    this.colors = new Map(Object.entries(theme.colors) as [ThemeColorToken, string][]);
    this.revision += 1;
  }

  /** Changes whenever the palette does, for caches keyed on the colors. */
  get colorRevision(): number {
    return this.revision;
  }

  fg(token: ThemeColorToken, text: string): string {
    return this.style(token, text);
  }

  bg(token: ThemeColorToken, text: string): string {
    return applyStyles(text, [[this.bgOpen(token), 49]]);
  }

  /** Combine a foreground with background and text attributes in one scope. */
  style(token: ThemeColorToken, text: string, options: ThemeStyleOptions = {}): string {
    const color = this.colors.get(token) ?? "#ffffff";
    const layers: StyleLayer[] = [[this.colorToAnsi(color), 39]];
    if (options.bg) layers.push([this.bgOpen(options.bg), 49]);
    if (options.bold || options.dim) {
      layers.push([(options.bold ? "\x1b[1m" : "") + (options.dim ? "\x1b[2m" : ""), 22]);
    }
    for (const [attribute, open, close] of TEXT_ATTRIBUTES) {
      if (options[attribute]) layers.push([open, close]);
    }
    return applyStyles(text, layers);
  }

  /** The opening sequence alone, for rows that own their background and final reset. */
  bgOpen(token: ThemeColorToken): string {
    const color = this.colors.get(token) ?? "#000000";
    return this.colorToAnsiBg(color);
  }

  inverse(text: string): string {
    return applyStyles(text, [["\x1b[7m", 27]]);
  }

  bold(text: string): string {
    return applyStyles(text, [["\x1b[1m", 22]]);
  }

  /**
   * Secondary text, in the theme's own colour.
   *
   * This used to emit the terminal's faint attribute directly, which meant every
   * caller inherited the terminal's idea of dim rather than the theme's, and the
   * `dim` token it looked like it used had no reader at all. Naming the token
   * makes the colour the theme author's choice, which is what the palette was
   * already offering.
   */
  dim(text: string): string {
    return this.fg("dim", text);
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

let currentThemeName = "dark";

export function getTheme(
  name: string,
  workspaceRoot?: string,
  extraPaths: readonly string[] = [],
): Theme {
  if (name === "default") return defaultTheme;
  const config = loadTheme(name, workspaceRoot, extraPaths);
  if (!config) {
    throw new Error(`Theme not found: ${name}`);
  }
  return new Theme(config);
}

/**
 * Apply a named theme to the palette every surface already renders with.
 *
 * Recoloring the shared instance rather than replacing it is what makes a theme
 * change visible: the alternative is every call site holding a stale reference.
 */
export function applyTheme(
  name: string,
  workspaceRoot?: string,
  extraPaths: readonly string[] = [],
): void {
  const config = loadTheme(name, workspaceRoot, extraPaths);
  if (!config) {
    throw new Error(`Theme not found: ${name}`);
  }
  defaultTheme.apply(config);
  currentThemeName = config.name;
}

/** The theme currently in effect. */
export function currentTheme(): string {
  return currentThemeName;
}

export const defaultTheme = new Theme(getDefaultTheme());
