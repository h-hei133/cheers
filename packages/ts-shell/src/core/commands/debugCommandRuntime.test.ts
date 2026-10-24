import { beforeEach, describe, expect, it, vi } from "vitest";
import { runDebugCommand } from "./debugCommandRuntime.js";
import type { CommandContext } from "./types.js";
import { inspectCrashLog } from '../../observability/crashLog.js';
import { readStructuredLogs } from '../../observability/diagnostics.js';
import { readMetrics } from '../../observability/metrics/reader.js';
import { ShellCommandRuntime } from '../shell/command.js';

const state = vi.hoisted(() => ({
  logs: {
    entries: [{ message: "first" }, { message: "second" }],
    status: "partial" as const,
    filesInspected: 2,
    unreadableFiles: 1,
  },
  metrics: {
    samples: [{ name: 'requests', unit: 'count', total: 1, count: 1, max: 1, tags: {} }],
    limit: 2000,
    status: "partial" as const,
    filesInspected: 1,
    unreadableFiles: 2,
  },
  crashes: [{ message: "crash" }],
}));

vi.mock("../../observability/rotatingFileSink.js", () => ({
  getGlobalRotatingFileSink: () => ({
    getLogDir: () => "/logs",
    getCurrentFilePath: () => "/logs/current.jsonl",
  }),
}));
vi.mock("../../observability/diagnostics.js", async importOriginal => ({
  ...await importOriginal<typeof import('../../observability/diagnostics.js')>(),
  readStructuredLogs: vi.fn(() => state.logs),
}));
vi.mock("../../observability/crashLog.js", () => ({
  MAX_CRASH_RECORDS: 5,
  inspectCrashLog: vi.fn(() => ({ records: state.crashes, status: 'reported', invalidRecords: 0 })),
}));
vi.mock("../../observability/metrics/reader.js", () => ({
  readMetrics: vi.fn(() => state.metrics),
}));
vi.mock("../../observability/startupTiming.js", () => ({
  formatTimingReport: () => "Startup phases: ready\nEvent loop delay: p95=7.0ms max=9.0ms",
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(inspectCrashLog).mockReturnValue({ records: state.crashes as never, status: 'reported', invalidRecords: 0 });
  vi.mocked(readStructuredLogs).mockReturnValue(state.logs as never);
  vi.mocked(readMetrics).mockReturnValue(state.metrics as never);
});

function context(getToolPool: CommandContext["getToolPool"]): CommandContext {
  return { cwd: process.cwd(), getToolPool };
}

describe("/debug", () => {
  it.each(['summary', 'tools'])('uses one %s command owner while retaining ordinary source failures', async action => {
    const commands = new ShellCommandRuntime(), pool = vi.fn(async () => { throw new Error('PRIVATE_SOURCE'); });
    const run = vi.fn(<T>(operation: (signal: AbortSignal) => Promise<T>) => commands.run(operation));
    const result = await runDebugCommand([action], { ...context(pool), runCancellable: run });
    expect(run).toHaveBeenCalledOnce(); expect(pool).toHaveBeenCalledOnce(); expect(commands.current).toBeUndefined();
    expect(result.output).toContain('unavailable'); expect(result.output).not.toContain('PRIVATE_SOURCE');
  });

  it.each(['summary', 'tools'])('preserves original cancellation within one registered %s owner', async action => {
    const original = new AbortController(), commands = new ShellCommandRuntime();
    const run = vi.fn(<T>(operation: (signal: AbortSignal) => Promise<T>) => commands.run(operation));
    const pool = vi.fn(async (signal?: AbortSignal) => {
      expect(commands.current).toBeDefined(); expect(signal).toBeDefined(); expect(signal).not.toBe(original.signal);
      original.abort(); return new Map();
    });
    await expect(runDebugCommand([action], { ...context(pool), signal: original.signal, runCancellable: run }))
      .rejects.toMatchObject({ name: 'AbortError' });
    expect(run).toHaveBeenCalledOnce(); expect(commands.current).toBeUndefined();
  });

  it.each(['summary', 'tools'])('withholds %s fallback when tool acquisition invalidates admission', async action => {
    let stale = false;
    await expect(runDebugCommand([action], { ...context(async () => { stale = true; throw new Error('PRIVATE_SOURCE'); }),
      admission: () => stale ? 'original binding changed' : undefined,
    })).rejects.toThrow('original binding changed');
  });

  it.each(['summary', 'tools'])('rejects pre-cancelled %s before reading sources', async action => {
    const controller = new AbortController(), pool = vi.fn(); controller.abort();
    await expect(runDebugCommand([action], { ...context(pool), signal: controller.signal }))
      .rejects.toMatchObject({ name: 'AbortError' });
    expect(pool).not.toHaveBeenCalled(); expect(readStructuredLogs).not.toHaveBeenCalled();
    expect(readMetrics).not.toHaveBeenCalled(); expect(inspectCrashLog).not.toHaveBeenCalled();
  });

  it("keeps partial diagnostics and the actual tool-pool count visible", async () => {
    const result = await runDebugCommand([], context(async () => new Map([
      ["bash", {} as never],
      ["read", {} as never],
    ])));

    expect(result.report?.facts).toMatchObject({
      status: "partial",
      logs: { entries: 2, filesInspected: 2, unreadableFiles: 1 },
      crashes: 1,
      metrics: { samples: 1, filesInspected: 1, unreadableFiles: 2 },
      tools: { count: 2, names: ["bash", "read"] },
    });
    expect(result.output).toContain("1 log file(s) could not be read; counts are partial.");
    expect(result.output).toContain("2 metric log file(s) could not be read; values are partial.");
    expect(result.report?.facts.timing).toContain("Event loop delay");
  });

  it("reports an unavailable tool pool instead of claiming zero available tools", async () => {
    const result = await runDebugCommand([], context(async () => {
      throw new Error("tool pool unavailable");
    }));

    expect(result.report?.facts).toMatchObject({
      status: "partial",
      tools: { status: 'unavailable', count: null, names: [] },
    });
    expect(result.output).toContain("unavailable");
  });

  it("rejects unknown arguments without producing a diagnostics report", async () => {
    const result = await runDebugCommand(["unknown"], context(vi.fn()));

    expect(result.output).toContain("Invalid /debug arguments");
    expect(result.report).toBeUndefined();
  });

  it('does not claim an absent tool-pool capability reports zero tools', async () => {
    const result = await runDebugCommand([], context(undefined));
    expect(result.report?.facts.tools).toEqual({ status: 'unavailable', count: null, names: [] });
    expect(result.output).toContain('| Available tools | unknown | unavailable |');
    const detail = await runDebugCommand(['tools'], context(undefined));
    expect(detail.report?.facts).toEqual({ status: 'unavailable', count: null });
  });

  it('preserves an unavailable crash count in the summary and detail', async () => {
    vi.mocked(inspectCrashLog).mockReturnValue({ records: [], status: 'unavailable', reason: 'invalid', invalidRecords: 0 });
    const result = await runDebugCommand([], context(async () => new Map()));
    expect(result.report?.facts).toMatchObject({ status: 'partial', crashes: null, crashSource: { status: 'unavailable', reason: 'invalid' } });
    expect(result.output).toContain('| Crash records | unknown | unavailable |');
    const detail = await runDebugCommand(['crashes'], context(undefined));
    expect(detail.report?.facts.observedRecords).toBeNull();
    expect(detail.output).toContain('the count is unknown');
    expect(detail.output).not.toContain('Showing 0 of 0');
  });

  it('uses the existing metric and timing owners without reading other sources', async () => {
    const pool = vi.fn();
    const metrics = await runDebugCommand(['metrics'], context(pool));
    expect(metrics.report?.facts).toMatchObject({ source: 'structured-log-tails', status: 'partial', samplesRead: 1 });
    const timing = await runDebugCommand(['timings'], context(pool));
    expect(timing.output).toContain('Event loop delay');
    expect(inspectCrashLog).not.toHaveBeenCalled();
    expect(pool).not.toHaveBeenCalled();
  });

  it('keeps unreadable sources distinct from empty sources in structured facts', async () => {
    vi.mocked(readStructuredLogs).mockReturnValue({ entries: [], status: 'unavailable', filesInspected: 0, unreadableFiles: 0 });
    vi.mocked(readMetrics).mockReturnValue({ samples: [], status: 'unavailable', filesInspected: 0, unreadableFiles: 0, limit: 2000 });
    const result = await runDebugCommand([], context(async () => new Map()));
    expect(result.report?.facts).toMatchObject({ status: 'partial',
      logs: { status: 'unavailable', entries: null }, metrics: { status: 'unavailable', samples: null } });
  });

  it('redacts metric details through the original report owner', async () => {
    vi.mocked(readMetrics).mockReturnValue({ samples: [{ name: 'api_key=synthetic-sensitive-name', unit: 'count',
      total: 1, count: 1, max: 1, tags: { reason: 'Authorization: Bearer synthetic-sensitive-tag' } }],
      status: 'reported', filesInspected: 1, unreadableFiles: 0, limit: 2000 });
    const result = await runDebugCommand(['metrics'], context(undefined));
    expect(result.report?.facts.samplesRead).toBe(1);
    expect(JSON.stringify(result)).not.toContain('synthetic-sensitive');
  });

  it('redacts tool catalog and summary names while keeping original byte costs and never executing a tool', async () => {
    const execute = vi.fn();
    const name = 'api_key=synthetic-sensitive-name';
    const description = `${'x'.repeat(100)} sk-synthetic-sensitive-description`;
    const contextWithTools = context(async () => new Map([[name, { name, description, argsSchema: { type: 'object' }, execute } as never]]));
    const detail = await runDebugCommand(['tools'], contextWithTools);
    expect(detail.report?.facts).toMatchObject({ count: 1, size: { descriptionBytes: Buffer.byteLength(description) } });
    expect(JSON.stringify(detail)).not.toContain('synthetic-sensitive');
    expect(JSON.stringify(detail)).not.toContain('sk-synth');
    const summary = await runDebugCommand([], contextWithTools);
    expect(summary.report?.facts.tools).toMatchObject({ count: 1, status: 'reported' });
    expect(JSON.stringify(summary)).not.toContain('synthetic-sensitive');
    expect(execute).not.toHaveBeenCalled();
  });
});
