import { lineCells, visibleWidth } from "../text/measure.js";

/**
 * Finding text in a rendered transcript.
 *
 * Matching runs over the rendered rows rather than over the conversation, because
 * that is what the user is looking at: a match has to be pointed at on screen, and
 * a message whose text is present but rendered differently — wrapped, truncated,
 * styled — would otherwise report a hit with nothing to show for it.
 *
 * The rows are searched as one continuous text, with each character remembering
 * where it came from. A phrase that wraps onto the next line is therefore found as
 * readily as one that fits, which is the case a per-row search gets wrong and the
 * case a reader most needs: a long line is exactly where they lose their place.
 */

/** Where one match sits: a row, and the cells within it. */
export interface SearchMatch {
  readonly row: number;
  readonly start: number;
  readonly end: number;
}

export interface SearchIndex {
  /** Every match, in reading order. */
  readonly matches: readonly SearchMatch[];
  /** The query this was built from, so a stale index can be recognised. */
  readonly query: string;
}

/** One character of the searchable text and the cell it came from. */
interface CellRef {
  readonly row: number;
  readonly column: number;
}

const EMPTY_INDEX: SearchIndex = { matches: [], query: "" };

/**
 * Build the searchable text for a set of rendered rows.
 *
 * A space is inserted between rows so a match cannot span a line break as though
 * the two lines were adjacent words. Without it, searching for "foobar" would match
 * a line ending in "foo" followed by one starting with "bar", which is not text the
 * user can see anywhere.
 */
function buildCorpus(rows: readonly string[]): { readonly text: string; readonly refs: readonly CellRef[] } {
  const chars: string[] = [];
  const refs: CellRef[] = [];

  for (let row = 0; row < rows.length; row += 1) {
    if (row > 0) {
      chars.push(" ");
      // The separator belongs to no cell: a match ending here is clamped below.
      refs.push({ row: -1, column: -1 });
    }
    let column = 0;
    for (const cell of lineCells(rows[row] ?? "")) {
      if (cell.cluster === "") continue;
      chars.push(cell.cluster);
      refs.push({ row, column });
      column += cell.width;
    }
  }

  return { text: chars.join(""), refs };
}

/**
 * Every occurrence of `query` in the rendered rows.
 *
 * Matching is case-insensitive and literal: no regular expressions, because a
 * search box is not the place to require escaping a bracket, and a query that
 * fails to compile would have to be reported as an error rather than as "no
 * matches".
 */
export function buildSearchIndex(rows: readonly string[], query: string): SearchIndex {
  const needle = query.toLowerCase();
  if (!needle) return EMPTY_INDEX;

  const { text, refs } = buildCorpus(rows);
  const haystack = text.toLowerCase();
  const matches: SearchMatch[] = [];

  let at = haystack.indexOf(needle);
  while (at !== -1) {
    const end = at + needle.length;
    const from = refs[at];
    const to = refs[end - 1];
    // A match that reached the separator has no cell to point at, so it is not a
    // match the user could be shown. It cannot happen with the space separator
    // unless the query contains one spanning a line break.
    if (from && to && from.row >= 0 && to.row >= 0) {
      // Clamped to one row: a wrapping match is highlighted from its start to the
      // end of its line, and again from the start of the next. Highlighting across
      // the row boundary would shade the scrollbar column.
      matches.push({ row: from.row, start: from.column, end: to.row === from.row ? to.column + 1 : Number.MAX_SAFE_INTEGER });
      if (to.row !== from.row) {
        for (let row = from.row + 1; row <= to.row; row += 1) {
          matches.push({ row, start: 0, end: row === to.row ? to.column + 1 : Number.MAX_SAFE_INTEGER });
        }
      }
    }
    at = haystack.indexOf(needle, at + Math.max(1, needle.length));
  }

  return { matches, query };
}

/** The row a match begins on, used to scroll it into view. */
export function matchRow(index: SearchIndex, position: number): number | undefined {
  return index.matches[clampPosition(index, position)]?.row;
}

export function clampPosition(index: SearchIndex, position: number): number {
  if (index.matches.length === 0) return -1;
  // Wrapping rather than clamping, so "next" at the last match continues from the
  // top. A search that stopped at the end would leave the user pressing a key that
  // does nothing, with no way to tell that from a broken binding.
  return ((position % index.matches.length) + index.matches.length) % index.matches.length;
}

/** Step to the next or previous match, wrapping at either end. */
export function stepPosition(index: SearchIndex, position: number, direction: -1 | 1): number {
  if (index.matches.length === 0) return -1;
  if (position < 0) return direction === 1 ? 0 : index.matches.length - 1;
  return clampPosition(index, position + direction);
}

/**
 * One row with its matches styled.
 *
 * `current` distinguishes the match the user is on from the others, so the position
 * they have reached is visible at a glance while the rest still show where the other
 * hits are. Cells outside any match are copied through untouched, which keeps the
 * row's own colours intact.
 */
export function highlightRowMatches(
  line: string,
  matches: readonly SearchMatch[],
  current: SearchMatch | undefined,
  style: (text: string, current: boolean) => string,
): string {
  if (matches.length === 0 || visibleWidth(line) === 0) return line;

  let column = 0;
  let out = "";
  let run = "";
  let runIsCurrent = false;
  const flush = (): void => {
    if (run) out += style(run, runIsCurrent);
    run = "";
  };

  for (const cell of lineCells(line)) {
    if (cell.cluster === "") {
      out += cell.prefix;
      continue;
    }
    const next = column + cell.width;
    const hit = matches.find((match) => column >= match.start && next <= match.end);
    if (!hit) {
      flush();
      out += cell.prefix + cell.cluster;
      column = next;
      continue;
    }
    const isCurrent = current !== undefined && hit.row === current.row && hit.start === current.start;
    // The prefix is emitted before the styled run begins, not inside it: it sets
    // the row's own colour, and wrapping it in the match style would apply that
    // colour to the highlight instead of to the text.
    if (run && isCurrent !== runIsCurrent) flush();
    if (!run) out += cell.prefix;
    runIsCurrent = isCurrent;
    run += cell.cluster;
    column = next;
  }
  flush();
  return out;
}
