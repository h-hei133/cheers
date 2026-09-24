import { defaultTheme } from "../../theme/theme.js";
import type { SearchKey, TranscriptSearch } from "../transcript/searchState.js";

/**
 * What an open search needs from the session while it is capturing keys.
 *
 * The search owns the query and the current match; the session owns the view and
 * the redraw. This is the seam between them, kept here rather than inside the
 * session because it is entirely search behaviour — every line of it reads or
 * drives the search, and leaving it in the session made that module carry a
 * feature it does not otherwise know about.
 */

export interface SearchHost {
  /** Rendered rows of the whole transcript, which is what the query matches against. */
  contentRows(): readonly string[];
  /** Whether the view moved, so the caller knows a redraw is warranted. */
  scrollToContentRow(row: number): boolean;
}

export interface SearchKeyResult {
  /** True when the key belonged to the search and must not reach the editor. */
  readonly handled: boolean;
  /** True when the frame needs redrawing. */
  readonly redraw: boolean;
}

/**
 * Route a key to an open search.
 *
 * Returns `handled: false` when no search is open, so the caller can fall through
 * to its own routing without asking first.
 */
export function routeSearchKey(search: TranscriptSearch, event: SearchKey, host: SearchHost): SearchKeyResult {
  const outcome = search.handleKey(event);
  if (!outcome.handled) return { handled: false, redraw: false };
  if (outcome.moved) revealCurrentMatch(search, host);
  return { handled: true, redraw: outcome.redraw === true || outcome.moved === true };
}

/**
 * Put the current match on screen.
 *
 * The index is rebuilt from the rows the view last rendered, which is the only form
 * of the transcript the user can see: a match computed against anything else could
 * name a row that is not there. Rebuilding on every query change as well as every
 * step is what makes typing a query feel like searching rather than like counting.
 */
export function revealCurrentMatch(search: TranscriptSearch, host: SearchHost): void {
  const index = search.indexFor(host.contentRows());
  if (index.matches.length === 0) return;
  const row = search.currentRow;
  if (row !== undefined) host.scrollToContentRow(row);
}

/**
 * Style the matches in one rendered row.
 *
 * Two styles, so the position the user has reached is visible at a glance while the
 * remaining hits still show where they are.
 */
export function styleSearchRow(search: TranscriptSearch, row: string, contentRow: number): string {
  return search.styleRow(row, contentRow, (text, current) =>
    current ? defaultTheme.inverse(defaultTheme.bold(text)) : defaultTheme.bold(text),
  );
}
