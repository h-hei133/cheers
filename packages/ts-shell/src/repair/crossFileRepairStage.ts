import path from "node:path";
import {
  appendCurrentRequestScopeEvidence,
  deriveCurrentPermissionRequestFromToolInput,
} from "../orchestration/approvalAuthorityProjection.js";
import { executeFileMutationBranch } from "../orchestration/mutationExecution.js";
import { dispatchRuntimeTool } from "../orchestration/toolRuntimeModule.js";
import type { WorkflowTaskPlan } from "../orchestration/workflowTaskPlanner.js";
import {
  resolveMutationInstruction,
} from "../edit/planning/instructionPlanner.js";
import {
  appendMutationResult,
  type MutationRuntimeAggregate,
} from "../edit/mutationRuntimeStage.js";
import type { ToolDispatcher } from "../tools/dispatch/dispatcher.js";
import {
  shouldDegradeCrossFileRemaining,
  shouldRetainCrossFileFailureInRemaining,
} from "./flow/crossFilePlanning.js";

export interface CrossFileRepairStageResult {
  readonly remainingTargets: string[];
  readonly failedByReason: Array<{
    path: string;
    failureCode: "read-failed" | "patch-generation-failed" | "write-failed";
    reason: string;
  }>;
  readonly skippedFiles: Array<{ path: string; reason: string }>;
  readonly degradedTargets: string[];
  readonly degradationReason?: string;
}

