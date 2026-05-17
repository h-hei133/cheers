import type { BrowserExecutorResult } from "./browserExecutor.js";
import type { BrowserExecutionPolicyDecision } from "./browserExecutionPolicy.js";
import type { BrowserExecutionRequest } from "./browserExecutionContract.js";

export interface BrowserExecutionResult {
  readonly request: BrowserExecutionRequest;
  readonly policy: BrowserExecutionPolicyDecision;
  readonly executorResult: BrowserExecutorResult;
  readonly executed: boolean;
  readonly outcome: "executed" | "blocked" | "failed" | "skipped";
  readonly evidence: readonly string[];
  readonly warnings: readonly string[];
  readonly nextAction: string;
}

export function createBrowserExecutionResult(input: {
  readonly request: BrowserExecutionRequest;
  readonly policy: BrowserExecutionPolicyDecision;
  readonly executorResult: BrowserExecutorResult;
}): BrowserExecutionResult {
  return {
    request: input.request,
    policy: input.policy,
    executorResult: input.executorResult,
    executed: input.executorResult.executed,
    outcome: input.executorResult.status === "executed" ? "executed" : input.executorResult.status,
    evidence: [
      ...input.policy.evidence,
      ...input.executorResult.evidence.map((item) => `browser-executor:${item.label}`),
      "browser-execution-result:no-raw-content",
      "browser-execution-result:no-provider-or-model-call",
      "browser-execution-result:no-session-persistence",
    ],
    warnings: [...input.policy.warnings, ...input.executorResult.warnings],
    nextAction: input.policy.nextAction,
  };
}
