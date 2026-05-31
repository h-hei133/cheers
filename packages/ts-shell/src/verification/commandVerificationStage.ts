import type { QueryEvent } from "../core/query/events.js";
import {
  appendCurrentRequestScopeEvidence,
  deriveCurrentPermissionRequestFromToolInput,
} from "../orchestration/approvalAuthorityProjection.js";
import { classifyVerificationFailure } from "../orchestration/toolExecutionOutcomeProjection.js";
import {
  dispatchRuntimeTool,
  type CodingResultProvenanceCollector,
} from "../orchestration/toolRuntimeModule.js";
import type { CodingVerificationSummary } from "../orchestration/types.js";
import type { VerificationPlan } from "../orchestration/verificationModule.js";
import {
  planWorkflowVerificationRetry,
  projectWorkflowCommandVerification,
} from "../orchestration/verificationModule.js";
import { isVerifyLikeCommand } from "../policy/commandIntentPolicy.js";
import type { ToolDispatcher } from "../tools/dispatch/dispatcher.js";

export interface CommandVerificationStageResult {
  readonly verification: CodingVerificationSummary;
  readonly verifiedFiles: readonly string[];
  readonly unverifiedFiles: ReadonlyArray<{ path: string; reason: string }>;
  readonly notes: readonly string[];
  readonly repairNotes: readonly string[];
  readonly evidence: readonly string[];
}

export async function runCommandVerificationStage(input: {
  readonly plan: VerificationPlan & { readonly mode: "command"; readonly command: string };
  readonly changedFiles: readonly string[];
  readonly targetPath?: string;
  readonly dispatcher: ToolDispatcher;
  readonly events: QueryEvent[];
  readonly sessionId: string;
  readonly turn: number;
  readonly workspaceRoot: string;
  readonly abortSignal?: AbortSignal;
  readonly provenanceCollector: CodingResultProvenanceCollector;
}): Promise<CommandVerificationStageResult> {
  const verifyCommand = input.plan.command;
  const evidence: string[] = [];
  const notes: string[] = [];
  const currentVerifyScope = deriveCurrentPermissionRequestFromToolInput({
    toolName: "bash",
    operation: "spawn",
    target: verifyCommand,
    workspaceRoot: input.workspaceRoot,
    source: "verification-command",
    lineageHint: "verify-after-edit",
  });
  appendCurrentRequestScopeEvidence(evidence, currentVerifyScope);

  for (let attempt = 1; attempt <= input.plan.maxAttempts; attempt += 1) {
    const verifyResult = await dispatchRuntimeTool({
      dispatcher: input.dispatcher,
      events: input.events,
      toolName: "bash",
      taskId:
        attempt === 1
          ? `task_${input.sessionId}_${input.turn}_verify`
          : `task_${input.sessionId}_${input.turn}_verify_retry_${attempt}`,
      args: { command: verifyCommand },
      workspaceRoot: input.workspaceRoot,
      sessionId: input.sessionId,
      abortSignal: input.abortSignal,
      requireApprovalEvent: true,
      provenanceCollector: input.provenanceCollector,
    });
    const failure = verifyResult.success
      ? undefined
      : classifyVerificationFailure(verifyResult);
    const retry = planWorkflowVerificationRetry({
      plan: input.plan,
      attempt,
      outcome: verifyResult.success
        ? "passed"
        : failure?.status === "blocked"
          ? "blocked"
          : "failed",
    });
    const projected = projectWorkflowCommandVerification({
      plan: input.plan,
      result: verifyResult,
      attempt,
      retry,
      targetPath: input.targetPath,
      workspaceRoot: input.workspaceRoot,
      verifyLikeCommand: isVerifyLikeCommand(verifyCommand),
    });

    if (retry.status === "retry-planned") {
      notes.push(
        `verify retry planned: ${verifyCommand} (${attempt}/${input.plan.maxAttempts})`,
      );
      evidence.push(`verify-retry:${retry.status}:${retry.reasonCode}`);
      continue;
    }

    notes.push(projected.note);
    evidence.push(...projected.evidence);
    if (verifyResult.success) {
      return {
        verification: projected.verification,
        verifiedFiles: input.changedFiles,
        unverifiedFiles: [],
        repairNotes: [],
        notes,
        evidence,
      };
    }

    return {
      verification: projected.verification,
      verifiedFiles: [],
      unverifiedFiles: input.changedFiles.map((path) => ({
        path,
        reason:
          projected.verification.reason ??
          "verify failed; inspect output and repair before next edit",
      })),
      repairNotes: [
        projected.verification.status === "blocked"
          ? `verify blocked after edit; ${projected.verification.nextAction}`
          : "verify failed after edit; inspect failing command output before continuing edits",
      ],
      notes,
      evidence,
    };
  }

  return {
    verification: {
      status: "blocked",
      command: verifyCommand,
      reason: "Verification command was selected but no attempt was run.",
      selectionScope: input.plan.selectionScope,
      selectionSource: input.plan.selectionSource,
      blockerKind: "unknown",
      nextAction: "Rerun verification with an executable command.",
    },
    verifiedFiles: [],
    unverifiedFiles: input.changedFiles.map((path) => ({
      path,
      reason: "Verification command was selected but no attempt was run.",
    })),
    repairNotes: ["verify blocked after edit; Rerun verification with an executable command."],
    notes,
    evidence,
  };
}
