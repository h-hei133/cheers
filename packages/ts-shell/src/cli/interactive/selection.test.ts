import { describe, expect, it, vi } from "vitest";
import { DragSelection, extractSelection, highlightSelection } from "./selection.js";
import { parseMouseReport } from "../../presentation/tui/input/mouse.js";
import { CURSOR_MARKER } from "../../presentation/tui/render/paint.js";
const ROWS = [
  "  \x1b[36m▌\x1b[39m explain the retirement rule",
  "",
  "    Blocks stay live while the screen has room for them, and the",
  "    oldest finalized ones retire once it does not.",
  "",
];

describe("selection extraction", () => {
  it("drops the indentation every selected row shares", () => {
    const text = extractSelection(ROWS, { row: 2, column: 0 }, { row: 3, column: 60 });

    expect(text).toBe(
      "Blocks stay live while the screen has room for them, and the\noldest finalized ones retire once it does not.",
    );
  });

  it("keeps a blank row between paragraphs but not at either end", () => {
    const text = extractSelection(
      ["    first", "", "    second", ""],
      { row: 0, column: 0 },
      { row: 3, column: 8 },
    );

    expect(text).toBe("first\n\nsecond");
  });

  it("strips the rail that marks a prompt echo", () => {
    const text = extractSelection(ROWS, { row: 0, column: 0 }, { row: 0, column: 80 });

    expect(text).toBe("explain the retirement rule");
  });

  it("carries no escape sequences into the clipboard", () => {
    const text = extractSelection(["\x1b[1mbold\x1b[0m text here"], { row: 0, column: 0 }, { row: 0, column: 40 });

    expect(text).toBe("bold text here");
  });

  it("cuts a single row to the dragged columns", () => {
    const text = extractSelection(["abcdefghij"], { row: 0, column: 2 }, { row: 0, column: 5 });

    expect(text).toBe("cdef");
  });

  it("reads a backward drag the same as a forward one", () => {
    const forward = extractSelection(ROWS, { row: 2, column: 4 }, { row: 3, column: 20 });
    const backward = extractSelection(ROWS, { row: 3, column: 20 }, { row: 2, column: 4 });

    expect(backward).toBe(forward);
  });

  it("leaves a row that was cut inside its own indent alone", () => {
    const text = extractSelection(ROWS, { row: 2, column: 4 }, { row: 3, column: 60 });

    expect(text).toBe(
      "Blocks stay live while the screen has room for them, and the\noldest finalized ones retire once it does not.",
    );
  });

  it("declines a drag that covers no text, so a click is not a copy", () => {
    expect(extractSelection(ROWS, { row: 1, column: 0 }, { row: 1, column: 1 })).toBeUndefined();
    expect(extractSelection(ROWS, { row: 2, column: 4 }, { row: 2, column: 4 })).toBeUndefined();
  });

  it("clamps a drag that runs past the last painted row", () => {
    const text = extractSelection(["  only row"], { row: 0, column: 2 }, { row: 40, column: 0 });

    expect(text).toBe("only row");
  });

  it("keeps a one cell span that a click decided was a unit", () => {
    // The same span is a click when it came from a drag and a selection when it
    // came from a word click, so the caller has to say which it is.
    expect(extractSelection(["a b"], { row: 0, column: 0 }, { row: 0, column: 0 })).toBeUndefined();
    expect(
      extractSelection(["a b"], { row: 0, column: 0 }, { row: 0, column: 0 }, { kind: "unit" }),
    ).toBe("a");
  });
});

