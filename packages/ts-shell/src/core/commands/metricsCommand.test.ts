import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runMetricsCommand } from "./metricsCommandRuntime.js";
import { runLogCommand } from "./logCommandRuntime.js";
import { RotatingFileSink, setGlobalRotatingFileSink } from "../../observability/rotatingFileSink.js";
import type { CommandContext } from "./types.js";
import type { StructuredLogEntry } from "../../observability/types.js";
import * as logFiles from '../../observability/logs/files.js';
import { flushMetrics, recordCount, recordTiming, resetMetrics } from '../../observability/metrics.js';
import { setStructuredLogSink } from '../../observability/structuredLogger.js';

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
  vi.restoreAllMocks(); resetMetrics(); setStructuredLogSink(null);
  setGlobalRotatingFileSink(null);
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("runMetricsCommand", () => {
  it('keeps units and delimiter-bearing names and tags separate from recording through the report', async () => {
    const sink = sinkWith([]); setStructuredLogSink(entry => sink.write(entry)); resetMetrics();
    const tags = { tool: 'a|outcome=b' };
    recordCount('mixed', 2, tags); recordTiming('mixed', 6, tags);
    recordCount('mixed', 3, { tool: 'a', outcome: 'b' });
    tags.tool = 'mutated'; flushMetrics();
    const result = await runMetricsCommand([], context);
    expect(result.report?.facts.groups).toMatchObject([
      { name: 'mixed', unit: 'count', total: 2, tags: { tool: 'a|outcome=b' } },
      { name: 'mixed', unit: 'count', total: 3, tags: { tool: 'a', outcome: 'b' } },
      { name: 'mixed', unit: 'ms', total: 6, average: 6, tags: { tool: 'a|outcome=b' } },
    ]);
    expect(result.report?.facts).toMatchObject({ scope: 'all-processes-and-sessions', status: 'reported', samplesRead: 3 });
    expect(result.output).not.toContain('mutated');
  });

  it('ignores primitive and incomplete records and stops reading older files after enough valid samples', async () => {
    const sink = sinkWith([metricEntry({ message: 'newest', metric: 'count', count: 1, total: 7, max: 7 })]);
    fs.appendFileSync(sink.getCurrentFilePath(), '\nnull\n[]\n42\n{"component":"metric","message":"missing"}\n');
    const older = path.join(sink.getLogDir(), 'old.log'); fs.writeFileSync(older, 'null\n'); fs.utimesSync(older, 1, 1);
    const tail = vi.spyOn(logFiles, 'tailLines');
    const result = await runMetricsCommand(['1'], context);
    expect(result.report?.facts).toMatchObject({ samplesRead: 1, filesInspected: 1, sampleLimit: 1 });
    expect(result.report?.facts.groups).toMatchObject([{ name: 'newest', total: 7 }]);
    expect(tail).toHaveBeenCalledTimes(1); expect(result.output).not.toContain('missing');
  });

  it('reports partial and unavailable log reads without leaking error bodies or claiming an empty measurement', async () => {
    const sink = sinkWith([metricEntry({ message: 'available', metric: 'count', count: 1, total: 1, max: 1 })]);
    const failed = path.join(sink.getLogDir(), 'failed.log'); fs.writeFileSync(failed, 'fixture');
    const original = logFiles.tailLines;
    const read = vi.spyOn(logFiles, 'tailLines').mockImplementation((file, ...rest) => {
      if (file === failed) throw new Error('PRIVATE_LOG_BODY'); return original(file, ...rest);
    });
    const partial = await runMetricsCommand([], context);
    expect(partial.report?.facts).toMatchObject({ status: 'partial', unreadableFiles: 1 });
    expect(partial.output).toContain('available samples only'); expect(partial.output).not.toContain('PRIVATE_LOG_BODY');
    read.mockImplementation(() => { throw new Error('PRIVATE_LOG_BODY'); });
    const unavailable = await runMetricsCommand([], context);
    expect(unavailable.report?.facts.status).toBe('unavailable');
    expect(unavailable.output).toContain('Metrics unavailable'); expect(unavailable.output).not.toContain('No metrics recorded');
  });
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

  it("reads a metric that was written after the log rotated", async () => {
    // The sink renames a full file to `.log.<n>`. Filtering on `.log` alone
    // dropped those parts, so everything written after a rotation was invisible.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "metrics-cmd-rot-"));
    tempDirs.push(dir);
    const sink = new RotatingFileSink({ logDir: dir, filePrefix: "test" });
    setGlobalRotatingFileSink(sink);
    const rotated = `${sink.getCurrentFilePath()}.3`;
    fs.writeFileSync(
      rotated,
      `${JSON.stringify(metricEntry({ message: "tool.calls", metric: "count", count: 2, total: 2, max: 2, fields: { tool: "rotated" } }))}\n`,
    );

    const result = await runMetricsCommand([], context);
    expect(result.output).toContain("tool=rotated");
  });

  it("keeps a metric that many ordinary log lines follow", async () => {
    // The limit used to be applied to raw lines, so a burst of ordinary logging
    // pushed every metric out of the window and the command reported, with
    // confidence, that nothing had been recorded.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "metrics-cmd-noise-"));
    tempDirs.push(dir);
    const sink = new RotatingFileSink({ logDir: dir, filePrefix: "test" });
    sink.write(metricEntry({ message: "tool.calls", metric: "count", count: 1, total: 1, max: 1, fields: { tool: "early" } }));
    const noise: StructuredLogEntry[] = [];
    for (let index = 0; index < 2500; index += 1) {
      noise.push({
        timestamp: new Date().toISOString(),
        level: "info",
        traceId: "t",
        spanId: "s",
        component: "noise",
        message: `line ${index}`,
      });
    }
    for (const entry of noise) sink.write(entry);
    setGlobalRotatingFileSink(sink);

    const result = await runMetricsCommand([], context);
    expect(result.output).not.toContain("No metrics recorded yet");
    expect(result.output).toContain("tool=early");
  });

  it("reads the value field from a line an older version wrote", async () => {
    // Lines written before this command existed carry `value`, not `total`.
    // Read as an unknown field they defaulted to zero, so real prompts were
    // reported as a measured-looking `total 0`.
    const sink = sinkWith([
      {
        timestamp: new Date().toISOString(),
        level: "info",
        traceId: "t",
        spanId: "s",
        component: "metric",
        message: "cli.prompts",
        fields: { metric: "count", value: 9 },
      },
    ]);
    setGlobalRotatingFileSink(sink);

    const result = await runMetricsCommand([], context);
    expect(result.output).toContain("total 9");
    expect(result.output).not.toContain("total 0");
  });

  it("attributes a count to the session that produced it", async () => {
    // The tag reaches disk but was not in the parsed set, so a count could not be
    // traced to a session even though the writer had recorded which one.
    const sink = sinkWith([
      metricEntry({ message: "cli.prompts", metric: "count", count: 1, total: 1, max: 1, fields: { sessionId: "sess_A" } }),
      metricEntry({ message: "cli.prompts", metric: "count", count: 1, total: 1, max: 1, fields: { sessionId: "sess_B" } }),
    ]);
    setGlobalRotatingFileSink(sink);

    const result = await runMetricsCommand([], context);
    expect(result.output).toContain("sessionId=sess_A");
    expect(result.output).toContain("sessionId=sess_B");
  });
});
