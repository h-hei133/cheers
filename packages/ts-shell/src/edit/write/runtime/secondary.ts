import type { QueryEvent } from "../../../core/query/runtime/events.js";
import { extractSecondaryFileWrites } from "../../planning/instructionPlanner.js";
import {
  appendMutationResult,
  hashMutationStageTaskId,
  type MutationRuntimeAggregate,
} from "../../runtime/mutation.js";
import { executeFileMutationBranch } from "../../../orchestration/mutationExecution.js";
import { dispatchRuntimeTool } from "../../../orchestration/toolRuntimeModule.js";
import {
  orderedMutationTargetsFromGraph,
  type WorkflowActionGraph,
} from "../../../planning/action/graph.js";
import type { ToolDispatcher } from "../../../tools/dispatch/dispatcher.js";

export async function runSecondaryWriteStage(input: {
  readonly prompt: string;
  readonly targetPath: string;
  readonly workspaceRoot: string;
  readonly sessionId: string;
  readonly turn: number;
  readonly dispatcher: ToolDispatcher;
  readonly events: QueryEvent[];
  readonly aggregate: MutationRuntimeAggregate;
  readonly actionGraph?: WorkflowActionGraph;
  readonly abortSignal?: AbortSignal;
}): Promise<void> {
  const secondaryWrites = orderSecondaryWrites(
    extractSecondaryFileWrites(
    input.prompt,
    input.targetPath,
    ),
    input.actionGraph,
  );
  if (input.actionGraph) {
    input.aggregate.evidence.push(
      `secondary-write-action-graph:${input.actionGraph.graphId}`,
    );
    for (const target of input.actionGraph.changedFileIntents) {
      input.aggregate.evidence.push(`secondary-write-intent:${target}`);
    }
    for (const reason of input.actionGraph.dependencyReasons) {
      input.aggregate.evidence.push(`secondary-write-dependency:${reason}`);
    }
  }
  for (const secondary of secondaryWrites) {
    if (
      normalizePathLike(secondary.path) === normalizePathLike(input.targetPath) ||
      input.aggregate.changedFiles.map(normalizePathLike).includes(normalizePathLike(secondary.path))
    ) {
      input.aggregate.evidence.push(`secondary-write-skipped:${secondary.path}:already-handled`);
      continue;
    }
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

function orderSecondaryWrites(
  writes: readonly { path: string; content: string }[],
  actionGraph: WorkflowActionGraph | undefined,
): readonly { path: string; content: string }[] {
  const orderedTargets = orderedMutationTargetsFromGraph(actionGraph);
  if (orderedTargets.length === 0) {
    return writes;
  }
  const orderByPath = new Map(
    orderedTargets.map((target, index) => [normalizePathLike(target), index]),
  );
  return [...writes].sort((left, right) =>
    (orderByPath.get(normalizePathLike(left.path)) ?? Number.MAX_SAFE_INTEGER) -
    (orderByPath.get(normalizePathLike(right.path)) ?? Number.MAX_SAFE_INTEGER)
  );
}

function normalizePathLike(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\/+/g, "").trim();
}
