import { describe, expect, it } from "vitest";
import { isMouseSequence, parseMouseReport } from "./mouse.js";

describe("mouse report decoding", () => {
  it("decodes an SGR press with zero-based coordinates", () => {
    expect(parseMouseReport("\x1b[<0;12;5M")).toEqual({
      kind: "press",
      button: 0,
      column: 11,
      row: 4,
      shift: false,
      alt: false,
      ctrl: false,
    });
  });

  it("distinguishes a drag from a press by the motion bit", () => {
    expect(parseMouseReport("\x1b[<32;12;5M")?.kind).toBe("drag");
    expect(parseMouseReport("\x1b[<0;12;5M")?.kind).toBe("press");
  });

  it('separates unbuttoned motion from drag and release in SGR and X10 reports', () => {
    expect(parseMouseReport('\x1b[<35;12;5M')).toMatchObject({ kind: 'move', button: 3, column: 11, row: 4 });
    expect(parseMouseReport('\x1b[<35;12;5m')?.kind).toBe('release');
    expect(parseMouseReport(`\x1b[M${String.fromCharCode(67, 44, 37)}`)?.kind).toBe('move');
    expect(parseMouseReport('\x1b[<32;12;5M')?.kind).toBe('drag');
  });

  it("reads a release from the lowercase terminator", () => {
    expect(parseMouseReport("\x1b[<0;12;5m")?.kind).toBe("release");
  });

  it("reports modifiers so a shift-drag can be handed back to the terminal", () => {
    const report = parseMouseReport("\x1b[<4;1;1M");

    expect(report?.shift).toBe(true);
    expect(report?.alt).toBe(false);
  });

  it("separates wheel reports from buttons", () => {
    expect(parseMouseReport("\x1b[<64;1;1M")).toMatchObject({ kind: "wheel", button: -1 });
    expect(parseMouseReport("\x1b[<65;1;1M")).toMatchObject({ kind: "wheel", button: 1 });
  });

  it("decodes the X10 encoding, whose release carries no button", () => {
    const press = parseMouseReport(`\x1b[M${String.fromCharCode(32, 33, 34)}`);
    const release = parseMouseReport(`\x1b[M${String.fromCharCode(35, 33, 34)}`);

    expect(press).toMatchObject({ kind: "press", button: 0, column: 0, row: 1 });
    expect(release?.kind).toBe("release");
  });

  it("recognises mouse sequences without confusing them for keys", () => {
    expect(isMouseSequence("\x1b[<0;1;1M")).toBe(true);
    expect(isMouseSequence("\x1b[A")).toBe(false);
    expect(isMouseSequence("\x1b[200~")).toBe(false);
  });

  it("returns nothing for a sequence that only looks like a report", () => {
    expect(parseMouseReport("\x1b[<0;1M")).toBeUndefined();
  });
});
