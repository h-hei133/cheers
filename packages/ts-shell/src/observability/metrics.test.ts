import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
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
import { DURATION_BOUNDS_MS, durationBucket } from './metrics/histogram.js';
import { runSessionTrace } from './tracing/runtime.js';

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
    const histogram = line?.fields.histogram as { version: number; counts: number[] };
    expect(histogram.version).toBe(1);
    expect(histogram.counts[durationBucket(10)]).toBe(1);
    expect(histogram.counts[durationBucket(30)]).toBe(1);
    expect(histogram.counts.reduce((sum, count) => sum + count, 0)).toBe(2);
  });

  it('bounds series and accepts measurements for existing keys after the buffer is full', () => {
    capture();
    for (let index = 0; index < 128; index++) recordTiming('tool.duration', index, { tool: String(index) });
    recordTiming('tool.duration', 10, { tool: 'overflow' });
    recordTiming('tool.duration', NaN, { tool: '0' });
    recordTiming('tool.duration', -1, { tool: '0' });
    recordTiming('tool.duration', 61_000, { tool: '0', metric: 'forged', total: 'forged', runId: 'forged' });
    flushMetrics();
    expect(written).toHaveLength(129);
    const observed = written.find(entry => entry.fields.tool === '0')?.fields;
    expect(observed).toMatchObject({ metric: 'ms', count: 2, total: 61_000, max: 61_000 });
    expect(observed?.runId).toBeUndefined();
    const histogram = observed?.histogram as { counts: number[] };
    expect(histogram.counts.at(-1)).toBe(1);
    expect(histogram.counts).toHaveLength(DURATION_BOUNDS_MS.length + 1);
    expect(written.at(-1)).toMatchObject({ message: 'metrics.dropped', fields: { metric: 'count', total: 3 } });
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
  it('flushes only the captured run while another run still owns pending samples', async () => {
    capture();
    let enterFirst!: () => void, releaseFirst!: () => void;
    let enterSecond!: () => void, releaseSecond!: () => void;
    const firstReady = new Promise<void>(resolve => { enterFirst = resolve; });
    const secondReady = new Promise<void>(resolve => { enterSecond = resolve; });
    const firstHold = new Promise<void>(resolve => { releaseFirst = resolve; });
    const secondHold = new Promise<void>(resolve => { releaseSecond = resolve; });
    const first = runSessionTrace({ sessionId: 'first', workspaceRoot: process.cwd() }, async () => {
      recordTiming('tool.duration', 2, { tool: 'read', sessionId: 'forged' });
      enterFirst();
      await firstHold;
      flushMetrics();
      recordTiming('tool.duration', 5, { tool: 'read' });
    });
    await firstReady;
    const second = runSessionTrace({ sessionId: 'second', workspaceRoot: process.cwd() }, async () => {
      recordTiming('tool.duration', 200, { tool: 'read' });
      enterSecond();
      await secondHold;
      throw new Error('Original product failure');
    });
    try {
      await secondReady;
      releaseFirst();
      await first;
      expect(written.map(entry => [entry.fields.sessionId, entry.fields.total])).toEqual([['first', 2], ['first', 5]]);
      const firstRun = written[0]?.fields.runId;
      expect(firstRun).toMatch(/^[a-f0-9]{16}$/);
      expect(written[1]?.fields.runId).toBe(firstRun);
      expect(written[0]?.traceId).toBe(written[1]?.traceId);
      releaseSecond();
      await expect(second).rejects.toThrow('Original product failure');
      expect(written.at(-1)?.fields).toMatchObject({ sessionId: 'second', total: 200, count: 1 });
      expect(written.at(-1)?.fields.runId).not.toBe(firstRun);
    } finally {
      releaseFirst(); releaseSecond();
      await Promise.allSettled([first, second]);
    }
  });

  it('keeps detached late measurements out of process and successor-run buffers', async () => {
    capture();
    let release!: () => void;
    let detached!: Promise<void>;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await runSessionTrace({ sessionId: 'settled', workspaceRoot: process.cwd() }, () => {
      recordCount('scoped', 1);
      detached = gate.then(() => { recordCount('late', 1); flushMetrics(); });
    });
    release();
    await detached;
    flushMetrics();
    expect(written.map(entry => entry.message)).toEqual(['scoped']);
  });

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

describe("the exit flush", () => {
  function runFixture(mode: string, dir: string): { status: number | null } {
    const repoRoot = path.resolve(process.cwd(), "../..");
    const tsxCli = path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");
    const fixturePath = path.join(process.cwd(), "src", "test-utils", "metricsExitProcess.ts");
    // The sink declines to write to a file when it sees a test environment, which
    // is what keeps the suite from littering the real log directory. The child is
    // a real process doing real work, so those markers come off; its log goes to a
    // temporary directory instead.
    const env = { ...process.env, CHEERS_LOG_DIR: dir };
    delete env.VITEST;
    delete env.NODE_ENV;
    const result = spawnSync(process.execPath, [tsxCli, fixturePath, mode], {
      cwd: process.cwd(),
      env,
      encoding: "utf8",
      timeout: 30_000,
    });
    return { status: result.status };
  }

  function logText(dir: string): string {
    const logFile = fs.readdirSync(dir).find((name) => name.endsWith(".log"));
    return logFile ? fs.readFileSync(path.join(dir, logFile), "utf8") : "";
  }

  it("keeps what was recorded when the process exits mid-turn", () => {
    // The flush normally happens at the end of a turn. Ctrl+D while one is in
    // flight unwinds nothing, so without a hook on the way out the buffer is lost
    // — and the runs that went wrong are the ones whose numbers disappear.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "metrics-exit-"));
    try {
      expect(runFixture("exit", dir).status).toBe(0);
      const written = logText(dir);
      expect(written).toContain("cli.prompts");
      expect(written).toContain('"total":2');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("keeps them when the turn ends in a crash", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "metrics-crash-"));
    try {
      expect(runFixture("throw", dir).status).not.toBe(0);
      expect(logText(dir)).toContain("cli.prompts");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('flushes an active run at process exit under the original captured trace identity', () => {
    const scratch = path.join(os.tmpdir(), 'cheers-test');
    fs.mkdirSync(scratch, { recursive: true });
    const dir = fs.mkdtempSync(path.join(scratch, 'metrics-run-exit-'));
    try {
      expect(runFixture('scoped', dir).status).toBe(0);
      const entries = logText(dir).trim().split('\n').map(line => JSON.parse(line) as StructuredLogEntry);
      const original = entries.find(entry => entry.message === 'tool.duration');
      expect(original?.fields).toMatchObject({ sessionId: 'scoped', runId: original?.spanId, count: 1, total: 20 });
      expect(original?.fields.runId).toMatch(/^[a-f0-9]{16}$/);
      expect(original?.traceId).toMatch(/^[a-f0-9]{32}$/);
      const histogram = original?.fields.histogram as { counts: number[] };
      expect(histogram.counts[durationBucket(20)]).toBe(1);
      expect(entries.find(entry => entry.message === 'cli.prompts')?.fields).toMatchObject({ sessionId: 's1', total: 2 });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
