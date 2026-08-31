import { describe, it, expect } from "vitest";
import { StdinBuffer } from "./stdinBuffer.js";
import type { ParsedKeyEvent } from "./keys.js";

describe("StdinBuffer Chunk Assembly", () => {
  it("buffers fragmented multi-byte ANSI sequences and emits complete keys", () => {
    const buffer = new StdinBuffer();
    const emitted: ParsedKeyEvent[] = [];
    buffer.onKey((e) => emitted.push(e));

    // Feed fragmented Arrow Up sequence '\x1b', '[', 'A'
    buffer.feed("\x1b");
    expect(emitted.length).toBe(0); // Held in buffer

    buffer.feed("[A");
    expect(emitted.length).toBe(1);
    expect(emitted[0].keyId).toBe("up");
  });

  it("handles bracketed paste mode cleanly", () => {
    const buffer = new StdinBuffer();
    const pasted: string[] = [];
    buffer.onPaste((p) => pasted.push(p));

    buffer.feed("\x1b[200~const a = 1;\nconst b = 2;\x1b[201~");
    expect(pasted.length).toBe(1);
    expect(pasted[0]).toBe("const a = 1;\nconst b = 2;");
  });
});