describe("drag tracking", () => {
  function build(): { selection: DragSelection; copied: string[] } {
    const copied: string[] = [];
    const selection = new DragSelection({ rows: () => ROWS }, (text) => copied.push(text));
    return { selection, copied };
  }

  function press(selection: DragSelection, sequence: string): boolean {
    return selection.handle(parseMouseReport(sequence)!);
  }

  function pressAt(selection: DragSelection, sequence: string, now: number): boolean {
    return selection.handle(parseMouseReport(sequence)!, undefined, now);
  }

  it("takes the whole word on a double click", () => {
    // The gesture every editor has. Asserted through the drag rather than on the
    // span helper, because the helper being right does not prove it is wired in.
    const { selection, copied } = build();
    // The mouse report's column is one-based; 18 is inside "live" in the third row.
    const at = "\u001b[<0;18;3M";
    const off = "\u001b[<0;18;3m";

    // A terminal sends a release between the two presses, and it has to be part of
    // the test: the first release is what used to end the click run, which left the
    // second press counting as the first one and the word gesture unreachable.
    press(selection, at);
    press(selection, off);
    press(selection, at);
    press(selection, off);

    expect(copied).toHaveLength(1);
    // The whole word, not the single character the pointer sat on.
    expect(copied[0]).toBe("live");
  });

  it("takes a word of one character", () => {
    // A word unit covers one cell here, and the drag rule that says "one cell is a
    // click, not a selection" must not swallow it: the click decided the unit, so
    // there is nothing ambiguous left to reject.
    const rows = ["a b c"];
    const copied: string[] = [];
    const selection = new DragSelection({ rows: () => rows }, (text) => copied.push(text));

    press(selection, "\u001b[<0;1;1M");
    press(selection, "\u001b[<0;1;1m");
    press(selection, "\u001b[<0;1;1M");
    press(selection, "\u001b[<0;1;1m");

    expect(copied).toEqual(["a"]);
  });

  it("takes the whole line on a triple click", () => {
    const { selection, copied } = build();
    const at = "\x1b[<0;18;3M";
    const off = "\x1b[<0;18;3m";

    press(selection, at);
    press(selection, off);
    press(selection, at);
    press(selection, off);
    press(selection, at);
    press(selection, off);

    // Each release closes a selection and copies it, which is what "copy on
    // release" means: the second click copies the word, and the third widens it to
    // the line and copies that. What the user is left holding is the line.
    expect(copied).toEqual(["live", expect.stringContaining("Blocks stay live while the screen has room")]);
  });

  it("treats a press far apart in time as a new single click", () => {
    // A run has to end, or a later unrelated click would silently widen its
    // selection to the word under it. The clock is passed in, because two presses on
    // one cell are a double click in every other sense and only the interval says
    // they are not.
    const { selection, copied } = build();
    const at = "\x1b[<0;18;3M";

    pressAt(selection, at, 0);
    pressAt(selection, "\x1b[<0;18;3m", 10);
    pressAt(selection, at, 1_000);
    pressAt(selection, "\x1b[<0;18;3m", 1_010);

    // Two single clicks on one cell select nothing, so nothing is copied.
    expect(copied).toEqual([]);
  });

  it("does not continue the run onto a different cell", () => {
    // Two clicks in a row on different cells are two single clicks, so neither
    // takes a word.
    const { selection, copied } = build();

    press(selection, "\x1b[<0;18;3M");
    press(selection, "\x1b[<0;18;3m");
    press(selection, "\x1b[<0;20;3M");
    press(selection, "\x1b[<0;20;3m");

    expect(copied).toEqual([]);
  });

  it("copies once, on release", () => {
    const { selection, copied } = build();

    press(selection, "\x1b[<0;5;3M");
    expect(copied).toEqual([]);
    press(selection, "\x1b[<32;40;4M");
    expect(copied).toEqual([]);
    press(selection, "\x1b[<0;40;4m");

    expect(copied).toHaveLength(1);
    expect(copied[0]).toContain("Blocks stay live");
  });

  it("keeps both words whole when the drag goes backwards", () => {
    // The unit the click chose stays whole, and so does the one the pointer reached.
    // Anchoring on the same end regardless of direction cuts one of them, which of
    // the two depends only on which way the drag went.
    const rows = ["alpha beta gamma"];
    const copied: string[] = [];
    const selection = new DragSelection({ rows: () => rows }, (text) => copied.push(text));

    press(selection, "\u001b[<0;8;1M");
    press(selection, "\u001b[<0;8;1m");
    press(selection, "\u001b[<0;8;1M");
    press(selection, "\u001b[<32;2;1M");
    press(selection, "\u001b[<0;2;1m");

    expect(copied).toEqual(["alpha beta"]);
  });

  it("keeps following the pointer across the gap between two words", () => {
    // A pointer that is plainly moving must move the selection. Holding the last
    // word's end would freeze it until the pointer entered the next word.
    const rows = ["alpha beta gamma"];
    const copied: string[] = [];
    const selection = new DragSelection({ rows: () => rows }, (text) => copied.push(text));

    press(selection, "\u001b[<0;2;1M");
    press(selection, "\u001b[<0;2;1m");
    press(selection, "\u001b[<0;2;1M");
    // The gap between "alpha" and "beta", then the start of "beta".
    press(selection, "\u001b[<32;6;1M");
    expect(selection.span?.to.column).toBe(5);
    press(selection, "\u001b[<32;7;1M");
    expect(selection.span?.to.column).toBe(9);
    press(selection, "\u001b[<0;7;1m");

    expect(copied).toEqual(["alpha beta"]);
  });

  it("hands a shift-drag back to the terminal untouched", () => {
    const { selection, copied } = build();

    expect(press(selection, "\x1b[<4;5;3M")).toBe(false);
    expect(press(selection, "\x1b[<36;40;4M")).toBe(false);
    expect(press(selection, "\x1b[<4;40;4m")).toBe(false);
    expect(copied).toEqual([]);
  });

  it("ignores the wheel and the other buttons", () => {
    const { selection, copied } = build();

    expect(press(selection, "\x1b[<64;5;3M")).toBe(false);
    expect(press(selection, "\x1b[<2;5;3M")).toBe(false);
    expect(copied).toEqual([]);
  });

  it("does not copy on a release that never had a press", () => {
    const { selection, copied } = build();

    expect(press(selection, "\x1b[<0;5;3m")).toBe(false);
    expect(copied).toEqual([]);
  });

  it("reports whether a drag is in flight", () => {
    const { selection } = build();

    expect(selection.dragging).toBe(false);
    press(selection, "\x1b[<0;5;3M");
    expect(selection.dragging).toBe(true);
    press(selection, "\x1b[<0;9;3m");
    expect(selection.dragging).toBe(false);
  });

  it("copies through the sink it was given rather than writing itself", () => {
    const copy = vi.fn();
    const selection = new DragSelection({ rows: () => ROWS }, copy);

    selection.handle(parseMouseReport("\x1b[<0;5;3M")!);
    selection.handle(parseMouseReport("\x1b[<0;40;3m")!);

    expect(copy).toHaveBeenCalledTimes(1);
  });

  it("takes the word under the pointer on a styled row, however far right it is", () => {
    // The pointer names a cell; a rendered line is longer than the row it shows,
    // because its styling is carried by escape sequences that occupy no cells.
    // Reading the line's raw string at the pointer's column therefore lands
    // somewhere further right the user clicked — a word came back sliced into a
    // fragment ("ove" for "over") once the drift passed the line's first style
    // change. The word boundaries are found in the cells the line shows.
    const rows = [
      "\x1b[36m▌\x1b[39m the quick brown fox jumps \x1b[1mover\x1b[22m the lazy dog near the end",
    ];
    const copied: string[] = [];
    const selection = new DragSelection({ rows: () => rows }, (text) => copied.push(text));

    // A visible column well past the line's first style change, inside "over".
    const column = 30;
    const pressAt = `\u001b[<0;${column + 1};1M`;
    const releaseAt = `\u001b[<0;${column + 1};1m`;
    selection.handle(parseMouseReport(pressAt)!);
    selection.handle(parseMouseReport(releaseAt)!);
    selection.handle(parseMouseReport(pressAt)!);
    selection.handle(parseMouseReport(releaseAt)!);

    expect(copied).toEqual(["over"]);
  });

  it("takes the whole visible line on a triple click of a styled row", () => {
    // The same drift in the line case: a row ending in styled text ended the
    // selection short of its real end, because the raw string's idea of the last
    // column was counted against a longer string than the one on screen.
    const rows = ["plain start \x1b[36mstyled end\x1b[39m"];
    const copied: string[] = [];
    const selection = new DragSelection({ rows: () => rows }, (text) => copied.push(text));

    for (let press = 0; press < 3; press += 1) {
      selection.handle(parseMouseReport("\u001b[<0;6;1M")!);
      selection.handle(parseMouseReport("\u001b[<0;6;1m")!);
    }

    expect(copied.at(-1)).toBe("plain start styled end");
  });
});

