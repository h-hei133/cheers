import { describe, expect, it } from "vitest";
import {
  detectLineEnding,
  splitByteOrderMark,
  toUnixLines,
  withLineEnding,
} from "./fileText.js";

describe("separating a file's stored shape from its text", () => {
  it("splits a leading byte order mark off", () => {
    expect(splitByteOrderMark("\uFEFFhello")).toEqual({ bom: "\uFEFF", text: "hello" });
    expect(splitByteOrderMark("hello")).toEqual({ bom: "", text: "hello" });
    // A mark in the middle is content, not a mark, and must not be taken.
    expect(splitByteOrderMark("a\uFEFFb")).toEqual({ bom: "", text: "a\uFEFFb" });
    expect(splitByteOrderMark("\uFEFF")).toEqual({ bom: "\uFEFF", text: "" });
    expect(splitByteOrderMark("")).toEqual({ bom: "", text: "" });
  });

  it("reads the line ending the file opens with", () => {
    expect(detectLineEnding("a\r\nb\r\n")).toBe("\r\n");
    expect(detectLineEnding("a\nb\n")).toBe("\n");
    // Whichever comes first settles it: a stray one later does not change the file.
    expect(detectLineEnding("a\r\nb\nc\r\n")).toBe("\r\n");
    expect(detectLineEnding("a\nb\r\nc\n")).toBe("\n");
    // Nothing to preserve, so the default is what a new file would get.
    expect(detectLineEnding("single line")).toBe("\n");
    expect(detectLineEnding("")).toBe("\n");
  });

  it("reduces every line ending to one form for matching", () => {
    expect(toUnixLines("a\r\nb\r\n")).toBe("a\nb\n");
    expect(toUnixLines("a\rb\r")).toBe("a\nb\n");
    // A lone carriage return is a line ending on very old systems. Leaving it
    // would make the whole file read as a single line.
    expect(toUnixLines("a\rb\nc\r\nd")).toBe("a\nb\nc\nd");
    expect(toUnixLines("unchanged\n")).toBe("unchanged\n");
  });

  it("puts one line ending back on every line", () => {
    expect(withLineEnding("a\nb\n", "\r\n")).toBe("a\r\nb\r\n");
    expect(withLineEnding("a\nb\n", "\n")).toBe("a\nb\n");
    // Text that still holds the file's own ending is normalised first, so this
    // cannot produce a doubled carriage return by being handed the wrong input.
    expect(withLineEnding("a\r\nb\n", "\r\n")).toBe("a\r\nb\r\n");
    expect(withLineEnding("a\rb\n", "\r\n")).toBe("a\r\nb\r\n");
  });

  it("round-trips a file's shape without changing it", () => {
    for (const content of ["a\r\nb\r\n", "a\nb\n", "\uFEFFa\r\nb\r\n", "", "\uFEFF"]) {
      const { bom, text } = splitByteOrderMark(content);
      const ending = detectLineEnding(text);
      expect(bom + withLineEnding(toUnixLines(text), ending)).toBe(content);
    }
  });
});
