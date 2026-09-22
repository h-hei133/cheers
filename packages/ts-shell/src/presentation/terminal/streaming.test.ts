import { describe, expect, it, vi } from "vitest";
import { StreamingRenderer } from "./streaming.js";

function captureStdout(): { written: string[]; restore: () => void } {
  const written: string[] = [];
  const original = process.stdout.write;
  const spy = vi.fn((chunk: unknown) => {
    written.push(String(chunk));
    return true;
  });
  process.stdout.write = spy as unknown as typeof process.stdout.write;
  return { written, restore: () => (process.stdout.write = original) };
}

describe("stdout channel", () => {
  it("writes lines with a newline and chunks without one", () => {
    const { written, restore } = captureStdout();
    try {
      const renderer = new StreamingRenderer();
      renderer.renderLine("line");
      renderer.renderChunk("chunk");
      expect(written).toEqual(["line\n", "chunk"]);
    } finally {
      restore();
    }
  });
});

describe("captured channel", () => {
  it("hands output to the sink instead of the device", () => {
    // A differential host must never let prose reach the device directly: the
    // write would land wherever the cursor sits and corrupt the frame.
    const { written, restore } = captureStdout();
    try {
      const renderer = new StreamingRenderer();
      const lines: string[] = [];
      const chunks: string[] = [];
      renderer.setSink({ line: (text) => lines.push(text), chunk: (text) => chunks.push(text) });
      renderer.renderLine("line");
      renderer.renderChunk("chunk");
      renderer.clearLine();
      expect(lines).toEqual(["line"]);
      expect(chunks).toEqual(["chunk"]);
      expect(written).toEqual([]);
    } finally {
      restore();
    }
  });

  it("reports whether it is capturing, so callers can suppress their own chrome", () => {
    const renderer = new StreamingRenderer();
    expect(renderer.captured).toBe(false);
    renderer.setSink({ line: () => {}, chunk: () => {} });
    expect(renderer.captured).toBe(true);
    renderer.clearSink();
    expect(renderer.captured).toBe(false);
  });

  it("returns to the device once the sink is cleared", () => {
    const { written, restore } = captureStdout();
    try {
      const renderer = new StreamingRenderer();
      renderer.setSink({ line: () => {}, chunk: () => {} });
      renderer.clearSink();
      renderer.renderLine("after");
      expect(written).toEqual(["after\n"]);
    } finally {
      restore();
    }
  });

  it("exposes every method the runtime streaming path calls", () => {
    // The old ad-hoc capture object omitted renderChunk, which threw on the first
    // streamed token of every turn.
    const renderer = new StreamingRenderer();
    for (const method of ["renderLine", "renderChunk", "flush", "clearLine"] as const) {
      expect(typeof renderer[method]).toBe("function");
    }
  });
});
