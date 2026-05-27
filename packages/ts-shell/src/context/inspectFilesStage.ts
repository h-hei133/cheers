import type { QueryEvent } from "../core/query/events.js";
import type { ToolDispatcher } from "../tools/dispatcher.js";
import type { CodingPatchRecord } from "../orchestration/types.js";
import type { WorkflowTaskPlan } from "../orchestration/workflowTaskPlanner.js";
import { projectWorkflowRuntimeOutcome } from "../orchestration/resultSurfaceModule.js";
import { dispatchRuntimeTool } from "../orchestration/toolRuntimeModule.js";
import { buildInspectFilesDelivery } from "./repoExplainStage.js";
import type { ContextRuntimeStageResult } from "./runtimeStageTypes.js";

export async function runInspectFilesStage(input: {
  readonly plan: WorkflowTaskPlan;
  readonly dispatcher: ToolDispatcher;
  readonly events: QueryEvent[];
  readonly notes: string[];
  readonly changedFiles: string[];
  readonly failedFiles: Array<{ path: string; reason: string }>;
  readonly patches: CodingPatchRecord[];
  readonly verifiedFiles: string[];
  readonly unverifiedFiles: Array<{ path: string; reason: string }>;
  readonly repairNotes: string[];
  readonly evidence: string[];
  readonly sessionId: string;
  readonly turn: number;
  readonly workspaceRoot: string;
  readonly abortSignal?: AbortSignal;
}): Promise<ContextRuntimeStageResult | undefined> {
  if (input.plan.taskKind !== "inspect-files") {
    return undefined;
  }
  const globStep = await dispatchRuntimeTool({
    dispatcher: input.dispatcher,
    events: input.events,
    toolName: "glob",
    taskId: `task_${input.sessionId}_${input.turn}_glob`,
    args: { pattern: ".ts" },
    workspaceRoot: input.workspaceRoot,
    sessionId: input.sessionId,
    abortSignal: input.abortSignal,
    requireApprovalEvent: false,
  });
  if (globStep.success) {
    const delivery = buildInspectFilesDelivery(globStep.output ?? "");
    const inspectCompleted = !delivery.startsWith("Task not completed:");
    input.notes.push("inspect candidates collected via glob(.ts)");
    input.evidence.push("inspect: glob(.ts) executed");
    return {
      events: input.events,
      notes: input.notes,
      ...projectWorkflowRuntimeOutcome({
        taskKind: "inspect-files",
        changedFiles: input.changedFiles,
        failedFiles: input.failedFiles,
        patches: input.patches,
        verifiedFiles: input.verifiedFiles,
        unverifiedFiles: input.unverifiedFiles,
        verification: {
          status: "not-requested",
          reason: "inspect-only task",
          selectionScope: "none",
          selectionSource: "not-requested",
        },
        repairNotes: input.repairNotes,
        evidence: input.evidence,
        taskVerdict: inspectCompleted ? "satisfied" : "insufficient-evidence",
        taskReasons: [
          inspectCompleted
            ? "Repository inspection executed."
            : "Repository inspection produced no candidate files for requested scope.",
        ],
        userFacingOutput: delivery,
      }),
    };
  }
  const reason = globStep.error ?? "glob failed";
  input.notes.push(`inspect failed: ${reason}`);
  input.failedFiles.push({ path: "(workspace)", reason });
  return {
    events: input.events,
    notes: input.notes,
    ...projectWorkflowRuntimeOutcome({
      taskKind: "inspect-files",
      changedFiles: input.changedFiles,
      failedFiles: input.failedFiles,
      patches: input.patches,
      verifiedFiles: input.verifiedFiles,
      unverifiedFiles: input.unverifiedFiles,
      verification: {
        status: "skipped",
        reason: "inspect failed",
        selectionScope: "none",
        selectionSource: "not-requested",
      },
      repairNotes: ["inspect stage failed"],
      evidence: [`glob failed: ${reason}`],
      taskVerdict: "insufficient-evidence",
      taskReasons: ["Could not inspect repository files."],
      userFacingOutput: `Task not completed: repository inspection failed. Reason: ${reason}`,
    }),
  };
}
