import type { QueryEvent } from "../core/query/runtime/events.js";
import {
  applyWholeWordRename,
  computeLineDelta,
} from "./planning/instructionPlanner.js";
import {
  appendMutationResult,
  hashMutationStageTaskId,
  type MutationRuntimeAggregate,
} from "./mutationRuntimeStage.js";
import { dispatchRuntimeTool } from "../orchestration/toolRuntimeModule.js";
import { executeFileMutationBranch } from "../orchestration/mutationExecution.js";
import type { ToolDispatcher } from "../tools/dispatch/dispatcher.js";

export async function runLowRiskRenameStage(input: {
  readonly rename: {
    readonly from: string;
    readonly to: string;
    readonly paths: readonly string[];
  };
  readonly targetPath: string;
  readonly workspaceRoot: string;
  readonly sessionId: string;
  readonly turn: number;
  readonly dispatcher: ToolDispatcher;
  readonly events: QueryEvent[];
  readonly aggregate: MutationRuntimeAggregate;
  readonly abortSignal?: AbortSignal;
}): Promise<void> {
  const processedRenamePaths = new Set([normalizePathLike(input.targetPath)]);
  for (const renamePath of input.rename.paths) {
    if (processedRenamePaths.has(normalizePathLike(renamePath))) {
      continue;
    }
    processedRenamePaths.add(normalizePathLike(renamePath));
    const renameRead = await dispatchRuntimeTool({
      dispatcher: input.dispatcher,
      events: input.events,
      toolName: "read",
      taskId: `task_${input.sessionId}_${input.turn}_rename_read_${hashMutationStageTaskId(renamePath)}`,
      args: { path: renamePath },
      workspaceRoot: input.workspaceRoot,
      sessionId: input.sessionId,
      abortSignal: input.abortSignal,
      requireApprovalEvent: false,
    });
    if (!renameRead.success) {
      const reason = renameRead.error ?? "rename target read failed";
      input.aggregate.failedFiles.push({ path: renamePath, reason });
      input.aggregate.patches.push({
        path: renamePath,
        operation: "replace",
        status: "failed",
        failureCode: "read-failed",
        reason,
      });
      continue;
    }
    const renameContent = applyWholeWordRename(
      renameRead.output ?? "",
      input.rename.from,
      input.rename.to,
    );
    if (renameContent === (renameRead.output ?? "")) {
      continue;
    }
    const lineDelta = computeLineDelta(renameRead.output ?? "", renameContent);
    const renameMutation = await executeFileMutationBranch({
      path: renamePath,
      content: renameContent,
      operation: "replace",
      changedLines: lineDelta.changedLines,
      addedLines: lineDelta.addedLines,
      removedLines: lineDelta.removedLines,
      failureReason: "rename target edit failed",
      appliedNote: `low-risk rename applied: ${renamePath}`,
      appliedEvidence: `rename-refactor:${renamePath}:${input.rename.from}->${input.rename.to}`,
      dispatch: () =>
        dispatchRuntimeTool({
          dispatcher: input.dispatcher,
          events: input.events,
          toolName: "edit",
          taskId: `task_${input.sessionId}_${input.turn}_rename_edit_${hashMutationStageTaskId(renamePath)}`,
          args: { path: renamePath, content: renameContent },
          workspaceRoot: input.workspaceRoot,
          sessionId: input.sessionId,
          abortSignal: input.abortSignal,
          requireApprovalEvent: true,
        }),
    });
    appendMutationResult(input.aggregate, renameMutation);
  }
}

function normalizePathLike(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\/+/g, "").trim();
}
