import { defaultTheme } from "../../theme/theme.js";
import { truncateToWidthWithMode } from "../text/layout.js";

/**
 * Session intro.
 *
 * Two rows, printed once at the top of the transcript: what will answer, and
 * where it will act. A longer banner is worse, not better — it is the content a
 * user scrolls past most often and never reads twice.
 */

export interface WelcomeState {
  readonly model: string;
  readonly directory: string;
  readonly branch?: string;
  readonly resumeHint?: string;
}

/** Intro rows for the current session. */
export function renderWelcome(state: WelcomeState, width: number): string[] {
  const location = state.branch
    ? `${state.directory} ${defaultTheme.fg("border", "·")} ${defaultTheme.fg("success", state.branch)}`
    : state.directory;
  const rows = [
    `${defaultTheme.bold(defaultTheme.fg("accent", "Coding Agent"))}  ${defaultTheme.dim(state.model)}`,
    `${defaultTheme.dim(truncateToWidthWithMode(location, Math.max(8, width), "middle"))}`,
  ];
  if (state.resumeHint) rows.push(defaultTheme.dim(state.resumeHint));
  return rows;
}
