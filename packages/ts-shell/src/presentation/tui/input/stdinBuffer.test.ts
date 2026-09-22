import { describe, expect, it } from "vitest";
import { StdinBuffer } from "./stdinBuffer.js";

interface Harness {
  readonly buffer: StdinBuffer;
  readonly keys: string[];
  readonly pastes: string[];
  fire(): void;
}

function harness(): Harness {
  let timers: Array<{ id: number; run: () => void }> = [];
  let nextId = 1;
  const keys: string[] = [];
  const pastes: string[] = [];
  const buffer = new StdinBuffer({
    setTimer: (run) => {
      const id = nextId++;
      timers.push({ id, run });
      return id;
    },
    clearTimer: (handle) => {
      timers = timers.filter((timer) => timer.id !== handle);
    },
  });
  buffer.onKey((event) => keys.push(event.keyId));
  buffer.onPaste((text) => pastes.push(text));
  return {
    buffer,
    keys,
    pastes,
    fire: () => {
      const due = timers;
      timers = [];
      for (const timer of due) timer.run();
    },
  };
}

describe("keystroke assembly", () => {
  it("splits a fused chunk into one event per character", () => {
    const { buffer, keys } = harness();
    buffer.feed("abc");
    expect(keys).toEqual(["a", "b", "c"]);
  });

  it("delivers a scalar above the BMP as one event", () => {
    const { buffer, keys } = harness();
    buffer.feed("\u{1f680}");
    expect(keys).toEqual(["\u{1f680}"]);
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
    const { buffer, keys } = harness();
    buffer.feed("\x1b[");
    buffer.flush();
    expect(keys).toEqual([]);
    buffer.feed("x");
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
    const { buffer, keys, pastes } = harness();
    buffer.feed("\x1b[200~hello\nworld\x1b[201~x");
    expect(pastes).toEqual(["hello\nworld"]);
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

  it("holds a partial start marker without emitting its bytes", () => {
    const { buffer, keys } = harness();
    buffer.feed("\x1b[200");
    expect(keys).toEqual([]);
  });
});
