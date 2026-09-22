import { defaultTheme } from "../../theme/theme.js";
import { truncateToWidth } from "../text/layout.js";

/**
 * The row under the prompt.
 *
 * It carries one of two things. A transient hint is something the user needs to
 * act on right now — a completion list is open, a second Ctrl+C will exit, input
 * is queued behind a running turn. Ambient context is what is true in the
 * background: pending work, other live sessions. The transient hint always wins,
 * because a hint the user is waiting for must not be buried under context.
 *
 * When there is neither, the row is omitted entirely rather than padded with
 * filler, so an idle prompt costs no screen row.
 */

export interface HintContext {
  readonly busy: boolean;
  readonly suggesting: boolean;
  /** Set while a second Ctrl+C within the double-press window would exit. */
  readonly cancelArmed: boolean;
  /** Prompts waiting to run after the current turn. */
  readonly queued: number;
  /** Prompts waiting to be steered into the current turn. */
  readonly steering?: number;
  readonly newlineKey: string;
  readonly toast?: string;
}
export interface AmbientContext {
  /** Todo entries not yet done. */
  readonly openTodos: number;
  /** Other live sessions reachable for cross-session messaging. */
  readonly peerSessions: number;
}

/** The transient hint for the current state, or undefined when there is none. */
function transientHint(context: HintContext): string | undefined {
  if (context.cancelArmed) return "press ctrl+c again to exit";
  if (context.suggesting) return join(["↑↓ select", "tab complete", "esc dismiss"]);
  const steering = context.steering ?? 0;
  if (steering > 0 && context.queued > 0) {
    return `${steering} steering · ${context.queued} queued`;
  }
  if (steering > 0) return `${steering} steering · delivered before the next step`;
  if (context.queued > 0) {
    return `${context.queued} queued · runs when the current turn finishes`;
  }
  if (context.busy) {
    return join(["esc interrupt", "enter steer before next step", "ctrl+q run after turn"]);
  }
}

/** Background facts worth a row, or undefined when nothing is pending. */
function ambientFacts(ambient: AmbientContext): string | undefined {
  const facts: string[] = [];
  if (ambient.openTodos > 0) facts.push(`${ambient.openTodos} open todo${ambient.openTodos === 1 ? "" : "s"}`);
  if (ambient.peerSessions > 0) {
    facts.push(`${ambient.peerSessions} other session${ambient.peerSessions === 1 ? "" : "s"}`);
  }
  return facts.length > 0 ? join(facts) : undefined;
}

/** Zero or one row: the transient hint, else ambient context, else nothing. */
export function renderHints(
  context: HintContext,
  ambient: AmbientContext,
  width: number,
): string[] {
  if (context.toast && !context.cancelArmed && !context.suggesting) {
    return [defaultTheme.fg("accent", truncateToWidth(context.toast, width))];
  }
  const text = transientHint(context) ?? ambientFacts(ambient);
  if (!text) return [];
  return [defaultTheme.dim(truncateToWidth(text, width))];
}
export function newlineKeyFor(protocol: "enhanced" | "modify-other-keys" | "legacy"): string {
  // Only a negotiated protocol can carry the Shift modifier on Enter. Claiming
  // shift+enter on a terminal that cannot report it is the defect this replaces.
  return protocol === "legacy" ? "ctrl+j" : "shift+enter";
}

function join(parts: readonly string[]): string {
  return parts.join(defaultTheme.fg("border", "  ·  "));
}
