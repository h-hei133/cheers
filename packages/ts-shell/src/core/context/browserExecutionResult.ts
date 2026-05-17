import type { BrowserExecutorResult } from "./browserExecutor.js";
import type { BrowserExecutionPolicyDecision } from "./browserExecutionPolicy.js";
import type { BrowserExecutionRequest } from "./browserExecutionContract.js";
import {
  createBrowserExecutionReceipt,
  type BrowserExecutionReceipt,
} from "./browserExecutionReceipt.js";
import type { BrowserSkillRunnerReadiness } from "./browserSkillRunnerReadiness.js";
import type { BrowserSkillRunnerMetadata } from "./browserSkillRunnerMetadata.js";

export interface BrowserExecutionResult {
  readonly request: BrowserExecutionRequest;
  readonly policy: BrowserExecutionPolicyDecision;
  readonly executorResult: BrowserExecutorResult;
  readonly skillRunnerMetadata?: BrowserSkillRunnerMetadata;
  readonly skillRunnerReadiness?: BrowserSkillRunnerReadiness;
  readonly receipt: BrowserExecutionReceipt;
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
  readonly skillRunnerMetadata?: BrowserSkillRunnerMetadata;
  readonly skillRunnerReadiness?: BrowserSkillRunnerReadiness;
  readonly now?: () => string;
}): BrowserExecutionResult {
  const receipt = createBrowserExecutionReceipt({
    request: input.request,
    policy: input.policy,
    executorResult: input.executorResult,
    skillRunnerMetadata: input.skillRunnerMetadata,
    skillRunnerReadiness: input.skillRunnerReadiness,
    now: input.now,
  });
  return {
    request: input.request,
    policy: input.policy,
    executorResult: input.executorResult,
    skillRunnerMetadata: input.skillRunnerMetadata,
    skillRunnerReadiness: input.skillRunnerReadiness,
    receipt,
    executed: input.executorResult.executed,
    outcome: input.executorResult.status === "executed" ? "executed" : input.executorResult.status,
    evidence: [
      ...input.policy.evidence,
      ...input.executorResult.evidence.map((item) => `browser-executor:${item.label}`),
      `browser-execution-receipt:${receipt.status}`,
      `browser-execution-replay:${receipt.replayReadiness.status}`,
      ...(input.skillRunnerReadiness ? [`browser-skill-runner:${input.skillRunnerReadiness.status}`] : []),
      "browser-execution-result:no-raw-content",
      "browser-execution-result:no-provider-or-model-call",
      "browser-execution-result:no-session-persistence",
    ],
    warnings: [...input.policy.warnings, ...input.executorResult.warnings, ...(input.skillRunnerReadiness?.warnings ?? [])],
    nextAction: input.skillRunnerReadiness?.nextAction ?? input.policy.nextAction,
  };
}
