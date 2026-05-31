import type { QueryEvent } from "../../core/query/runtime/events.js";
import type { RuntimeExecutionReceiptProjection } from "../../runtime/execution/receipt.js";
import type { ToolDispatcher } from "../../tools/dispatch/dispatcher.js";
import {
  appendCurrentRequestScopeEvidence,
  deriveCurrentPermissionRequestFromToolInput,
} from "../../orchestration/approvalAuthorityProjection.js";
import { classifyVerificationFailure } from "../../orchestration/toolExecutionOutcomeProjection.js";
import {
  dispatchRuntimeTool,
  projectRuntimeReceiptEvidence,
  type CodingResultProvenanceCollector,
} from "../../orchestration/toolRuntimeModule.js";
import {
  projectWorkflowVerificationEvidence,
} from "../../orchestration/verificationModule.js";
import type { CodingVerificationSummary } from "../../orchestration/types.js";
import type { WorkflowTaskPlan } from "../../orchestration/workflowTaskPlanner.js";
import { isVerifyLikeCommand } from "../../policy/commandIntentPolicy.js";
import { truncateText } from "../../result/projection/runtime.js";

export async function runDirectCommandStage(input: {
  readonly plan: WorkflowTaskPlan;
  readonly dispatcher: ToolDispatcher;
  readonly events: QueryEvent[];
  readonly sessionId: string;
  readonly turn: number;
  readonly workspaceRoot: string;
  readonly abortSignal?: AbortSignal;
  readonly provenanceCollector: CodingResultProvenanceCollector;
  readonly notes: string[];
  readonly evidence: string[];
  readonly failedFiles: Array<{ path: string; reason: string }>;
}): Promise<{
  readonly verification: CodingVerificationSummary;
  readonly dispatchedRunCommand: string;
  readonly executionReceipts: readonly RuntimeExecutionReceiptProjection[];
}> {
  const command = input.plan.directCommand ?? "node --version";
  const currentRequestScope = deriveCurrentPermissionRequestFromToolInput({
    toolName: "bash",
    operation: "spawn",
    target: command,
    workspaceRoot: input.workspaceRoot,
    source: "verification-command",
    lineageHint: "run-command",
  });
  appendCurrentRequestScopeEvidence(input.evidence, currentRequestScope);
  if (input.plan.blockedReason) {
    input.failedFiles.push({ path: "(command)", reason: input.plan.blockedReason });
    return {
      dispatchedRunCommand: command,
      executionReceipts: [],
      verification: {
        status: "skipped",
        reason: input.plan.blockedReason,
        command,
        selectionScope: "none",
        selectionSource: "not-requested",
      },
    };
  }

  const commandResult = await dispatchRuntimeTool({
    dispatcher: input.dispatcher,
    events: input.events,
    toolName: "bash",
    taskId: `task_${input.sessionId}_${input.turn}_bash`,
    args: { command },
    workspaceRoot: input.workspaceRoot,
    sessionId: input.sessionId,
    abortSignal: input.abortSignal,
    requireApprovalEvent: true,
    provenanceCollector: input.provenanceCollector,
  });
  const commandFailure = commandResult.success
    ? undefined
    : classifyVerificationFailure(commandResult);
  input.notes.push(
    commandResult.success
      ? `tool: approved bash(${command})`
      : `tool: blocked bash(${command})`,
  );
  const verification: CodingVerificationSummary = {
    status: commandResult.success
      ? "passed"
      : (commandFailure?.status ?? "failed"),
    command,
    reason: commandResult.success
      ? "run-command executed"
      : (commandFailure?.reason ??
        truncateText(commandResult.error ?? commandResult.output ?? "command failed")),
    selectionScope: "explicit",
    selectionSource: "explicit-user",
    ...(commandFailure?.blockerKind
      ? { blockerKind: commandFailure.blockerKind }
      : {}),
    ...(commandFailure?.nextAction
      ? { nextAction: commandFailure.nextAction }
      : {}),
  };
  input.evidence.push(
    ...projectWorkflowVerificationEvidence({
      verification,
      targetPath: input.plan.targetPath,
      workspaceRoot: input.workspaceRoot,
      verifyLikeCommand: Boolean(
        verification.command && isVerifyLikeCommand(verification.command),
      ),
    }),
    ...projectRuntimeReceiptEvidence(commandResult),
  );
  if (!commandResult.success) {
    input.failedFiles.push({
      path: "(command)",
      reason: verification.reason ?? "command failed",
    });
  }
  return {
    verification,
    dispatchedRunCommand: command,
    executionReceipts: readExecutionReceiptProjection(commandResult.metadata?.executionReceipt),
  };
}

function readExecutionReceiptProjection(
  value: unknown,
): readonly RuntimeExecutionReceiptProjection[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }
  const candidate = value as Partial<RuntimeExecutionReceiptProjection>;
  if (
    typeof candidate.receiptId === "string" &&
    typeof candidate.executionStatus === "string" &&
    typeof candidate.errorClass === "string" &&
    typeof candidate.evidenceCorrelationId === "string" &&
    candidate.redaction &&
    typeof candidate.redaction === "object"
  ) {
    return [candidate as RuntimeExecutionReceiptProjection];
  }
  return [];
}
