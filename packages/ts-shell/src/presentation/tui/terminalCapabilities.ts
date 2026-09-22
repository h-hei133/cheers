/**
 * Static terminal capability detection.
 *
 * Everything here is inferred from the environment, never from a device query,
 * so it is available before the first paint. Each flag is deliberately
 * conservative: enabling a feature the terminal lacks costs a visible artifact,
 * while leaving one off only costs an optimisation.
 */

export interface TerminalCapabilities {
  readonly hasTrueColor: boolean;
  readonly has256Color: boolean;
  /** DEC private mode 2026: hold the screen while a frame is written. */
  readonly supportsDec2026Sync: boolean;
  readonly supportsKittyKeyboard: boolean;
  readonly supportsBracketedPaste: boolean;
  /** Inside tmux or screen, where the pane owns its own scrollback and reflow. */
  readonly insideMultiplexer: boolean;
}

/** Terminals known to implement synchronized output. */
const SYNC_PROGRAMS = new Set(["iTerm.app", "WezTerm", "ghostty", "kitty", "vscode", "Apple_Terminal"]);

function readBooleanFlag(value: string | undefined): boolean | undefined {
  if (value === undefined || value === "") return undefined;
  const normalized = value.toLowerCase();
  if (normalized === "0" || normalized === "false" || normalized === "off") return false;
  return true;
}

export function detectTerminalCapabilities(env: NodeJS.ProcessEnv = process.env): TerminalCapabilities {
  const term = (env.TERM ?? "").toLowerCase();
  const colorTerm = (env.COLORTERM ?? "").toLowerCase();
  const program = env.TERM_PROGRAM ?? "";
  const isWindowsTerminal = Boolean(env.WT_SESSION);
  const isKitty = env.KITTY_PID !== undefined || term.includes("kitty");

  const hasTrueColor =
    colorTerm === "truecolor" ||
    colorTerm === "24bit" ||
    isWindowsTerminal ||
    isKitty ||
    term.includes("direct") ||
    SYNC_PROGRAMS.has(program);

  const has256Color =
    hasTrueColor || term.includes("256") || term.includes("xterm") || term.includes("screen");

  const insideMultiplexer =
    env.TMUX !== undefined || term.startsWith("screen") || term.startsWith("tmux");

  const syncOverride = readBooleanFlag(env.TSSHELL_TUI_SYNC);
  const supportsDec2026Sync =
    syncOverride ?? (isKitty || isWindowsTerminal || SYNC_PROGRAMS.has(program) || insideMultiplexer);

  return {
    hasTrueColor,
    has256Color,
    supportsDec2026Sync,
    supportsKittyKeyboard: isKitty || program === "ghostty" || program === "WezTerm",
    supportsBracketedPaste: !term.includes("dumb") && term !== "",
    insideMultiplexer,
  };
}
