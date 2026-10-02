import { describe, expect, it, vi } from "vitest";
import { StdinBuffer } from "./stdinBuffer.js";

describe("appearance reports through stdin", () => {
  it.each([
    ["\x1b[?997;1n", "dark"], ["\x1b[?997;2n", "light"],
    ["\x1b]11;rgb:ffff/ffff/ffff\x07", "light"],
    ["\x1b]11;rgb:00/00/00\x1b\\", "dark"],
    ["\x1b]11;rgb:f/f/f\x07", "light"],
    ["\x1b]11;#ffffff\x07", "light"], ["\x1b]11;#000000000000\x07", "dark"],
  ])("reassembles %j at every split boundary", (report, expected) => {
    for (let split = 1; split < report.length; split++) {
      const onAppearance = vi.fn();
      const key = vi.fn();
      const input = new StdinBuffer({ onAppearance });
      input.onKey(key);
      try {
        input.feed("x" + report.slice(0, split));
        input.feed(report.slice(split) + "y");
        expect(onAppearance.mock.calls).toEqual([[expected]]);
        expect(key.mock.calls.map(([event]) => event.text).join("")).toBe("xy");
      } finally { input.dispose(); }
    }
  });

  it("gives explicit scheme reports precedence over background inference", () => {
    const onAppearance = vi.fn();
    const input = new StdinBuffer({ onAppearance });
    try {
      input.feed("\x1b]11;rgb:ff/ff/ff\x07\x1b[?997;1n\x1b]11;rgb:ff/ff/ff\x07\x1b[?997;2n");
      expect(onAppearance.mock.calls).toEqual([["light"], ["dark"], ["light"]]);
    } finally { input.dispose(); }
  });

  it("never interprets bracketed paste contents as live reports", () => {
    const onAppearance = vi.fn();
    const paste = vi.fn();
    const input = new StdinBuffer({ onAppearance });
    input.onPaste(paste);
    const body = "\x1b[?997;2n\x1b]11;rgb:ff/ff/ff\x07";
    try {
      for (const scalar of "\x1b[200~" + body + "\x1b[201~") input.feed(scalar);
      expect(paste.mock.calls).toEqual([[body]]);
      expect(onAppearance).not.toHaveBeenCalled();
    } finally { input.dispose(); }
  });

  it("ignores malformed colors and stopped input without changing appearance", () => {
    const onAppearance = vi.fn();
    const input = new StdinBuffer({ onAppearance });
    for (const value of ["?", "rgb:ff/ff/gg", "rgb:fffff/0/0", "rgb:ff/ff/ff/00", "#fff"]) {
      input.feed(`\x1b]11;${value}\x07`);
    }
    input.feed("\x1b[?997;0n");
    input.dispose();
    input.feed("\x1b[?997;2n");
    expect(onAppearance).not.toHaveBeenCalled();
  });
});


it.each([
  ["\x1b[?997;", "2n"],
  ["\x1b]11;rgb:ffff/", "ffff/ffff\x07"],
  ["\x1b]11;rgb:ffff/ffff/ffff\x1b", "\\"],
])("quarantines a delayed report beginning %j beyond the key hold timeout", (head, tail) => {
  vi.useFakeTimers();
  const onAppearance = vi.fn();
  const key = vi.fn();
  const input = new StdinBuffer({ onAppearance });
  input.onKey(key);
  try {
    input.feed(head);
    vi.advanceTimersByTime(5000);
    expect(vi.getTimerCount()).toBe(0);
    input.feed(tail + "x");
    expect(onAppearance.mock.calls).toEqual([["light"]]);
    expect(key.mock.calls.map(([event]) => event.keyId)).toEqual(["x"]);
  } finally { input.dispose(); vi.useRealTimers(); }
});

it("discards oversized report payloads through their terminator and resumes typing", () => {
  const onAppearance = vi.fn();
  const key = vi.fn();
  const input = new StdinBuffer({ onAppearance });
  input.onKey(key);
  try {
    input.feed("\x1b]11;" + "f".repeat(9000));
    input.flush();
    input.feed("/ffff/ffff\x07x");
    input.feed("\x1b[?997;" + "1;".repeat(400));
    input.flush();
    input.feed("2ny");
    input.feed("\x1b[?997;1A\x1b[?997A");
    input.feed("\x1b[?997;" + "1;".repeat(400) + "A");
    expect(onAppearance).not.toHaveBeenCalled();
    expect(key.mock.calls.map(([event]) => event.keyId)).toEqual(["x", "y"]);
    input.feed("\x1b]11;unfinished\x1b[A");
    expect(key.mock.lastCall?.[0].keyId).toBe("up");
  } finally { input.dispose(); }
});

it("stops dispatching the current chunk when a key listener disposes input", () => {
  const onAppearance = vi.fn();
  const input = new StdinBuffer({ onAppearance });
  input.onKey(() => input.dispose());
  input.feed("x\x1b[?997;2n");
  expect(onAppearance).not.toHaveBeenCalled();
});
