import { describe, expect, it } from "vitest";
import {
  buildSearchIndex,
  clampPosition,
  highlightRowMatches,
  matchIndexAtRow,
  matchRow,
  stepPosition,
} from "./search.js";

/**
 * Search over what the user can see.
 *
 * Matching runs on the rendered rows, so a hit always has something to point at.
 * The interesting cases are all about rows being an artefact: a phrase can be split
 * across two of them by wrapping, and two adjacent lines are not adjacent words.
 */

const rows = ["alpha beta", "gamma", "alpha again"];

describe("finding matches", () => {
  it("finds every occurrence", () => {
    const index = buildSearchIndex(rows, "alpha");
    expect(index.matches).toEqual([
      { row: 0, start: 0, end: 5 },
      { row: 2, start: 0, end: 5 },
    ]);
  });

  it("ignores case", () => {
    expect(buildSearchIndex(rows, "GAMMA").matches).toEqual([{ row: 1, start: 0, end: 5 }]);
  });

  it("reports columns, not character offsets into the whole corpus", () => {
    const index = buildSearchIndex(rows, "again");
    expect(index.matches).toEqual([{ row: 2, start: 6, end: 11 }]);
  });

  it("does not match across a line break", () => {
    // "beta" ends row 0 and "gamma" starts row 1. Reading them as one string would
    // report a hit for text that appears nowhere on screen.
    expect(buildSearchIndex(rows, "betagamma").matches).toEqual([]);
  });

  it("finds a phrase split across a wrap", () => {
    // The case a per-row search gets wrong, and the one a reader most needs: a
    // long line is exactly where they lose their place. The first part runs to the
    // end of its row and the rest starts on the next, which is how the highlight
    // pass is expected to shade it.
    const index = buildSearchIndex(["the quick brown", "fox jumps"], "brown fox");
    expect(index.matches).toEqual([
      { row: 0, start: 10, end: Number.MAX_SAFE_INTEGER },
      { row: 1, start: 0, end: 3 },
    ]);
  });

  it("returns nothing for an empty query", () => {
    expect(buildSearchIndex(rows, "").matches).toEqual([]);
  });

  it("treats the query literally rather than as a pattern", () => {
    // A search box is not the place to require escaping a bracket.
    expect(buildSearchIndex(["a (b) c"], "(b)").matches).toEqual([{ row: 0, start: 2, end: 5 }]);
    expect(buildSearchIndex(["a (b) c"], "(b").matches).toEqual([{ row: 0, start: 2, end: 4 }]);
  });

  it("ignores the escapes in a styled row", () => {
    // Rows arrive with colour on them, and an escape sequence is not text.
    const index = buildSearchIndex(["\u001b[31mred\u001b[0m text"], "red");
    expect(index.matches).toHaveLength(1);
    expect(index.matches[0]!.start).toBe(0);
  });
});

describe("walking between matches", () => {
  const index = buildSearchIndex(rows, "alpha");

  it("wraps forward from the last match to the first", () => {
    // A search that stopped at the end would leave the user pressing a key that
    // does nothing, with no way to tell that from a broken binding.
    expect(stepPosition(index, 1, 1)).toBe(0);
  });

  it("wraps backward from the first match to the last", () => {
    expect(stepPosition(index, 0, -1)).toBe(1);
  });

  it("starts at the first match when stepping forward with nothing selected", () => {
    expect(stepPosition(index, -1, 1)).toBe(0);
  });

  it("starts at the last match when stepping back with nothing selected", () => {
    expect(stepPosition(index, -1, -1)).toBe(1);
  });

  it("reports no position when there are no matches", () => {
    const empty = buildSearchIndex(rows, "nothing");
    expect(stepPosition(empty, 0, 1)).toBe(-1);
    expect(matchRow(empty, 0)).toBeUndefined();
  });

  it("clamps rather than throwing for a position out of range", () => {
    expect(clampPosition(index, 5)).toBe(1);
  });

  it("reports the row a match begins on", () => {
    expect(matchRow(index, 1)).toBe(2);
  });
});

describe("mapping rows back to matches", () => {
  it("finds the match covering a row", () => {
    const index = buildSearchIndex(["brown", "fox"], "brown fox");
    // Both rows are part of one match, which is what keeps a count of matches
    // rather than a count of rows.
    expect(matchIndexAtRow(index, 0)).toBe(0);
    expect(matchIndexAtRow(index, 1)).toBe(1);
  });
});

describe("styling a row", () => {
  const underline = (text: string, current: boolean): string => (current ? `[${text}]` : `<${text}>`);

  it("marks the current match differently from the others", () => {
    const index = buildSearchIndex(["alpha alpha"], "alpha");
    const current = index.matches[0];
    // Both hits stay visible; which one the user is on is distinguishable.
    expect(highlightRowMatches("alpha alpha", index.matches, current, underline)).toBe(
      "[alpha] <alpha>",
    );
  });

  it("leaves a row without matches untouched", () => {
    expect(highlightRowMatches("nothing here", [], undefined, underline)).toBe("nothing here");
  });

  it("keeps a styled row's own escapes", () => {
    const line = "\u001b[31mred\u001b[0m tail";
    const index = buildSearchIndex([line], "red");
    const styled = highlightRowMatches(line, index.matches, index.matches[0], underline);
    expect(styled).toContain("\u001b[31m");
    expect(styled).toContain("[red]");
  });

  it("does not style a row with no visible text", () => {
    expect(highlightRowMatches("", [{ row: 0, start: 0, end: 3 }], undefined, underline)).toBe("");
  });
});
