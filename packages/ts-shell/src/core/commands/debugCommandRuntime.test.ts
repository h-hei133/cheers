import { beforeEach, describe, expect, it, vi } from "vitest";
import { runDebugCommand } from "./debugCommandRuntime.js";
import type { CommandContext } from "./types.js";

const state = vi.hoisted(() => ({
  logs: {
    entries: [{ message: "first" }, { message: "second" }],
    status: "partial" as const,
    filesInspected: 2,
    unreadableFiles: 1,
  },
  metrics: {
    samples: [{ value: 1 }],
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
vi.mock("../../observability/diagnostics.js", () => ({
  readStructuredLogs: () => state.logs,
}));
vi.mock("../../observability/crashLog.js", () => ({
  readCrashLog: () => state.crashes,
}));
vi.mock("../../observability/metrics/reader.js", () => ({
  readMetrics: () => state.metrics,
}));
vi.mock("../../observability/startupTiming.js", () => ({
  formatTimingReport: () => "Startup phases: ready\nEvent loop delay: p95=7.0ms max=9.0ms",
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function context(getToolPool: CommandContext["getToolPool"]): CommandContext {
  return { cwd: process.cwd(), getToolPool };
}

describe("/debug", () => {
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
      tools: { count: 0, names: [] },
    });
    expect(result.output).toContain("unavailable");
  });

  it("rejects unknown arguments without producing a diagnostics report", async () => {
    const result = await runDebugCommand(["unknown"], context(vi.fn()));

    expect(result.output).toContain("Invalid /debug arguments");
    expect(result.report).toBeUndefined();
  });
});
