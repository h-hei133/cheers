import { describe, expect, it } from "vitest";
import { MULTI_CLICK_INTERVAL_MS, nextClickCount, spanForClick } from "./clickSelect.js";

/**
 * What a click selects.
 *
 * The counts are the convention every editor has, so the interesting cases are the
 * boundaries: what ends a run, what a word is, and what happens when there is no
 * word under the pointer.
 */

const rows = ["const value = compute(alpha, beta)", "second line", ""];

describe("counting presses", () => {
  const point = { row: 2, column: 5 };

  it("counts a first press as one", () => {
    expect(nextClickCount(undefined, point, 1000)).toBe(1);
  });

  it("continues a run on the same cell within the interval", () => {
    const first = { ...point, at: 1000, count: 1 };
    expect(nextClickCount(first, point, 1000 + MULTI_CLICK_INTERVAL_MS)).toBe(2);
  });

  it("starts a new run after the interval", () => {
    const first = { ...point, at: 1000, count: 1 };
    expect(nextClickCount(first, point, 1000 + MULTI_CLICK_INTERVAL_MS + 1)).toBe(1);
  });

  it("starts a new run on a different cell", () => {
    // A pointer that moved is a drag, and counting it as a double click would take
    // a word when the user was selecting a phrase.
    const first = { ...point, at: 1000, count: 1 };
    expect(nextClickCount(first, { row: 2, column: 6 }, 1000)).toBe(1);
  });

  it("starts again after the third press", () => {
    // A fourth press has no meaning to reach, so it begins a new run rather than
    // cycling into something arbitrary.
    const third = { ...point, at: 1000, count: 3 };
    expect(nextClickCount(third, point, 1000)).toBe(1);
  });
});

describe("selecting a word", () => {
  it("takes the whole word around the column", () => {
    const span = spanForClick(["const value = alpha"], { row: 0, column: 15 }, "word");
    expect(span).toEqual({ from: { row: 0, column: 14 }, to: { row: 0, column: 18 } });
  });

  it("sticks to punctuation attached to the word", () => {
    // Double-clicking `compute(` takes the call, not just the name: that is what
    // makes the gesture useful on code.
    const span = spanForClick(["run() next"], { row: 0, column: 1 }, "word");
    expect(span).toEqual({ from: { row: 0, column: 0 }, to: { row: 0, column: 4 } });
  });

  it("takes nothing when the pointer is on whitespace", () => {
    // Selecting the gap would look like the gesture failed at random.
    expect(spanForClick(rows, { row: 0, column: 5 }, "word")).toBeUndefined();
  });

  it("works on the first and last character of a line", () => {
    expect(spanForClick(["ab"], { row: 0, column: 0 }, "word")).toEqual({
      from: { row: 0, column: 0 },
      to: { row: 0, column: 1 },
    });
    expect(spanForClick(["ab"], { row: 0, column: 1 }, "word")).toEqual({
      from: { row: 0, column: 0 },
      to: { row: 0, column: 1 },
    });
  });

  it("returns nothing for a row that does not exist", () => {
    expect(spanForClick(rows, { row: 99, column: 0 }, "word")).toBeUndefined();
  });
});

describe("selecting a line", () => {
  it("covers the whole row", () => {
    const span = spanForClick(rows, { row: 1, column: 3 }, "line");
    expect(span).toEqual({ from: { row: 1, column: 0 }, to: { row: 1, column: 10 } });
  });

  it("handles an empty row", () => {
    expect(spanForClick(rows, { row: 2, column: 0 }, "line")).toEqual({
      from: { row: 2, column: 0 },
      to: { row: 2, column: 0 },
    });
  });
});