describe("showing what the drag has covered", () => {
  const plain = ["alpha beta", "", "gamma"];

  it("shades exactly the cells the span covers", () => {
    const [row] = highlightSelection(["abcdef"], { from: { row: 0, column: 1 }, to: { row: 0, column: 3 } });

    expect(row).toBe("a\x1b[7mbcd\x1b[27mef");
  });

  it("leaves rows outside the span untouched", () => {
    const shaded = highlightSelection(plain, { from: { row: 2, column: 0 }, to: { row: 2, column: 1 } });

    expect(shaded[0]).toBe("alpha beta");
    expect(shaded[1]).toBe("");
    expect(shaded[2]).toContain("\x1b[7m");
  });

  it("carries the shading across a blank row so the span reads as one piece", () => {
    const shaded = highlightSelection(plain, { from: { row: 0, column: 0 }, to: { row: 2, column: 4 } });

    expect(shaded.every((row) => row.includes("\x1b[7m"))).toBe(true);
  });

  it("re-arms reverse video after a colour reset inside the span", () => {
    const styled = "\x1b[36mcyan\x1b[39m tail";
    const [row] = highlightSelection([styled], { from: { row: 0, column: 0 }, to: { row: 0, column: 8 } });

    // Without re-arming, the reset that ends the colour also ends the shading and
    // the second half of the selection looks unselected.
    expect(row!.indexOf("\x1b[7m", row!.indexOf("\x1b[39m"))).toBeGreaterThan(0);
  });

  it("shades what it copies, so the two never disagree", () => {
    const span = { from: { row: 0, column: 0 }, to: { row: 0, column: 4 } };
    const [row] = highlightSelection(["alpha beta"], span);
    const copied = extractSelection(["alpha beta"], span.from, span.to);

    expect(copied).toBe("alpha");
    expect(row).toBe("\x1b[7malpha\x1b[27m beta");
  });

  it("publishes a span while the pointer is down and keeps it on release until cleared", () => {
    const selection = new DragSelection({ rows: () => ROWS }, () => undefined);
    expect(selection.span).toBeUndefined();

    selection.handle(parseMouseReport("\x1b[<0;5;3M")!);
    selection.handle(parseMouseReport("\x1b[<32;20;3M")!);
    expect(selection.span).toEqual({ from: { row: 2, column: 4 }, to: { row: 2, column: 19 } });

    selection.handle(parseMouseReport("\x1b[<0;20;3m")!);
    expect(selection.span).toEqual({ from: { row: 2, column: 4 }, to: { row: 2, column: 19 } });

    selection.clear();
    expect(selection.span).toBeUndefined();
  });
  it("orders the span even when the drag ran backwards", () => {
    const selection = new DragSelection({ rows: () => ROWS }, () => undefined);
    selection.handle(parseMouseReport("\x1b[<0;30;4M")!);
    selection.handle(parseMouseReport("\x1b[<32;10;3M")!);

    expect(selection.span?.from.row).toBe(2);
    expect(selection.span?.to.row).toBe(3);
  });

  it("clears selection when canceled", () => {
    const selection = new DragSelection({ rows: () => ROWS }, () => undefined);
    selection.handle(parseMouseReport("\x1b[<0;0;3M")!);
    selection.handle(parseMouseReport("\x1b[<32;10;3M")!);
    expect(selection.span).toBeDefined();
    selection.clear();
    expect(selection.span).toBeUndefined();
  });

  it("copies and clears selection programmatically", () => {
    const copy = vi.fn();
    const selection = new DragSelection({ rows: () => ["first line", "second line"] }, copy);
    selection.handle(parseMouseReport("\x1b[<0;0;1M")!);
    selection.handle(parseMouseReport("\x1b[<32;10;1M")!);
    expect(selection.span).toBeDefined();
    const copied = selection.copyAndClear();
    expect(copied).toBe(true);
    expect(copy).toHaveBeenCalledOnce();
    expect(selection.span).toBeUndefined();
  });

  it("consumes and clears an empty-text selection without copying", () => {
    const copy = vi.fn();
    const selection = new DragSelection({ rows: () => ["", ""] }, copy);
    selection.handle(parseMouseReport("\x1b[<0;0;1M")!);
    selection.handle(parseMouseReport("\x1b[<32;10;1M")!);
    expect(selection.span).toBeDefined();
    const copied = selection.copyAndClear();
    expect(copied).toBe(true);
    expect(copy).not.toHaveBeenCalled();
    expect(selection.span).toBeUndefined();
  });
  it("never shades a row containing CURSOR_MARKER to protect against cursor corruption", () => {
    const rows = [`prompt ${CURSOR_MARKER} draft`];
    const highlighted = highlightSelection(rows, { from: { row: 0, column: 0 }, to: { row: 0, column: 20 } });
    expect(highlighted[0]).toBe(`prompt ${CURSOR_MARKER} draft`);
    expect(highlighted[0]).not.toContain("\x1b[7m");
  });
});

