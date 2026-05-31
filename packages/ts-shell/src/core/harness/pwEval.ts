import { PwAdapter } from "../context/pwAdapter.js";
import {
  createPwValidationReport,
  failureCodeFromRuntimeStatus,
  pwReportEntryFromEvidence,
  skippedPwReportEntry,
  type PwValidationReport,
  type PwEvalMode,
} from "../context/pwReport.js";
import type { PwRuntimeStatus } from "../context/pwRuntime.js";
import type { BrowserEvalBenchmarkTask } from "./browserEvalBenchmarkModel.js";
import { runBrowserEvalBenchmark } from "../../eval/browser/benchmarkRunner.js";
import {
  createInjectedPwClient,
  createPwManifestLoad,
  PW_JS_FIXTURE,
  PW_STATIC_FIXTURE,
  pwFixtures,
  pwRequest,
} from "./pwFixtures.js";

export function createPwEvalTasks(): readonly BrowserEvalBenchmarkTask[] {
  return [
    {
      taskId: "pw-observe-static",
      description: "observe static Direct Playwright fixture",
      request: pwRequest("observe", "static", undefined, PW_STATIC_FIXTURE),
      expectations: [{ kind: "contains", text: "Static fixture ready" }, { kind: "executed", value: true }],
    },
    {
      taskId: "pw-extract-js",
      description: "extract JS-rendered Direct Playwright text",
      request: pwRequest("extract", "js rendered", undefined, PW_JS_FIXTURE),
      expectations: [{ kind: "contains", text: "JS rendered Playwright fixture ready" }, { kind: "executed", value: true }],
    },
    {
      taskId: "pw-click",
      description: "click controlled Direct Playwright button",
      request: pwRequest("click", "Save draft"),
      expectations: [{ kind: "contains", text: "Clicked Save draft" }, { kind: "executed", value: true }],
    },
    {
      taskId: "pw-type",
      description: "type into controlled Direct Playwright input",
      request: pwRequest("type", "Safe note", "secret typed value"),
      expectations: [{ kind: "contains", text: "Updated Safe note" }, { kind: "executed", value: true }],
    },
  ];
}

export async function runPwEval(input: {
  readonly runtimeStatus: PwRuntimeStatus;
  readonly mode: PwEvalMode;
  readonly adapter?: PwAdapter;
  readonly durationBudgetMs?: number;
  readonly tasks?: readonly BrowserEvalBenchmarkTask[];
}): Promise<PwValidationReport> {
  const tasks = input.tasks ?? createPwEvalTasks();
  const durationBudgetMs = input.durationBudgetMs ?? 5_000;
  if (input.mode === "skipped" || input.runtimeStatus.status !== "ready" && !input.adapter) {
    return createPwValidationReport({
      runtimeStatus: input.runtimeStatus,
      entries: tasks.map((task) => skippedPwReportEntry({
        scenarioId: task.taskId,
        operation: task.request.actionKind,
        reasonCode: failureCodeFromRuntimeStatus(input.runtimeStatus),
        evidenceSummary: input.runtimeStatus.reason,
      })),
      toolServerBackend: "optional-not-default",
    });
  }
  const startedAt = Date.now();
  const executor = input.adapter ?? new PwAdapter({
    status: input.runtimeStatus,
    fixtures: pwFixtures,
    injectedClient: createInjectedPwClient(),
  });
  const scores = await runBrowserEvalBenchmark({
    tasks,
    manifestLoad: createPwManifestLoad(),
    executor,
  });
  const durationMs = Date.now() - startedAt;
  return createPwValidationReport({
    runtimeStatus: input.runtimeStatus,
    entries: scores.map((score) => {
      const task = tasks.find((candidate) => candidate.taskId === score.taskId);
      return pwReportEntryFromEvidence({
        scenarioId: score.taskId,
        operation: task?.request.actionKind ?? "observe",
        mode: input.mode,
        passed: score.passed,
        evidence: score.evidence,
        durationMs,
        durationBudgetMs,
      });
    }),
    toolServerBackend: "optional-not-default",
  });
}
