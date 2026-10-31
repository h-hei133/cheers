import { defaultTheme } from "../../theme/theme.js";
import { truncateToWidth } from "../text/layout.js";

/**
 * Input waiting for a turn, shown above the prompt.
 *
 * Typing while a turn runs does not always send anything: a command, a composed
 * prompt or one carrying images cannot be steered into the running turn, so it
 * waits for the next one. The transcript is the record of what was sent, and an
 * entry that is still waiting does not belong there — it would read as a message
 * the model had already seen, and cancelling it would leave a question behind
 * that was never asked.
 *
 * So pending input is drawn here instead: one row per entry, between the
 * transcript and the prompt, and it disappears the moment the entry starts
 * running. The full text stays in `/queue`, which can also edit, reorder and
 * cancel a single entry.
 */

export interface PendingInput {
  /** Where the entry will be delivered: before the next step, or after the turn. */
  readonly stage: "steer" | "queued";
  readonly text: string;
}

/** Entries shown before the rest are summarized; more would bury the prompt. */
const MAX_ROWS = 3;

/** Rows for the pending band, or none when nothing is waiting. */
export function renderPendingInput(entries: readonly PendingInput[], width: number): string[] {
  if (entries.length === 0) return [];
  const rows = entries.slice(0, MAX_ROWS).map((entry) => {
    // One row per entry: a multi-line entry would push the prompt off screen
    // exactly when the user is trying to type into it. The arrow says "this is
    // still on its way"; the rest is the entry as the user wrote it.
    const body = entry.text.replace(/\s*\n\s*/g, " ↵ ").trim();
    const label = defaultTheme.dim(entry.stage);
    return truncateToWidth(`${defaultTheme.fg("border", "↳ ")}${label}${defaultTheme.dim(" · ")}${defaultTheme.fg("text", body)}`, width);
  });
  const omitted = entries.length - MAX_ROWS;
  if (omitted > 0) rows.push(defaultTheme.dim(truncateToWidth(`  +${omitted} more · /queue to manage`, width)));
  return rows;
}
