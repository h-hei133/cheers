import { describe, expect, it } from "vitest";
import { StdinBuffer } from "./stdinBuffer.js";

interface Harness {
  readonly buffer: StdinBuffer;
  readonly keys: string[];
  readonly pastes: string[];
  readonly issues: Array<"too-large" | undefined>;
  readonly delays: number[];
  fire(): void;
}

function harness(options: { readonly maxPasteBytes?: number } = {}): Harness {
  let timers: Array<{ id: number; run: () => void }> = [];
  let nextId = 1;
  const keys: string[] = [];
  const pastes: string[] = [];
  const issues: Array<"too-large" | undefined> = [];
  const delays: number[] = [];
  const buffer = new StdinBuffer({
    maxPasteBytes: options.maxPasteBytes,
    setTimer: (run, delayMs) => {
      const id = nextId++;
      delays.push(delayMs);
      timers.push({ id, run });
      return id;
    },
    clearTimer: (handle) => {
      timers = timers.filter((timer) => timer.id !== handle);
    },
  });
  buffer.onKey((event) => keys.push(event.keyId));
  buffer.onPaste((text, issue) => { pastes.push(text); issues.push(issue); });
  return {
    buffer,
    keys,
    pastes,
    issues,
    delays,
    fire: () => {
      const due = timers;
      timers = [];
      for (const timer of due) timer.run();
    },
  };
}

describe("keystroke assembly", () => {
  it("splits a fused chunk into one event per character", () => {
    const { buffer, keys, fire } = harness();
    buffer.feed("abc");
    fire();
    expect(keys).toEqual(["a", "b", "c"]);
  });

  it("delivers a scalar above the BMP as one event", () => {
    const { buffer, keys, fire } = harness();
    buffer.feed("\u{1f680}");
    fire();
    expect(keys).toEqual(["\u{1f680}"]);
  });

  it("delivers a multi-codepoint grapheme as one event", () => {
    const { buffer, keys, fire } = harness();
    buffer.feed("👨‍👩‍👧‍👦");
    fire();
    expect(keys).toEqual(["👨‍👩‍👧‍👦"]);
  });

  it("reassembles a multi-codepoint grapheme split across chunks", () => {
    const { buffer, keys, fire } = harness();
    buffer.feed("👨");
    buffer.feed("\u200d");
    buffer.feed("👩‍👧‍👦");
    expect(keys).toEqual([]);
    fire();
    expect(keys).toEqual(["👨‍👩‍👧‍👦"]);
  });

  it("reassembles a combining mark split from its base", () => {
    const { buffer, keys, fire } = harness();
    buffer.feed("e");
    buffer.feed("\u0301");
    expect(keys).toEqual([]);
    fire();
    expect(keys).toEqual(["é"]);
  });

  it("reassembles a combining mark split from ASCII punctuation", () => {
    const { buffer, keys, fire } = harness();
    buffer.feed("!");
    buffer.feed("\u0301");
    expect(keys).toEqual([]);
    fire();
    expect(keys).toEqual(["!́"]);
  });

  it("reassembles a keycap split from its punctuation base", () => {
    const { buffer, keys, fire } = harness();
    buffer.feed("*");
    buffer.feed("\ufe0f");
    buffer.feed("\u20e3");
    expect(keys).toEqual([]);
    fire();
    expect(keys).toEqual(["*️⃣"]);
  });

  it("holds the trailing cluster of a fused text chunk", () => {
    const { buffer, keys, fire } = harness();
    buffer.feed("x👨");
    buffer.feed("\u200d");
    buffer.feed("👩‍👧‍👦");
    expect(keys).toEqual(["x"]);
    fire();
    expect(keys).toEqual(["x", "👨‍👩‍👧‍👦"]);
  });

  it("holds text after an escape sequence until its combining mark arrives", () => {
    const { buffer, keys, fire } = harness();
    buffer.feed("\x1b[Ae");
    buffer.feed("\u0301");
    expect(keys).toEqual(["up"]);
    fire();
    expect(keys).toEqual(["up", "é"]);
  });

  it("holds text after a paste until its combining mark arrives", () => {
    const { buffer, keys, pastes, fire } = harness();
    buffer.feed("\x1b[200~p\x1b[201~e");
    buffer.feed("\u0301");
    expect(pastes).toEqual(["p"]);
    expect(keys).toEqual([]);
    fire();
    expect(keys).toEqual(["é"]);
  });

  it("does not defer controls", () => {
    const { buffer, keys } = harness();
    buffer.feed("\x7f");
    expect(keys).toEqual(["backspace"]);
  });

  it("uses the short cluster hold and the longer partial-escape hold", () => {
    const { buffer, delays } = harness();
    buffer.feed("a");
    expect(delays.at(-1)).toBe(8);
    buffer.feed("\x1b");
    expect(delays.at(-1)).toBe(40);
  });

  it("reassembles a sequence split across chunks", () => {
    const { buffer, keys } = harness();
    buffer.feed("\x1b");
    buffer.feed("[A");
    expect(keys).toEqual(["up"]);
  });

  it("reassembles a tilde sequence split mid-parameters", () => {
    const { buffer, keys } = harness();
    buffer.feed("\x1b[");
    buffer.feed("3~");
    expect(keys).toEqual(["delete"]);
  });
});

