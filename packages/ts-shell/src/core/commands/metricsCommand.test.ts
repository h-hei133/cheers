import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runMetricsCommand } from "./metricsCommandRuntime.js";
import { runLogCommand } from "./logCommandRuntime.js";
import { RotatingFileSink, setGlobalRotatingFileSink } from "../../observability/rotatingFileSink.js";
import type { CommandContext } from "./types.js";
import type { StructuredLogEntry } from "../../observability/types.js";

/**
 * `/metrics` is the reading half of the metrics feature, not a convenience.
 *
 * Metric values are carried in the `fields` object of a structured log line, and
 * `/log tail` renders only the timestamp, level, component and message — so the
 * numbers are written but invisible. The last test here pins that difference,
 * because if `/log tail` ever starts rendering fields, the reason this command
 * exists changes and a reader should know.
 */

const context = { cwd: process.cwd() } as CommandContext;
const tempDirs: string[] = [];

function sinkWith(entries: readonly StructuredLogEntry[]): RotatingFileSink {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "metrics-cmd-"));
  tempDirs.push(dir);
  const sink = new RotatingFileSink({ logDir: dir, filePrefix: "test" });
  for (const entry of entries) sink.write(entry);
  setGlobalRotatingFileSink(sink);
  return sink;
}

function metricEntry(overrides: {
  message: string;
  metric: "count" | "ms";
  count: number;
  total: number;
  max: number;
  fields?: Record<string, unknown>;
}): StructuredLogEntry {
  return {
    timestamp: new Date().toISOString(),
    level: "info",
    traceId: "t",
    spanId: "s",
    component: "metric",
    message: overrides.message,
    fields: {
      metric: overrides.metric,
      count: overrides.count,
      total: overrides.total,
      max: overrides.max,
      ...overrides.fields,
    },
  };
}

afterEach(() => {
  setGlobalRotatingFileSink(null);
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("runMetricsCommand", () => {
  it("says so when nothing has been recorded", async () => {
    sinkWith([]);
    const result = await runMetricsCommand([], context);
    expect(result.output).toContain("No metrics recorded yet");
  });

  it("shows a count metric with its total", async () => {
    sinkWith([metricEntry({ message: "tool.calls", metric: "count", count: 3, total: 3, max: 3, fields: { tool: "read" } })]);
    const result = await runMetricsCommand([], context);
    expect(result.output).toContain("tool.calls");
    expect(result.output).toContain("tool=read");
    expect(result.output).toContain("total 3");
  });

  it("shows a timing metric as an average and a maximum", async () => {
    // Two lines for the same metric: the average is over the calls, not the lines.
    sinkWith([
      metricEntry({ message: "tool.duration", metric: "ms", count: 2, total: 40, max: 30, fields: { tool: "bash" } }),
      metricEntry({ message: "tool.duration", metric: "ms", count: 2, total: 60, max: 50, fields: { tool: "bash" } }),
    ]);
    const result = await runMetricsCommand([], context);
    // 100ms over 4 calls.
    expect(result.output).toContain("avg 25ms");
    expect(result.output).toContain("max 50ms");
  });

  it("ignores a log line that is not a metric", async () => {
    sinkWith([
      {
        timestamp: new Date().toISOString(),
        level: "info",
        traceId: "t",
        spanId: "s",
        component: "shell",
        message: "something ordinary happened",
        fields: { metric: "count", count: 99 },
      },
      metricEntry({ message: "tool.calls", metric: "count", count: 1, total: 1, max: 1 }),
    ]);
    const result = await runMetricsCommand([], context);
    expect(result.output).not.toContain("something ordinary happened");
    expect(result.output).toContain("tool.calls");
  });

  it("reports the numbers that the log reader cannot", async () => {
    // The reason this command exists: the same line, read two ways.
    sinkWith([metricEntry({ message: "tool.calls", metric: "count", count: 7, total: 7, max: 7, fields: { tool: "read" } })]);

    const metrics = await runMetricsCommand([], context);
    const logs = await runLogCommand(["tail"], context);

    expect(metrics.output).toContain("total 7");
    // The log reader knows the metric fired but not what it measured.
    expect(logs.output).toContain("tool.calls");
    expect(logs.output).not.toContain("total 7");
  });

  it("reads metrics from an earlier process's log file", async () => {
    // The sink writes one file per process — `<prefix>.<date>.<pid>.log`. Reading
    // only the current file would show nothing on the run after the one that did
    // the work, which is exactly backwards: the numbers are interesting once that
    // session has ended. Distinct PIDs stand in for distinct processes.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "metrics-cmd-old-"));
    tempDirs.push(dir);
    const earlier = new RotatingFileSink({ logDir: dir, filePrefix: "test", pid: 111_111 });
    earlier.write(metricEntry({ message: "tool.calls", metric: "count", count: 4, total: 4, max: 4, fields: { tool: "bash" } }));

    const current = new RotatingFileSink({ logDir: dir, filePrefix: "test", pid: 222_222 });
    setGlobalRotatingFileSink(current);

    // Sanity: the two sinks really are on different files, or this proves nothing.
    expect(current.getCurrentFilePath()).not.toBe(earlier.getCurrentFilePath());

    const result = await runMetricsCommand([], context);
    expect(result.output).toContain("tool=bash");
    expect(result.output).toContain("total 4");
  });
});
