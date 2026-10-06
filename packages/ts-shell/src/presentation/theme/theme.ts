/**
 * Semantic Theme Engine & ANSI Downsampling Palette
 *
 * Implements:
 * 1. Semantic Color Tokens (toolTitle, diffAdded, diffRemoved, syntax, etc.)
 * 2. Theme loading from JSON config files
 * 3. ANSI color escape sequences
 */

import { colorToAnsi, detectColorMode, type ColorMode } from "./color.js";
import { loadTheme, getDefaultTheme, type ThemeConfig } from "../themes/index.js";

import type { ThemeColorToken } from "./tokens.js";
export { THEME_COLOR_TOKENS, type ThemeColorToken } from "./tokens.js";

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
    if (!open) continue;
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

  constructor(theme: ThemeConfig, private mode: ColorMode = "256") {
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
  apply(theme: ThemeConfig, mode: ColorMode = this.mode): void {
    this.prepare(theme, mode)();
  }

  /** Allocate and validate before the synchronous publication step. */
  prepare(theme: ThemeConfig, mode: ColorMode = this.mode): () => void {
    const colors = new Map(Object.entries(theme.colors) as [ThemeColorToken, string][]);
    const name = theme.name;
    return () => { this.mode = mode; this.name = name; this.colors = colors; this.revision += 1; };
  }

  /** Changes whenever the palette does, for caches keyed on the colors. */
  get colorRevision(): number {
    return this.revision;
  }

  get colorMode(): ColorMode {
    return this.mode;
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
    const layers: StyleLayer[] = [[colorToAnsi(color, this.mode), 39]];
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
    return colorToAnsi(color, this.mode, true);
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
  return new Theme(config, detectColorMode());
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
  prepareTheme(name, workspaceRoot, extraPaths)();
}

export function prepareTheme(name: string, workspaceRoot?: string, extraPaths: readonly string[] = []): () => void {
  const config = loadTheme(name, workspaceRoot, extraPaths);
  if (!config) {
    throw new Error(`Theme not found: ${name}`);
  }
  const commit = defaultTheme.prepare(config, detectColorMode());
  return () => { commit(); currentThemeName = config.name; };
}

/** The theme currently in effect. */
export function currentTheme(): string {
  return currentThemeName;
}

/** Automatic appearance uses the bundled pair, independent of named file overrides. */
export function applyDefaultTheme(appearance: "dark" | "light"): void {
  prepareDefaultTheme(appearance)();
}

export function prepareDefaultTheme(appearance: "dark" | "light"): () => void {
  const commit = defaultTheme.prepare(getDefaultTheme(appearance), detectColorMode());
  return () => { commit(); currentThemeName = appearance; };
}

export const defaultTheme = new Theme(getDefaultTheme(), detectColorMode());
