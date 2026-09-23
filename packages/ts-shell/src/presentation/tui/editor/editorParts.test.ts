import { describe, expect, it } from "vitest";
import { KillRing } from "./killRing.js";
import { EditHistory } from "./editHistory.js";
import { insertSpan, removeSpan } from "./spans.js";
import { YankPlacement } from "./yank.js";

/**
 * The pieces the editor delegates to.
 *
 * Each was extracted because it is arithmetic or bookkeeping the editor should not
 * have been holding, and each has a rule that is easy to get subtly wrong: a run
 * of cuts is one entry, an undo must be undoable, a removed span must not leave a
 * blank row, and a cycled yank must replace rather than append.
 */

describe("KillRing", () => {
  it("joins cuts that are reported as continuing", () => {
    // Pressing the kill key repeatedly is cutting one passage, not several.
    // Whether two cuts are consecutive is the editor's question — it is the one
    // that sees every key — so the ring is told, not left to infer it.
    const ring = new KillRing(8);
    ring.push("b", { continuing: false, prepend: true });
    ring.push("a", { continuing: true, prepend: true });

    expect(ring.size).toBe(1);
    expect(ring.newest()).toBe("ab");
  });

  it("starts a new entry when the cut is not a continuation", () => {
    const ring = new KillRing(8);
    ring.push("first", { continuing: false, prepend: true });
    ring.push("second", { continuing: false, prepend: true });

    expect(ring.size).toBe(2);
  });

  it("appends rather than prepends when the cut came after the text", () => {
    const ring = new KillRing(8);
    ring.push("head", { continuing: false, prepend: true });
    ring.push("tail", { continuing: true, prepend: false });

    expect(ring.newest()).toBe("headtail");
  });

  it("forgets the oldest entry past its limit", () => {
    const ring = new KillRing(2);
    for (const text of ["a", "b", "c"]) ring.push(text, { continuing: false, prepend: true });

    expect(ring.size).toBe(2);
    expect(ring.newest()).toBe("c");
  });

  it("rotates so the same end is always read", () => {
    const ring = new KillRing(8);
    ring.push("first", { continuing: false, prepend: true });
    ring.push("second", { continuing: false, prepend: true });

    expect(ring.rotate()).toBe("first");
    expect(ring.rotate()).toBe("second");
  });

  it("ignores an empty cut", () => {
    const ring = new KillRing(8);
    ring.push("", { continuing: false, prepend: true });
    expect(ring.size).toBe(0);
  });
});

describe("EditHistory", () => {
  const clone = (state: string): string => state;

  it("gives back the state before the last edit", () => {
    const history = new EditHistory<string>(clone, 10);
    history.record("before");
    expect(history.back("after")).toBe("before");
  });

  it("takes back an undo", () => {
    // The way back from a mistake must not itself be a mistake with no way back.
    const history = new EditHistory<string>(clone, 10);
    history.record("before");
    history.back("after");
    expect(history.forward("before")).toBe("after");
  });

  it("forgets the redo side when a new edit begins", () => {
    // Redoing into an abandoned branch would land somewhere the text never was.
    const history = new EditHistory<string>(clone, 10);
    history.record("before");
    history.back("after");
    history.record("different");

    expect(history.forward("different")).toBeUndefined();
  });

  it("reports that there is nothing to undo or redo", () => {
    const history = new EditHistory<string>(clone, 10);
    expect(history.back("anything")).toBeUndefined();
    expect(history.forward("anything")).toBeUndefined();
  });

  it("holds no more than its limit", () => {
    const history = new EditHistory<string>(clone, 2);
    for (const state of ["a", "b", "c", "d"]) history.record(state);
    // Two kept, so the walk stops after two rather than reaching "a".
    expect(history.back("e")).toBe("d");
    expect(history.back("d")).toBe("c");
    expect(history.back("c")).toBeUndefined();
  });
});

describe("span insertion and removal", () => {
  it("inserts within a row and leaves the caret after the text", () => {
    const placed = insertSpan({ lines: ["ab"], row: 0, column: 1 }, { row: 0, column: 1 }, "XY");
    expect(placed).toEqual({ lines: ["aXYb"], row: 0, column: 3 });
  });

  it("splits a row when the text carries a line break", () => {
    const placed = insertSpan({ lines: ["ab"], row: 0, column: 1 }, { row: 0, column: 1 }, "X\nY");
    expect(placed).toEqual({ lines: ["aX", "Yb"], row: 1, column: 1 });
  });

  it("removes a span within a row", () => {
    const removed = removeSpan({ lines: ["aXYb"], row: 0, column: 0 }, { row: 0, column: 1 }, 2);
    expect(removed.lines).toEqual(["ab"]);
    expect(removed).toMatchObject({ row: 0, column: 1 });
  });

  it("takes the line break with a span that reaches the end of a row", () => {
    // Otherwise removing a multi-line insertion leaves an empty row behind.
    const removed = removeSpan({ lines: ["aX", "Yb"], row: 0, column: 0 }, { row: 0, column: 1 }, 3);
    expect(removed.lines).toEqual(["ab"]);
  });

  it("round-trips an insertion", () => {
    const start = { lines: ["ab"], row: 0, column: 1 };
    const text = "X\nY";
    const placed = insertSpan(start, { row: 0, column: 1 }, text);
    const removed = removeSpan(placed, { row: 0, column: 1 }, text.length);

    expect(removed.lines).toEqual(["ab"]);
  });
});

describe("YankPlacement", () => {
  function host(initial: string): { text: () => string; placement: YankPlacement } {
    let state = { lines: [initial], row: 0, column: initial.length };
    return {
      text: () => state.lines.join("\n"),
      placement: new YankPlacement({
        read: () => state,
        adopt: (next) => {
          state = { lines: [...next.lines], row: next.row, column: next.column };
        },
      }),
    };
  }

  it("replaces the previous yank instead of appending to it", () => {
    // Cycling is asking for a different cut, not for the same text twice.
    const ring = new KillRing(8);
    ring.push("first", { continuing: false, prepend: true });
    ring.push("second", { continuing: false, prepend: true });
    const { text, placement } = host("");

    placement.take(ring);
    expect(text()).toBe("second");

    placement.cycle(ring);
    expect(text()).toBe("first");
  });

  it("reports that there is nothing to cycle to", () => {
    const ring = new KillRing(8);
    ring.push("only", { continuing: false, prepend: true });
    const { placement } = host("");

    // Before a yank has happened.
    expect(placement.cycle(ring)).toBe(false);

    placement.take(ring);
    // A single entry: there is no earlier cut to walk to.
    expect(placement.cycle(ring)).toBe(false);
  });

  it("reports that there is nothing to yank", () => {
    const { placement } = host("");
    expect(placement.take(new KillRing(8))).toBe(false);
  });
});