describe("selecting text that is not ASCII", () => {
  const wide = ["一二三四五六七八九十", "\x1b[36m▌\x1b[39m 中文 mixed with ASCII"];

  it("counts a wide character as the two cells it occupies", () => {
    // Columns 0..3 cover the first two characters, not the first four.
    expect(extractSelection(wide, { row: 0, column: 0 }, { row: 0, column: 3 })).toBe("一二");
  });

  it("drops a wide character the drag only half covered", () => {
    // Cells 0..4 cover 一二 whole and half of 三, so 三 is left out rather than
    // rendered as half a character.
    expect(extractSelection(wide, { row: 0, column: 0 }, { row: 0, column: 4 })).toBe("一二");
  });

  it("treats a drag over a single character as a click, not a selection", () => {
    // One character is how click-to-expand reaches a block: a selection has to
    // cover something worth pasting before it is treated as one.
    expect(extractSelection(wide, { row: 0, column: 0 }, { row: 0, column: 1 })).toBeUndefined();
  });

  it("keeps a mixed row intact and strips the rail", () => {
    const text = extractSelection(wide, { row: 1, column: 0 }, { row: 1, column: 40 });

    expect(text).toBe("中文 mixed with ASCII");
  });

  it("carries a multi-row selection back with its line breaks", () => {
    const text = extractSelection(wide, { row: 0, column: 0 }, { row: 1, column: 40 });

    expect(text).toBe("一二三四五六七八九十\n中文 mixed with ASCII");
  });

  it("shades wide characters without splitting one across the boundary", () => {
    const [row] = highlightSelection(["一二三"], { from: { row: 0, column: 0 }, to: { row: 0, column: 3 } });

    expect(row).toBe("\x1b[7m一二\x1b[27m三");
  });
});
