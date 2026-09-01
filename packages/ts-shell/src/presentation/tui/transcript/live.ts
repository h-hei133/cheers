import { defaultTheme } from "../../theme/theme.js";
import { truncateToWidth } from "../text/layout.js";

/**
 * In-flight turn indicator.
 *
 * While a turn is running the transcript has nothing finalized to show, so this
 * row carries the only proof the session is alive: an animating spinner, the
 * elapsed time, what the agent is currently doing, and how to interrupt it.
 * Without it a slow tool call is indistinguishable from a hang.
 */

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPINNER_INTERVAL_MS = 80;

export interface TurnActivity {
  /** Monotonic milliseconds when the turn began. */
  readonly startedAt: number;
  /** What is running right now: a phase name or a tool name. */
  readonly label: string;
  /** Tokens streamed so far this turn, or 0 when not yet known. */
  readonly tokens: number;
  /** True once cancellation was requested but the turn has not yet unwound. */
  readonly cancelling: boolean;
  /** True when `tokens` is a streamed-character estimate rather than a provider count. */
  readonly estimated?: boolean;
}

/** Spinner frame for a wall-clock instant, so animation is time-driven not frame-driven. */
export function spinnerFrame(now: number): string {
  return SPINNER[Math.floor(now / SPINNER_INTERVAL_MS) % SPINNER.length]!;
}

/** Human-scaled elapsed time: sub-minute in seconds, beyond that mm:ss. */
export function formatElapsed(milliseconds: number): string {
  const seconds = Math.max(0, milliseconds) / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m${String(Math.floor(seconds % 60)).padStart(2, "0")}s`;
}

/** The single activity row, or no rows when no turn is running. */
export function renderActivity(activity: TurnActivity | undefined, now: number, width: number): string[] {
  if (!activity) return [];
  const glyph = activity.cancelling
    ? defaultTheme.fg("warning", "◼")
    : defaultTheme.fg("accent", spinnerFrame(now));
  const label = activity.cancelling ? "interrupting" : activity.label;
  const facts = [formatElapsed(now - activity.startedAt)];
  if (activity.tokens > 0) {
    facts.push(`${activity.estimated ? "~" : ""}${formatTokens(activity.tokens)} tok`);
  }
  const hint = activity.cancelling ? "" : defaultTheme.dim("  esc to interrupt");
  const row = `  ${glyph} ${defaultTheme.bold(label)} ${defaultTheme.dim(facts.join(" · "))}${hint}`;
  return [truncateToWidth(row, width), ""];
}

/** Token counts abbreviated the way a status line needs them. */
export function formatTokens(tokens: number): string {
  if (tokens < 1000) return String(tokens);
  return `${(tokens / 1000).toFixed(tokens < 10_000 ? 1 : 0)}k`;
}
