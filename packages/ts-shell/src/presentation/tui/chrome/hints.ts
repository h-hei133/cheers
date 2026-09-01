import { defaultTheme } from "../../theme/theme.js";
import { truncateToWidth } from "../text/layout.js";

/**
 * Key hint row.
 *
 * The hints are context-dependent on purpose: showing every binding at all times
 * trains users to ignore the row. Only the bindings that do something right now
 * appear, so the row stays short enough to read at a glance.
 */

export interface HintContext {
  readonly busy: boolean;
  readonly hasDraft: boolean;
  readonly suggesting: boolean;
  readonly multiline: boolean;
}

/** The hint row, or no rows when there is nothing worth saying. */
export function renderHints(context: HintContext, width: number): string[] {
  const hints: string[] = [];
  if (context.suggesting) {
    hints.push("↑↓ select", "tab complete", "esc dismiss");
  } else if (context.busy) {
    hints.push("esc interrupt", "type to queue");
  } else {
    hints.push("/ commands");
    if (context.hasDraft) hints.push("enter send", "shift+enter newline");
    else hints.push("ctrl+c exit");
    if (context.multiline) hints.push("ctrl+u clear");
  }
  const row = `  ${hints.join(defaultTheme.fg("border", "  ·  "))}`;
  return [defaultTheme.dim(truncateToWidth(row, width))];
}
