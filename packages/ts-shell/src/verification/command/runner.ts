import type { QueryEvent } from "../../core/query/runtime/events.js";
import type { ToolDispatcher } from "../../tools/dispatch/dispatcher.js";
import {
  createToolRuntimeProvenanceCollector,
  dispatchRuntimeTool,
  type ToolLifecycleResult,
} from "../../orchestration/toolRuntimeModule.js";
import {
  buildVerificationCommandResult,
  type VerificationCommandResult,
} from "./result.js";
import type { VerificationCommandPlan } from "./plan.js";

export interface VerificationCommandRun {
  readonly plan: VerificationCommandPlan;
  readonly toolResult?: ToolLifecycleResult;
  readonly result: VerificationCommandResult;
  readonly coverage: VerificationCommandCoverage;
  readonly changedFiles: readonly [];
  readonly mutation: "not-run";
  readonly providerCall: "not-run";
  readonly evidence: readonly string[];
}

export interface VerificationCommandCoverage {
  readonly taskId: string;
  readonly coveredFiles: readonly string[];
  readonly uncoveredFiles: readonly string[];
  readonly coverageStatus: string;
}

export async function runVerificationCommand(input: {
  readonly plan: VerificationCommandPlan;
  readonly dispatcher: ToolDispatcher;
  readonly events: QueryEvent[];
  readonly taskId: string;
  readonly workspaceRoot: string;
  readonly sessionId: string;
  readonly coverage?: Omit<VerificationCommandCoverage, "taskId">;
  readonly abortSignal?: AbortSignal;
}): Promise<VerificationCommandRun> {
  const coverage = buildCommandCoverage({
    taskId: input.taskId,
    coverage: input.coverage,
  });
  if (input.plan.state !== "ready" || !input.plan.command) {
    const result = buildVerificationCommandResult({ plan: input.plan });
    return {
      plan: input.plan,
      result,
      coverage,
      changedFiles: [],
      mutation: "not-run",
      providerCall: "not-run",
      evidence: [
        ...result.evidence,
        "verification-command-runner:runtime-dispatch:not-run",
        "verification-command-runner:mutation:not-run",
        "verification-command-runner:provider-call:not-run",
      ],
    };
  }

  const provenanceCollector = createToolRuntimeProvenanceCollector();
  const toolResult = await dispatchRuntimeTool({
    dispatcher: input.dispatcher,
    events: input.events,
    toolName: "bash",
    taskId: input.taskId,
    args: { command: input.plan.command },
    workspaceRoot: input.workspaceRoot,
    sessionId: input.sessionId,
    abortSignal: input.abortSignal,
    requireApprovalEvent: true,
    provenanceCollector,
  });
  const result = buildVerificationCommandResult({
    plan: input.plan,
    result: toolResult,
  });

  return {
    plan: input.plan,
    toolResult,
    result,
    coverage,
    changedFiles: [],
    mutation: "not-run",
    providerCall: "not-run",
    evidence: [
      ...result.evidence,
      "verification-command-runner:runtime-dispatch:existing-tool-runtime",
      "verification-command-runner:tool:bash",
      "verification-command-runner:mutation:not-run",
      "verification-command-runner:provider-call:not-run",
    ],
  };
}

function buildCommandCoverage(input: {
  readonly taskId: string;
  readonly coverage?: Omit<VerificationCommandCoverage, "taskId">;
}): VerificationCommandCoverage {
  if (input.coverage) {
    return {
      taskId: input.taskId,
      coveredFiles: [...input.coverage.coveredFiles],
      uncoveredFiles: [...input.coverage.uncoveredFiles],
      coverageStatus: input.coverage.coverageStatus,
    };
  }
  return {
    taskId: input.taskId,
    coveredFiles: [],
    uncoveredFiles: [],
    coverageStatus: "none",
  };
}