export async function runCrossFileRepairStage(input: {
  readonly plan: WorkflowTaskPlan;
  readonly prompt: string;
  readonly targetPath: string;
  readonly replaceDirective: { readonly from: string; readonly to: string };
  readonly workspaceRoot: string;
  readonly sessionId: string;
  readonly turn: number;
  readonly dispatcher: ToolDispatcher;
  readonly aggregate: MutationRuntimeAggregate;
  readonly abortSignal?: AbortSignal;
}): Promise<CrossFileRepairStageResult> {
  const coordinatedTargets = input.plan.additionalTargetPaths ?? [];
  input.aggregate.notes.push(
    `repair: cross-file coordinated repair candidates=${coordinatedTargets.join(", ")}`,
  );
  input.aggregate.evidence.push(
    `repair-candidate-files:${coordinatedTargets.join(",")}`,
  );
  const processedCrossFilePaths = new Set<string>();
  const remainingCrossFilePaths = new Set<string>();
  const failedEntries: CrossFileRepairStageResult["failedByReason"] = [];
  const skippedEntries: CrossFileRepairStageResult["skippedFiles"] = [];

  for (const linkedPath of coordinatedTargets) {
    const linkedRead = await dispatchRuntimeTool({
      dispatcher: input.dispatcher,
      events: input.aggregate.events,
      toolName: "read",
      taskId: `task_${input.sessionId}_${input.turn}_cross_read_${repairTaskId(linkedPath)}`,
      args: { path: linkedPath },
      workspaceRoot: input.workspaceRoot,
      sessionId: input.sessionId,
      abortSignal: input.abortSignal,
      requireApprovalEvent: false,
    });
    if (!linkedRead.success) {
      const reason = linkedRead.error ?? "cross-file read failed";
      input.aggregate.failedFiles.push({ path: linkedPath, reason });
      failedEntries.push({
        path: linkedPath,
        failureCode: "read-failed",
        reason,
      });
      if (shouldRetainCrossFileFailureInRemaining("read-failed", reason)) {
        remainingCrossFilePaths.add(linkedPath);
      } else {
        processedCrossFilePaths.add(linkedPath);
      }
      input.aggregate.patches.push({
        path: linkedPath,
        operation: "replace",
        status: "failed",
        failureCode: "read-failed",
        reason,
      });
      continue;
    }
    const linkedContent = linkedRead.output ?? "";
    if (!linkedContent.includes(input.replaceDirective.from)) {
      const reason = "Replace source text not found in target file.";
      input.aggregate.notes.push(
        `repair: cross-file patch generation failed for ${linkedPath} (${reason})`,
      );
      input.aggregate.failedFiles.push({ path: linkedPath, reason });
      failedEntries.push({
        path: linkedPath,
        failureCode: "patch-generation-failed",
        reason,
      });
      if (
        shouldRetainCrossFileFailureInRemaining(
          "patch-generation-failed",
          reason,
        )
      ) {
        remainingCrossFilePaths.add(linkedPath);
      } else {
        processedCrossFilePaths.add(linkedPath);
      }
      input.aggregate.patches.push({
        path: linkedPath,
        operation: "replace",
        status: "failed",
        failureCode: "patch-generation-failed",
        reason,
      });
      continue;
    }
    const linkedInstruction = resolveMutationInstruction(
      {
        ...input.plan,
        taskKind: "edit-file",
        targetPath: linkedPath,
      },
      input.prompt,
      linkedContent,
      undefined,
      input.replaceDirective,
    );
    if (linkedInstruction.ok === false) {
      input.aggregate.failedFiles.push({
        path: linkedPath,
        reason: linkedInstruction.reason,
      });
      failedEntries.push({
        path: linkedPath,
        failureCode: "patch-generation-failed",
        reason: linkedInstruction.reason,
      });
      if (
        shouldRetainCrossFileFailureInRemaining(
          "patch-generation-failed",
          linkedInstruction.reason,
        )
      ) {
        remainingCrossFilePaths.add(linkedPath);
      } else {
        processedCrossFilePaths.add(linkedPath);
      }
      input.aggregate.patches.push({
        path: linkedPath,
        operation: "replace",
        status: "failed",
        failureCode: "patch-generation-failed",
        reason: linkedInstruction.reason,
      });
      continue;
    }
    const linkedMutationTarget = path.isAbsolute(linkedPath)
      ? linkedPath
      : path.join(input.workspaceRoot, linkedPath);
    const currentLinkedMutationScope = deriveCurrentPermissionRequestFromToolInput({
      toolName: "edit",
      operation: "write",
      target: linkedMutationTarget,
      workspaceRoot: input.workspaceRoot,
      source: "approval-request",
      lineageHint: "edit-file-cross",
    });
    appendCurrentRequestScopeEvidence(
      input.aggregate.evidence,
      currentLinkedMutationScope,
    );
    const linkedMutation = await executeFileMutationBranch({
      path: linkedPath,
      content: linkedInstruction.content,
      operation: "replace",
      changedLines: linkedInstruction.changedLines,
      addedLines: linkedInstruction.addedLines,
      removedLines: linkedInstruction.removedLines,
      failureReason: "cross-file mutation failed",
      appliedNote: `repair: cross-file coordinated mutation applied on ${linkedPath}`,
      appliedEvidence: `repair-cross-file applied on ${linkedPath}`,
      recordAppliedContent: false,
      dispatch: () =>
        dispatchRuntimeTool({
          dispatcher: input.dispatcher,
          events: input.aggregate.events,
          toolName: "edit",
          taskId: `task_${input.sessionId}_${input.turn}_cross_edit_${repairTaskId(linkedPath)}`,
          args: { path: linkedPath, content: linkedInstruction.content },
          workspaceRoot: input.workspaceRoot,
          sessionId: input.sessionId,
          abortSignal: input.abortSignal,
          requireApprovalEvent: true,
        }),
    });
    appendMutationResult(input.aggregate, linkedMutation);
    if (linkedMutation.failedFile) {
      failedEntries.push({
        path: linkedPath,
        failureCode: "write-failed",
        reason: linkedMutation.failedFile.reason,
      });
      if (
        shouldRetainCrossFileFailureInRemaining(
          "write-failed",
          linkedMutation.failedFile.reason,
        )
      ) {
        remainingCrossFilePaths.add(linkedPath);
      } else {
        processedCrossFilePaths.add(linkedPath);
      }
      continue;
    }
    processedCrossFilePaths.add(linkedPath);
  }

  const remainingCrossFileTargets = coordinatedTargets.filter((candidate) =>
    remainingCrossFilePaths.has(candidate),
  );
  const degradationDecision = shouldDegradeCrossFileRemaining({
    previousRemainingTargets: input.plan.previousRemainingTargets ?? [],
    previousFailedEntries: input.plan.previousFailedEntries ?? [],
    currentRemainingTargets: remainingCrossFileTargets,
    currentFailedEntries: failedEntries,
  });
  let degradedTargets: string[] = [];
  let degradationReason: string | undefined;
  if (degradationDecision.shouldDegrade) {
    degradedTargets = degradationDecision.degradedTargets;
    degradationReason = degradationDecision.reason;
    for (const degradedPath of degradationDecision.degradedTargets) {
      input.aggregate.failedFiles.push({
        path: degradedPath,
        reason: `continuation-degraded: ${degradationDecision.reason}`,
      });
    }
    input.aggregate.notes.push(`repair degradation: ${degradationDecision.reason}`);
    input.aggregate.evidence.push(
      `repair-degradation:triggered:${degradationDecision.degradedTargets.join(",")}`,
    );
    input.aggregate.evidence.push("repair-degradation-no-progress:true");
    input.aggregate.evidence.push(
      `repair-degradation-reason:${degradationDecision.reason}`,
    );
  }

  input.aggregate.evidence.push(
    `repair-processed-files:${
      processedCrossFilePaths.size > 0
        ? Array.from(processedCrossFilePaths).join(",")
        : "(none)"
    }`,
  );
  input.aggregate.evidence.push(
    `repair-remaining-files:${
      degradationDecision.shouldDegrade
        ? "(none)"
        : remainingCrossFileTargets.length > 0
          ? remainingCrossFileTargets.join(",")
          : "(none)"
    }`,
  );
  input.aggregate.evidence.push(
    `repair-failed-files:${
      failedEntries.length > 0
        ? failedEntries
            .map(
              (entry) =>
                `${entry.path}::${entry.failureCode}::${truncateText(entry.reason, 80)}`,
            )
            .join("|")
        : "(none)"
    }`,
  );
  input.aggregate.evidence.push(
    `repair-skipped-files:${
      skippedEntries.length > 0
        ? skippedEntries
            .map((entry) => `${entry.path}::${entry.reason}`)
            .join("|")
        : "(none)"
    }`,
  );
  input.aggregate.evidence.push(
    `repair-outcome:${
      degradationDecision.shouldDegrade
        ? "degraded-terminal"
        : remainingCrossFileTargets.length > 0
          ? "partial-complete-with-remaining"
          : failedEntries.length > 0
            ? "partial-complete-with-failures"
            : "completed"
    }`,
  );

  return {
    remainingTargets: remainingCrossFileTargets,
    failedByReason: failedEntries,
    skippedFiles: skippedEntries,
    degradedTargets,
    ...(degradationReason ? { degradationReason } : {}),
  };
}

function repairTaskId(value: string): string {
  return value.replace(/[^\w.-]+/g, "_");
}

function truncateText(value: string, maxLength: number): string {
  const normalized = value.trim();
  return normalized.length <= maxLength
    ? normalized
    : `${normalized.slice(0, maxLength)}...`;
}
