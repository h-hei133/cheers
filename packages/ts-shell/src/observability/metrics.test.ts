import { afterEach, describe, expect, it } from "vitest";
import {
  flushMetrics,
  pendingMetrics,
  recordCount,
  recordTiming,
  resetMetrics,
} from "./metrics.js";
import { setStructuredLogSink } from "./structuredLogger.js";
import type { StructuredLogEntry } from "./types.js";

/**
 * Metrics are buffered and written once per turn.
 *
 * That is not an optimisation: the log sink appends synchronously, so recording
 * a tool's duration as it happens would put a blocking disk write on the hot path
 * for every tool call. What these check is that the buffering still preserves the
 * numbers — a batch that lost the count or the tags would be worse than no
 * metrics, because it would look like data.
 */

const written: StructuredLogEntry[] = [];

afterEach(() => {
  setStructuredLogSink(null);
  resetMetrics();
  written.length = 0;
});

function capture(): void {
  setStructuredLogSink((entry) => written.push(entry));
}

describe("accumulation", () => {
  it("counts repeated calls under one name and tag set", () => {
    capture();
    recordCount("tool.calls", 1, { tool: "read" });
    recordCount("tool.calls", 1, { tool: "read" });
    recordCount("tool.calls", 1, { tool: "read" });

    flushMetrics();

    const line = written.find((entry) => entry.message === "tool.calls");
    expect(line?.fields.count).toBe(3);
    expect(line?.fields.total).toBe(3);
    // One line for three calls: the point of buffering.
    expect(written.filter((entry) => entry.message === "tool.calls")).toHaveLength(1);
  });

  it("keeps different tools apart", () => {
    capture();
    recordCount("tool.calls", 1, { tool: "read" });
    recordCount("tool.calls", 1, { tool: "bash" });
    flushMetrics();

    const tools = written
      .filter((entry) => entry.message === "tool.calls")
      .map((entry) => entry.fields.tool);
    expect(tools.sort()).toEqual(["bash", "read"]);
  });

  it("sums durations and keeps the slowest", () => {
    capture();
    recordTiming("tool.duration", 10, { tool: "bash" });
    recordTiming("tool.duration", 30, { tool: "bash" });
    flushMetrics();

    const line = written.find((entry) => entry.message === "tool.duration");
    expect(line?.fields.count).toBe(2);
    expect(line?.fields.total).toBe(40);
    expect(line?.fields.max).toBe(30);
    expect(line?.fields.metric).toBe("ms");
  });

  it("does not let one tag order split the same metric", () => {
    // Two calls with the same tags written in a different key order are the same
    // metric; keying on insertion order would produce two rows for one thing.
    capture();
    recordCount("tool.calls", 1, { tool: "read", outcome: "ok" });
    recordCount("tool.calls", 1, { outcome: "ok", tool: "read" });
    flushMetrics();

    expect(written.filter((entry) => entry.message === "tool.calls")).toHaveLength(1);
  });
});

describe("flushing", () => {
  it("writes nothing when nothing was recorded", () => {
    capture();
    flushMetrics();
    expect(written).toHaveLength(0);
  });

  it("empties the buffer, so a second flush writes nothing", () => {
    capture();
    recordCount("tool.calls", 1, { tool: "read" });
    flushMetrics();
    flushMetrics();
    expect(written.filter((entry) => entry.message === "tool.calls")).toHaveLength(1);
  });

  it("starts a fresh batch after a flush", () => {
    capture();
    recordCount("tool.calls", 1, { tool: "read" });
    flushMetrics();
    recordCount("tool.calls", 1, { tool: "read" });
    flushMetrics();

    const counts = written
      .filter((entry) => entry.message === "tool.calls")
      .map((entry) => entry.fields.count);
    expect(counts).toEqual([1, 1]);
  });

  it("names the logger as the metric component", () => {
    // This is what lets the reader tell a metric line from an ordinary one.
    capture();
    recordCount("turn.duration", 1, {});
    flushMetrics();
    expect(written[0]?.component).toBe("metric");
  });
});

describe("pendingMetrics", () => {
  it("reports what is buffered without writing it", () => {
    resetMetrics();
    recordTiming("turn.duration", 42, {});
    const pending = pendingMetrics();
    expect(pending).toHaveLength(1);
    expect(pending[0]?.name).toBe("turn.duration");
    expect(pending[0]?.value).toBe(42);
    expect(pending[0]?.unit).toBe("ms");
  });
});
