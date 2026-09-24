import { defaultTheme } from "../../theme/theme.js";
import { truncateToWidth } from "../text/layout.js";

/**
 * The row the search replaces while it is open.
 *
 * It carries the query, the position among the matches, and the keys that apply —
 * the same three things any search bar carries, and the position is the one that
 * matters most: without it the user cannot tell whether they have seen all the
 * hits, so they cannot decide whether to keep pressing the key.
 *
 * Zero or one row, so an open search costs the transcript exactly one row of
 * height. It is the hint row that yields rather than the composer: the composer is
 * where the user's text lives and taking it away to ask a question would lose
 * whatever they had typed.
 */

export interface SearchBarContext {
  readonly query: string;
  readonly matchCount: number;
  /** Which match the user is on, one-based. Zero when there are none. */
  readonly currentNumber: number;
}

export function renderSearchBar(context: SearchBarContext, width: number): string[] {
  const separator = defaultTheme.fg("border", "  ·  ");
  const parts: string[] = [defaultTheme.fg("accent", `find: ${context.query}`)];

  if (context.query.length === 0) {
    parts.push(defaultTheme.dim("type to search"));
  } else if (context.matchCount === 0) {
    // Said plainly rather than left as an empty count, which reads as a bar that
    // has not caught up yet.
    parts.push(defaultTheme.dim("no matches"));
  } else {
    parts.push(defaultTheme.fg("text", `${context.currentNumber}/${context.matchCount}`));
  }

  parts.push(defaultTheme.dim(context.matchCount > 0 ? "↑↓ next · esc close" : "esc close"));
  return [truncateToWidth(parts.join(separator), width)];
}
