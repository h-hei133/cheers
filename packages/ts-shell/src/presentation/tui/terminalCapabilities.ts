/**
 * Terminal Capability Detection and Feature Negotiation
 */

export interface TerminalCapabilities {
  readonly hasTrueColor: boolean;
  readonly has256Color: boolean;
  readonly supportsDec2026Sync: boolean;
  readonly supportsKittyKeyboard: boolean;
  readonly supportsBracketedPaste: boolean;
  readonly isWindowsTerminal: boolean;
}

export function detectTerminalCapabilities(env: NodeJS.ProcessEnv = process.env): TerminalCapabilities {
  const term = (env.TERM || "").toLowerCase();
  const colorTerm = (env.COLORTERM || "").toLowerCase();
  const isWT = Boolean(env.WT_SESSION);

  const hasTrueColor =
    colorTerm === "truecolor" ||
    colorTerm === "24bit" ||
    isWT ||
    term.includes("direct") ||
    env.TERM_PROGRAM === "iTerm.app" ||
    env.TERM_PROGRAM === "WezTerm" ||
    env.TERM_PROGRAM === "ghostty" ||
    env.TERM_PROGRAM === "alacritty";

  const has256Color =
    hasTrueColor ||
    term.includes("256color") ||
    term.includes("256") ||
    term.includes("xterm") ||
    term.includes("screen");

  return {
    hasTrueColor,
    has256Color,
    supportsDec2026Sync: hasTrueColor,
    supportsKittyKeyboard: env.TERM_PROGRAM === "ghostty" || env.TERM_PROGRAM === "WezTerm" || env.KITTY_PID !== undefined,
    supportsBracketedPaste: !term.includes("dumb"),
    isWindowsTerminal: isWT,
  };
}
