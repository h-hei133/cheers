import type { QueryEvent } from "../core/query/events.js";
import { extractSecondaryFileWrites } from "./planning/instructionPlanner.js";
import {
  appendMutationResult,
  hashMutationStageTaskId,
  type MutationRuntimeAggregate,
} from "./mutationRuntimeStage.js";
import { executeFileMutationBranch } from "../orchestration/mutationExecution.js";
import { dispatchRuntimeTool } from "../orchestration/toolRuntimeModule.js";
import type { ToolDispatcher } from "../tools/dispatch/dispatcher.js";

export async function runSecondaryWriteStage(input: {
  readonly prompt: string;
  readonly targetPath: string;
  readonly workspaceRoot: string;
  readonly sessionId: string;
  readonly turn: number;
  readonly dispatcher: ToolDispatcher;
  readonly events: QueryEvent[];
  readonly aggregate: MutationRuntimeAggregate;
  readonly abortSignal?: AbortSignal;
}): Promise<void> {
  const secondaryWrites = extractSecondaryFileWrites(
    input.prompt,
    input.targetPath,
  );
  for (const secondary of secondaryWrites) {
    const lineCount = secondary.content.split("\n").length;
    const secondaryMutation = await executeFileMutationBranch({
      path: secondary.path,
      content: secondary.content,
      operation: "append",
      changedLines: lineCount,
      addedLines: lineCount,
      removedLines: 0,
      failureReason: "secondary write failed",
      appliedNote: `secondary write applied: ${secondary.path}`,
      appliedEvidence: `secondary write applied on ${secondary.path}`,
      dispatch: () =>
        dispatchRuntimeTool({
          dispatcher: input.dispatcher,
          events: input.events,
          toolName: "write",
          taskId: `task_${input.sessionId}_${input.turn}_write_${hashMutationStageTaskId(secondary.path)}`,
          args: { path: secondary.path, content: secondary.content },
          workspaceRoot: input.workspaceRoot,
          sessionId: input.sessionId,
          abortSignal: input.abortSignal,
          requireApprovalEvent: true,
        }),
    });
    appendMutationResult(input.aggregate, secondaryMutation);
  }
}
