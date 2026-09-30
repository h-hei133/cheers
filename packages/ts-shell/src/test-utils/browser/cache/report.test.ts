import { describe, expect, it } from "vitest";
import { renderBrowserCacheMultiprocessReport } from "./report.js";
import type { BrowserCacheStressResult } from "./model.js";

describe("browser cache multiprocess report", () => {
  it("renders safe stress summaries without raw output", () => {
    const report = renderBrowserCacheMultiprocessReport({
      scenarioId: "route110-report",
      name: "report",
      status: "passed",
      startedAt: "2026-05-17T02:00:00.000Z",
      finishedAt: "2026-05-17T02:00:01.000Z",
      processes: [
        {
          stepId: "writer",
          role: "writer",
          status: "passed",
          exitCode: 0,
          signal: null,
          timedOut: false,
          durationMs: 10,
          outputLineCount: 12,
          warnings: [],
          evidence: [],
          process: {
            spec: { command: "node", args: [], cwd: "/tmp", timeoutMs: 10, promptSummary: "hidden" },
            exitCode: 0,
            signal: null,
            timedOut: false,
            durationMs: 10,
            output: {
              stdout: "RAW_SECRET should not render",
              stderr: "",
              combined: "RAW_SECRET should not render",
              stdoutLineCount: 1,
              stderrLineCount: 0,
              combinedLineCount: 1,
            },
            evidence: [],
            warnings: [],
            redactions: [],
          },
        },
      ],
      integrity: {
        status: "healthy",
        validRecordCount: 1,
        activeCount: 1,
        replayableCount: 1,
        corruptedCount: 0,
        unsafeCount: 0,
        skippedCount: 0,
        duplicateActiveCount: 0,
        overBudgetCount: 0,
      },
      lock: { status: "missing", warnings: [] },
      assertions: {
        processCount: 1,
        passedCount: 1,
        blockedCount: 0,
        failedCount: 0,
        timedOutCount: 0,
        rawLeakCount: 0,
      },
      warnings: [],
      blockers: [],
      evidence: [],
      nextAction: "none",
      redactions: [],
    } satisfies BrowserCacheStressResult);

    expect(report).toContain("Processes: 1");
    expect(report).toContain("Provider/model call: none");
    expect(report).not.toContain("RAW_SECRET");
  });
});
