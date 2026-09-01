import { describe, expect, it } from "vitest";
import { matchesKey, parseKeyEvent } from "./keys.js";

const id = (data: string): string => parseKeyEvent(data).keyId;

describe("control keys", () => {
  it("names the single-byte keys", () => {
    expect(id("\r")).toBe("enter");
    expect(id("\n")).toBe("enter");
    expect(id("\t")).toBe("tab");
    expect(id("\x1b")).toBe("escape");
    expect(id("\x7f")).toBe("backspace");
  });

  it("names control chords", () => {
    expect(id("\x03")).toBe("ctrl+c");
    expect(id("\x0b")).toBe("ctrl+k");
    expect(id("\x15")).toBe("ctrl+u");
  });
});

describe("legacy escape sequences", () => {
  it("decodes arrows from both CSI and SS3 forms", () => {
    expect(id("\x1b[A")).toBe("up");
    expect(id("\x1bOA")).toBe("up");
    expect(id("\x1b[D")).toBe("left");
  });

  it("decodes the tilde family that a final-byte-only parser drops", () => {
    // Without these, Delete and the paging keys leak into the editor as the
    // literal text "[3~".
    expect(id("\x1b[3~")).toBe("delete");
    expect(id("\x1b[5~")).toBe("pageup");
    expect(id("\x1b[6~")).toBe("pagedown");
    expect(id("\x1b[1~")).toBe("home");
    expect(id("\x1b[4~")).toBe("end");
    expect(id("\x1b[2~")).toBe("insert");
    expect(id("\x1b[15~")).toBe("f5");
  });

  it("decodes letter-final home and end", () => {
    expect(id("\x1b[H")).toBe("home");
    expect(id("\x1b[F")).toBe("end");
    expect(id("\x1bOP")).toBe("f1");
  });

  it("decodes modifier parameters", () => {
    expect(id("\x1b[1;5C")).toBe("ctrl+right");
    expect(id("\x1b[1;3D")).toBe("alt+left");
    expect(id("\x1b[3;2~")).toBe("shift+delete");
    expect(id("\x1b[Z")).toBe("shift+tab");
  });

  it("decodes legacy meta chords", () => {
    expect(id("\x1bd")).toBe("alt+d");
    expect(id("\x1b\x7f")).toBe("alt+backspace");
  });

  it("labels mouse reports without trying to decode them", () => {
    expect(id("\x1b[<0;10;5M")).toBe("mouse");
  });
});

describe("enhanced keyboard protocol", () => {
  it("maps named CSI-u code points", () => {
    expect(id("\x1b[27u")).toBe("escape");
    expect(id("\x1b[13;2u")).toBe("shift+enter");
    expect(id("\x1b[57414u")).toBe("enter");
  });

  it("maps character code points and keeps their text", () => {
    expect(id("\x1b[97u")).toBe("a");
    expect(parseKeyEvent("\x1b[97u").text).toBe("a");
    expect(id("\x1b[97;5u")).toBe("ctrl+a");
    expect(parseKeyEvent("\x1b[97;5u").text).toBe("");
  });

  it("drops key release events so a keypress is not doubled", () => {
    expect(id("\x1b[97;1:3u")).toBe("");
  });
});

describe("printable input", () => {
  it("carries the text to insert", () => {
    expect(parseKeyEvent("x").text).toBe("x");
    expect(parseKeyEvent("你").text).toBe("你");
    expect(parseKeyEvent("\u{1f680}").text).toBe("\u{1f680}");
  });

  it("matches against a canonical id", () => {
    expect(matchesKey("\x1b[3~", "delete")).toBe(true);
    expect(matchesKey("\x1b[3~", "insert")).toBe(false);
  });
});
