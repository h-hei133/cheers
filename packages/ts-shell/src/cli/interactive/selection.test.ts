import { describe, expect, it, vi } from "vitest";
import { DragSelection, extractSelection } from "./selection.js";
import { parseMouseReport } from "../../presentation/tui/input/mouse.js";

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
});
