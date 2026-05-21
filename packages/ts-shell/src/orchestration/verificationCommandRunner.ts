import type { QueryEvent } from "../core/query/events.js";
import type { ToolDispatcher } from "../tools/dispatcher.js";
import {
  createToolRuntimeProvenanceCollector,
  dispatchRuntimeTool,
  type ToolLifecycleResult,
} from "./toolRuntimeModule.js";
import {
  buildVerificationCommandResult,
  type VerificationCommandResult,
} from "./verificationCommandResult.js";
import type { VerificationCommandPlan } from "./verificationCommandPlan.js";

export interface VerificationCommandRun {
  readonly plan: VerificationCommandPlan;
  readonly toolResult?: ToolLifecycleResult;
  readonly result: VerificationCommandResult;
  readonly changedFiles: readonly [];
  readonly mutation: "not-run";
  readonly providerCall: "not-run";
  readonly evidence: readonly string[];
}

export async function runVerificationCommand(input: {
  readonly plan: VerificationCommandPlan;
  readonly dispatcher: ToolDispatcher;
  readonly events: QueryEvent[];
  readonly taskId: string;
  readonly workspaceRoot: string;
  readonly sessionId: string;
  readonly abortSignal?: AbortSignal;
}): Promise<VerificationCommandRun> {
  if (input.plan.state !== "ready" || !input.plan.command) {
    const result = buildVerificationCommandResult({ plan: input.plan });
    return {
      plan: input.plan,
      result,
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
