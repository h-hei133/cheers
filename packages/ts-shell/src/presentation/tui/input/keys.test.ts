import { describe, it, expect } from "vitest";
import { matchesKey, parseKeyEvent } from "./keys.js";

describe("Keystroke Parser & Normalizer", () => {
  it("parses single byte control keys", () => {
    expect(parseKeyEvent("\r").keyId).toBe("enter");
    expect(parseKeyEvent("\t").keyId).toBe("tab");
    expect(parseKeyEvent("\x1b").keyId).toBe("escape");
    expect(parseKeyEvent("\x7f").keyId).toBe("backspace");
  });

  it("parses Ctrl+A through Ctrl+Z control codes", () => {
    expect(parseKeyEvent("\x03").keyId).toBe("ctrl+c"); // ASCII 3 -> Ctrl+C
    expect(parseKeyEvent("\x0f").keyId).toBe("ctrl+o"); // ASCII 15 -> Ctrl+O
    expect(parseKeyEvent("\x14").keyId).toBe("ctrl+t"); // ASCII 20 -> Ctrl+T
  });

  it("parses Kitty keyboard protocol sequence", () => {
    // \x1b[99;5u -> char 'c' with ctrl modifier
    const parsed = parseKeyEvent("\x1b[99;5u");
    expect(parsed.name).toBe("c");
    expect(parsed.ctrl).toBe(true);
    expect(parsed.keyId).toBe("ctrl+c");
  });

  it("parses Alt+Key escape sequences", () => {
    const parsed = parseKeyEvent("\x1be");
    expect(parsed.alt).toBe(true);
    expect(parsed.keyId).toBe("alt+e");
  });

  it("matchesKey helper accurately matches key ids", () => {
    expect(matchesKey("\x03", "ctrl+c")).toBe(true);
    expect(matchesKey("\r", "enter")).toBe(true);
    expect(matchesKey("x", "x")).toBe(true);
    expect(matchesKey("y", "x")).toBe(false);
  });
});
