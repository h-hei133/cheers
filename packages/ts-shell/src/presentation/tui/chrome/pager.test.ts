import { describe, expect, it } from "vitest";
import { PAGER_THRESHOLD_ROWS, Pager, pageLongOutput } from "./pager.js";
import { stripAnsi } from "../text/ansi.js";
import { visibleWidth } from "../text/measure.js";

const WIDTH = 60;
const HEIGHT = 12;
const LONG = Array.from({ length: 40 }, (_, index) => `line ${index}`).join("\n");

const plain = (rows: readonly string[]): string[] => rows.map(stripAnsi);

describe("paging long output", () => {
  it("moves long output out of the transcript and leaves a summary", () => {
    const pager = new Pager();
    const block = { text: LONG, diff: "some diff" };

    expect(pageLongOutput(pager, "/log", block)).toBe(true);
    expect(pager.active).toBe(true);
    expect(block.text).toContain("40 lines");
    expect(block.diff).toBeUndefined();
  });

  it("leaves short output where it is", () => {
    const pager = new Pager();
    const block = { text: "one line" };

    expect(pageLongOutput(pager, "/model", block)).toBe(false);
    expect(pager.active).toBe(false);
    expect(block.text).toBe("one line");
  });

  it("keeps the original text for a copy that should not include the chrome", () => {
    const pager = new Pager();
    pageLongOutput(pager, "/log", { text: LONG });

    expect(pager.text).toBe(LONG);
  });

  it("uses a threshold that a normal answer does not cross", () => {
    expect(PAGER_THRESHOLD_ROWS).toBeGreaterThan(8);
  });
});

describe("reading in the pager", () => {
  function open(): Pager {
    const pager = new Pager();
    pager.open("/log", LONG);
    pager.render(WIDTH, HEIGHT);
    return pager;
  }

  it("fills the screen and says where in the text it is", () => {
    const rows = open().render(WIDTH, HEIGHT);

    expect(rows).toHaveLength(HEIGHT);
    expect(plain(rows)[0]).toContain("of");
    for (const row of rows) expect(visibleWidth(row)).toBeLessThanOrEqual(WIDTH);
  });

  it("scrolls down and back", () => {
    const pager = open();
    const first = plain(pager.render(WIDTH, HEIGHT))[2];
    pager.handleKey("pagedown", undefined, HEIGHT);
    const later = plain(pager.render(WIDTH, HEIGHT))[2];
    pager.handleKey("pageup", undefined, HEIGHT);
    const back = plain(pager.render(WIDTH, HEIGHT))[2];

    expect(later).not.toBe(first);
    expect(back).toBe(first);
  });

  it("cannot be scrolled past either end", () => {
    const pager = open();
    for (let press = 0; press < 50; press++) pager.handleKey("pagedown", undefined, HEIGHT);
    const bottom = plain(pager.render(WIDTH, HEIGHT));
    expect(bottom.join("\n")).toContain("line 39");

    for (let press = 0; press < 50; press++) pager.handleKey("pageup", undefined, HEIGHT);
    expect(plain(pager.render(WIDTH, HEIGHT)).join("\n")).toContain("line 0");
  });

  it("filters as you type, and gives the rows back on backspace", () => {
    const pager = open();
    pager.handleKey("3", "3", HEIGHT);
    pager.handleKey("7", "7", HEIGHT);
    expect(plain(pager.render(WIDTH, HEIGHT)).join("\n")).toContain("line 37");
    expect(plain(pager.render(WIDTH, HEIGHT)).join("\n")).not.toContain("line 0\n");

    pager.handleKey("backspace", undefined, HEIGHT);
    pager.handleKey("backspace", undefined, HEIGHT);
    expect(plain(pager.render(WIDTH, HEIGHT)).join("\n")).toContain("line 0");
  });

  it("closes on escape and claims nothing afterwards", () => {
    const pager = open();

    expect(pager.handleKey("escape", undefined, HEIGHT)).toBe(true);
    expect(pager.active).toBe(false);
    expect(pager.handleKey("down", undefined, HEIGHT)).toBe(false);
  });

  it("closes on enter too, so a typed command is not eaten as a filter", () => {
    const pager = open();

    expect(pager.handleKey("enter", undefined, HEIGHT)).toBe(true);
    expect(pager.active).toBe(false);
  });

  it("re-renders for a new width rather than keeping the old wrap", () => {
    const pager = open();
    const narrow = pager.render(30, HEIGHT);
    const wide = pager.render(90, HEIGHT);

    expect(visibleWidth(narrow[2]!)).toBeLessThanOrEqual(30);
    expect(visibleWidth(wide[2]!)).toBeLessThanOrEqual(90);
  });
});
