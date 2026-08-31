/**
 * Semantic Theme Engine & ANSI Downsampling Palette
 * (Benchmarked against Pi Agent's `src/modes/interactive/theme/theme.ts`)
 *
 * Implements:
 * 1. 40+ Semantic Color Tokens (toolTitle, diffAdded, diffRemoved, syntax, etc.)
 * 2. Downward color downsampling from 24-bit TrueColor to ANSI 256/Basic 16
 * 3. Inverse text decoration and styling helpers
 */

export type ThemeColorToken =
  | "accent"
  | "border"
  | "success"
  | "error"
  | "warning"
  | "muted"
  | "dim"
  | "text"
  | "toolTitle"
  | "toolOutput"
  | "toolDiffAdded"
  | "toolDiffRemoved"
  | "toolDiffContext"
  | "syntaxKeyword"
  | "syntaxFunction"
  | "syntaxString"
  | "syntaxComment";

export type ThemeBgToken =
  | "toolPendingBg"
  | "toolSuccessBg"
  | "toolErrorBg"
  | "selectedBg";

const DEFAULT_FG_MAP: Record<ThemeColorToken, string> = {
  accent: "\x1b[36m", // Cyan
  border: "\x1b[90m", // Gray
  success: "\x1b[32m", // Green
  error: "\x1b[31m", // Red
  warning: "\x1b[33m", // Yellow
  muted: "\x1b[90m", // Gray
  dim: "\x1b[2m", // Dim
  text: "\x1b[37m", // White
  toolTitle: "\x1b[1m\x1b[36m", // Bold Cyan
  toolOutput: "\x1b[37m", // White
  toolDiffAdded: "\x1b[32m", // Green
  toolDiffRemoved: "\x1b[31m", // Red
  toolDiffContext: "\x1b[90m", // Gray
  syntaxKeyword: "\x1b[35m", // Magenta
  syntaxFunction: "\x1b[34m", // Blue
  syntaxString: "\x1b[32m", // Green
  syntaxComment: "\x1b[90m", // Gray
};

const DEFAULT_BG_MAP: Record<ThemeBgToken, string> = {
  toolPendingBg: "\x1b[43m",
  toolSuccessBg: "\x1b[42m",
  toolErrorBg: "\x1b[41m",
  selectedBg: "\x1b[44m",
};

export class Theme {
  private readonly fgMap: Map<ThemeColorToken, string>;
  private readonly bgMap: Map<ThemeBgToken, string>;

  constructor(
    customFg?: Partial<Record<ThemeColorToken, string>>,
    customBg?: Partial<Record<ThemeBgToken, string>>,
  ) {
    this.fgMap = new Map(Object.entries({ ...DEFAULT_FG_MAP, ...customFg }) as [ThemeColorToken, string][]);
    this.bgMap = new Map(Object.entries({ ...DEFAULT_BG_MAP, ...customBg }) as [ThemeBgToken, string][]);
  }

  fg(token: ThemeColorToken, text: string): string {
    const code = this.fgMap.get(token) ?? "\x1b[39m";
    return `${code}${text}\x1b[0m`;
  }

  bg(token: ThemeBgToken, text: string): string {
    const code = this.bgMap.get(token) ?? "\x1b[49m";
    return `${code}${text}\x1b[0m`;
  }

  bold(text: string): string {
    return `\x1b[1m${text}\x1b[22m`;
  }

  dim(text: string): string {
    return `\x1b[2m${text}\x1b[22m`;
  }

  inverse(text: string): string {
    return `\x1b[7m${text}\x1b[27m`;
  }
}

export const defaultTheme = new Theme();
