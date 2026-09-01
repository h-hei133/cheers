import { describe, expect, it } from "vitest";
import { supportsFullScreenSurface } from "./surfaceCapability.js";

const tty = (isTTY: boolean): NodeJS.ReadStream => ({ isTTY }) as unknown as NodeJS.ReadStream;
const out = (isTTY: boolean): NodeJS.WriteStream => ({ isTTY }) as unknown as NodeJS.WriteStream;

describe("surface capability", () => {
  it("requires a real terminal on both ends", () => {
    expect(supportsFullScreenSurface(tty(true), out(true))).toBe(true);
  });

  it("refuses when output is a pipe", () => {
    // Painting a differential frame into a byte stream nobody interprets leaves
    // escape sequences in the captured output and no usable UI.
    expect(supportsFullScreenSurface(tty(true), out(false))).toBe(false);
  });

  it("refuses when input is a pipe", () => {
    expect(supportsFullScreenSurface(tty(false), out(true))).toBe(false);
  });

  it("refuses when either end is missing", () => {
    expect(supportsFullScreenSurface(undefined, out(true))).toBe(false);
    expect(supportsFullScreenSurface(tty(true), undefined)).toBe(false);
  });
});
