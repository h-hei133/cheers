import { defaultTheme } from "../../theme/theme.js";
import { padToWidth, truncateToWidthWithMode } from "../text/layout.js";
import { visibleWidth } from "../text/measure.js";
import { formatTokens } from "../transcript/live.js";

/**
 * Status band above the prompt.
 *
 * One filled row carrying the facts a user needs before pressing Enter: which
 * model will answer, which branch and directory the answer will act on, and how
 * much context is left. It is a band rather than a framed line because a filled
 * row costs one screen row and stays legible at any width, while a frame costs
 * two rows and misaligns the moment a width estimate is off by one cell.
 *
 * Segments drop from the right under width pressure, so the model — the fact
 * that changes the answer most — is the last thing to go.
 */

export interface BandState {
  readonly model: string;
  readonly branch?: string;
  readonly directory?: string;
  readonly usedTokens?: number;
  readonly contextWindow?: number;
  readonly costUsd?: number;
  /** Short mode label such as `plan`, shown only when not the default. */
  readonly mode?: string;
}

const DIVIDER = "▏";
const CONTEXT_TIERS = [
  { at: 90, token: "error" as const },
  { at: 70, token: "warning" as const },
  { at: 50, token: "accent" as const },
];

/** Percentage of the context window consumed, or undefined when unknown. */
export function contextUsage(state: BandState): number | undefined {
  if (state.usedTokens === undefined || !state.contextWindow) return undefined;
  return Math.min(100, Math.round((state.usedTokens / state.contextWindow) * 100));
}

/** Ordered band segments, most important first. */
function segments(state: BandState): string[] {
  const parts = [defaultTheme.fg("accent", state.model)];
  if (state.mode) parts.push(defaultTheme.fg("warning", state.mode));
  if (state.branch) parts.push(defaultTheme.fg("success", state.branch));
  const percent = contextUsage(state);
  if (percent !== undefined) {
    const tier = CONTEXT_TIERS.find((entry) => percent >= entry.at);
    const usage = `${formatTokens(state.usedTokens ?? 0)}/${formatTokens(state.contextWindow ?? 0)} ${percent}%`;
    parts.push(tier ? defaultTheme.fg(tier.token, usage) : defaultTheme.dim(usage));
  }
  if (state.costUsd !== undefined && state.costUsd > 0) {
    parts.push(defaultTheme.dim(`$${state.costUsd.toFixed(4)}`));
  }
  if (state.directory) parts.push(defaultTheme.dim(state.directory));
  return parts;
}

/** The band row at exactly `width` cells. */
export function renderBand(state: BandState, width: number): string {
  const cells = Math.max(8, width);
  const parts = segments(state);
  let body = join(parts);
  while (parts.length > 1 && visibleWidth(body) > cells - 1) {
    parts.pop();
    body = join(parts);
  }
  if (visibleWidth(body) > cells - 1) {
    body = truncateToWidthWithMode(body, cells - 1, "end");
  }
  return `\x1b[48;5;236m${padToWidth(` ${body}`, cells)}\x1b[0m`;
}

function join(parts: readonly string[]): string {
  return parts.join(defaultTheme.fg("border", ` ${DIVIDER} `));
}