describe("newline handling", () => {
  it("delivers a bare line feed as the newline chord", () => {
    const { buffer, keys } = harness();
    buffer.feed("\n");
    expect(keys).toEqual(["ctrl+j"]);
  });

  it("collapses a CRLF pair into one Enter", () => {
    // Otherwise a terminal that sends CRLF for Enter submits and then leaves a
    // stray newline in the next draft.
    const { buffer, keys } = harness();
    buffer.feed("\r\n");
    expect(keys).toEqual(["enter"]);
  });
});

describe("the lone escape ambiguity", () => {
  it("holds a bare escape rather than guessing", () => {
    const { buffer, keys } = harness();
    buffer.feed("\x1b");
    expect(keys).toEqual([]);
  });

  it("delivers it as the Escape key once the hold expires", () => {
    // Holding forever is the failure that makes Escape do nothing at all.
    const { buffer, keys, fire } = harness();
    buffer.feed("\x1b");
    fire();
    expect(keys).toEqual(["escape"]);
  });

  it("splits a meta-escape chord into escape then the key", () => {
    const { buffer, keys } = harness();
    buffer.feed("\x1b\x1b[A");
    expect(keys).toEqual(["escape", "up"]);
  });

  it("discards an incomplete sequence on flush rather than leaking its bytes", () => {
    // No terminal sends a truncated CSI, so releasing "[" as typed text would
    // only ever corrupt the draft.
    const { buffer, keys, fire } = harness();
    buffer.feed("\x1b[");
    buffer.flush();
    expect(keys).toEqual([]);
    buffer.feed("x");
    fire();
    expect(keys).toEqual(["x"]);
  });

  it("releases a held escape on an explicit flush", () => {
    const { buffer, keys } = harness();
    buffer.feed("\x1b");
    buffer.flush();
    expect(keys).toEqual(["escape"]);
  });
});

describe("bracketed paste", () => {
  it("emits the block as one paste and resumes keys after it", () => {
    const { buffer, keys, pastes, fire } = harness();
    buffer.feed("\x1b[200~hello\nworld\x1b[201~x");
    expect(pastes).toEqual(["hello\nworld"]);
    fire();
    expect(keys).toEqual(["x"]);
  });

  it("waits for a terminator split across chunks", () => {
    const { buffer, pastes } = harness();
    buffer.feed("\x1b[200~abc\x1b[201");
    expect(pastes).toEqual([]);
    buffer.feed("~");
    expect(pastes).toEqual(["abc"]);
  });

  it("releases an unterminated block as text instead of holding it", () => {
    const { buffer, pastes, fire } = harness();
    buffer.feed("\x1b[200~abc");
    expect(pastes).toEqual([]);
    fire();
    expect(pastes).toEqual(["abc"]);
  });

  it("refuses an oversized paste without delivering its body", () => {
    const { buffer, keys, pastes, issues, fire } = harness({ maxPasteBytes: 5 });
    buffer.feed("\x1b[200~123456\x1b[201~x");
    expect(pastes).toEqual([""]);
    expect(issues).toEqual(["too-large"]);
    fire();
    expect(keys).toEqual(["x"]);
  });

  it("keeps refusing an oversized paste split across chunks until its terminator", () => {
    const { buffer, pastes, issues } = harness({ maxPasteBytes: 5 });
    buffer.feed("\x1b[200~123");
    buffer.feed("456");
    expect(pastes).toEqual([]);
    buffer.feed("\x1b[201~");
    expect(pastes).toEqual([""]);
    expect(issues).toEqual(["too-large"]);
  });

  it("holds a partial start marker without emitting its bytes", () => {
    const { buffer, keys } = harness();
    buffer.feed("\x1b[200");
    expect(keys).toEqual([]);
  });
});
