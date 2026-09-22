import { describe, expect, it } from "vitest";
import { coalesceAdjacentSgr, endsWithReset, LINE_TERMINATOR } from "./sgr.js";

describe("SGR coalescing", () => {
  it("returns plain text unchanged", () => {
    expect(coalesceAdjacentSgr("plain")).toBe("plain");
  });

  it("merges a run of adjacent sequences into one", () => {
    expect(coalesceAdjacentSgr("\x1b[0m\x1b[31mX")).toBe("\x1b[0;31mX");
    expect(coalesceAdjacentSgr("\x1b[0m\x1b[1m\x1b[36mX\x1b[0m")).toBe("\x1b[0;1;36mX\x1b[0m");
  });

  it("leaves a lone sequence alone", () => {
    expect(coalesceAdjacentSgr("\x1b[31mabc")).toBe("\x1b[31mabc");
  });

  it("merges a complete extended colour with what follows it", () => {
    expect(coalesceAdjacentSgr("\x1b[38;2;1;2;3m\x1b[1mX")).toBe("\x1b[38;2;1;2;3;1mX");
  });

  it("refuses to merge into a truncated extended colour", () => {
    // Fusing here would consume the next sequence's parameters as colour
    // components and repaint the row in an unrelated colour.
    expect(coalesceAdjacentSgr("\x1b[38;2;1m\x1b[31mX")).toBe("\x1b[38;2;1m\x1b[31mX");
  });

  it("does not touch non-SGR sequences", () => {
    expect(coalesceAdjacentSgr("\x1b[2K\x1b[31mX")).toBe("\x1b[2K\x1b[31mX");
  });

  it("treats an empty parameter list as a reset", () => {
    expect(coalesceAdjacentSgr("\x1b[m\x1b[31mX")).toBe("\x1b[0;31mX");
  });
});

describe("line termination", () => {
  it("recognises a terminated row", () => {
    expect(endsWithReset(`text${LINE_TERMINATOR}`)).toBe(true);
    expect(endsWithReset("text")).toBe(false);
  });
});
