import { runBrowserActionLoopExecutor } from "../context/browserActionLoopExecutor.js";
import type { BrowserRuntimeExecutor } from "../context/browserRuntimeExecutor.js";
import type { BrowserRuntimeManifestLoadResult } from "../context/browserRuntimeManifest.js";
import type {
  BrowserEvalBenchmarkScore,
  BrowserEvalBenchmarkTask,
} from "./browserEvalBenchmarkModel.js";

export async function runBrowserEvalBenchmark(input: {
  readonly tasks: readonly BrowserEvalBenchmarkTask[];
  readonly manifestLoad: BrowserRuntimeManifestLoadResult;
  readonly executor: BrowserRuntimeExecutor;
}): Promise<readonly BrowserEvalBenchmarkScore[]> {
  const scores: BrowserEvalBenchmarkScore[] = [];
  for (const task of input.tasks) {
    const result = await runBrowserActionLoopExecutor({
      request: task.request,
      manifestLoad: input.manifestLoad,
      executor: input.executor,
    });
    const passed = task.expectations.every((expectation) => {
      if (expectation.kind === "contains") {
        return result.observation?.textSummary.includes(expectation.text) ?? false;
      }
      if (expectation.kind === "executed") {
        return result.receipt.executed === expectation.value;
      }
      return result.policy.status === expectation.policyStatus;
    });
    scores.push({
      taskId: task.taskId,
      passed,
      score: passed ? 1 : 0,
      evidence: [
        ...result.evidence,
        `browser-eval-benchmark:${passed ? "passed" : "failed"}`,
        "browser-eval-benchmark:no-provider-or-model-call",
        "browser-eval-benchmark:no-public-network",
      ],
    });
  }
  return scores;
}
