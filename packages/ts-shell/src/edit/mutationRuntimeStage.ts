import fs from "node:fs";
import path from "node:path";
import type { QueryEvent } from "../core/query/events.js";
import { computeFragmentFingerprint } from "../context/readWindowContinuation.js";
import {
  appendCurrentRequestScopeEvidence,
  deriveCurrentPermissionRequestFromToolInput,
} from "../orchestration/approvalAuthorityProjection.js";
import {
  executeFileMutationBranch,
  type FileMutationExecutionResult,
} from "../orchestration/mutationExecution.js";
import type {
  CodingPatchRecord,
} from "../orchestration/types.js";
import { dispatchRuntimeTool } from "../orchestration/toolRuntimeModule.js";
import type { WorkflowTaskPlan } from "../orchestration/workflowTaskPlanner.js";
import type { ToolDispatcher } from "../tools/dispatch/dispatcher.js";

export interface MutationRuntimeAggregate {
  readonly events: QueryEvent[];
  readonly notes: string[];
  readonly changedFiles: string[];
  readonly failedFiles: Array<{ path: string; reason: string }>;
  readonly patches: CodingPatchRecord[];
  readonly evidence: string[];
  readonly mutationResults: FileMutationExecutionResult[];
  readonly appliedContentByPath: Map<string, string>;
}

export async function runPrimaryMutationRuntimeStage(input: {
  readonly plan: WorkflowTaskPlan;
  readonly targetPath: string;
  readonly workspaceRoot: string;
  readonly sessionId: string;
  readonly turn: number;
  readonly dispatcher: ToolDispatcher;
  readonly aggregate: MutationRuntimeAggregate;
  readonly content: string;
  readonly changedLines: number;
  readonly addedLines: number;
  readonly removedLines: number;
  readonly originalContent?: string;
  readonly transformKind: string;
  readonly abortSignal?: AbortSignal;
}): Promise<void> {
  input.aggregate.notes.push(`mutation transform: ${input.transformKind}`);
  input.aggregate.evidence.push(
    `edit-transform-kind:${input.targetPath}:${input.transformKind}`,
  );
  const primaryMutationToolName =
    input.plan.taskKind === "write-file" ? "write" : "edit";
  const primaryMutationTarget = path.isAbsolute(input.targetPath)
    ? input.targetPath
    : path.join(input.workspaceRoot, input.targetPath);
  const currentMutationScope = deriveCurrentPermissionRequestFromToolInput({
    toolName: primaryMutationToolName,
    operation: "write",
    target: primaryMutationTarget,
    workspaceRoot: input.workspaceRoot,
    source: "approval-request",
    lineageHint:
      input.plan.taskKind === "write-file"
        ? "write-file-primary"
        : "edit-file-primary",
  });
  appendCurrentRequestScopeEvidence(
    input.aggregate.evidence,
    currentMutationScope,
  );
  const mutation = await executeFileMutationBranch({
    path: input.targetPath,
    content: input.content,
    operation: input.plan.taskKind === "write-file" ? "append" : "replace",
    changedLines: input.changedLines,
    addedLines: input.addedLines,
    removedLines: input.removedLines,
    failureReason: "mutation failed",
    appliedNote: `mutation applied: ${input.targetPath}`,
    appliedEvidence: `edit/write applied on ${input.targetPath}`,
    expectedContentBeforeWrite:
      input.plan.taskKind === "edit-file" &&
      typeof input.originalContent === "string"
        ? input.originalContent
        : undefined,
    readContentBeforeWrite:
      input.plan.taskKind === "edit-file" &&
      typeof input.originalContent === "string"
        ? async () => {
            try {
              const absoluteTargetPath = path.isAbsolute(input.targetPath)
                ? input.targetPath
                : path.join(input.workspaceRoot, input.targetPath);
              return {
                success: true,
                content: fs.readFileSync(absoluteTargetPath, "utf8"),
              };
            } catch (error) {
              return {
                success: false,
                error:
                  error instanceof Error
                    ? `stale-read: ${error.message}`
                    : "stale-read: Could not verify the current file content before writing.",
              };
            }
          }
        : undefined,
    dispatch: () =>
      dispatchRuntimeTool({
        dispatcher: input.dispatcher,
        events: input.aggregate.events,
        toolName: primaryMutationToolName,
        taskId: `task_${input.sessionId}_${input.turn}_${primaryMutationToolName}`,
        args: {
          path: input.targetPath,
          content: input.content,
        },
        workspaceRoot: input.workspaceRoot,
        sessionId: input.sessionId,
        abortSignal: input.abortSignal,
        requireApprovalEvent: true,
      }),
  });
  appendMutationResult(input.aggregate, mutation);
}

export function appendMutationResult(
  aggregate: MutationRuntimeAggregate,
  mutation: FileMutationExecutionResult,
): void {
  aggregate.mutationResults.push(mutation);
  if (mutation.failedFile) {
    aggregate.failedFiles.push(mutation.failedFile);
  }
  if (mutation.changedFile) {
    aggregate.changedFiles.push(mutation.changedFile);
  }
  aggregate.patches.push(mutation.patch);
  if (mutation.note) {
    aggregate.notes.push(mutation.note);
  }
  if (mutation.evidence) {
    aggregate.evidence.push(mutation.evidence);
  }
  if (mutation.appliedContent) {
    aggregate.appliedContentByPath.set(
      mutation.appliedContent.normalizedPath,
      mutation.appliedContent.content,
    );
  }
}

export function hashMutationStageTaskId(value: string): string {
  return computeFragmentFingerprint(value).slice(0, 12);
}
