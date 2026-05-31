import type { QueryEvent } from "../core/query/events.js";
import type { ToolDispatcher } from "../tools/dispatch/dispatcher.js";
import type {
  CodingPatchRecord,
  CodingVerificationSummary,
} from "../orchestration/types.js";
import type { WorkflowTaskPlan } from "../orchestration/workflowTaskPlanner.js";
import type { FileUnchangedAssertion } from "../orchestration/fileConstraintAssertions.js";
import { buildAgentPlanResult } from "../orchestration/agentPlanResult.js";
import { formatPatchFailureReason } from "../orchestration/patchMutationLane.js";
import {
  buildContextGraphPlanningBundle,
} from "../orchestration/readInspectModule.js";
import { projectWorkflowRuntimeOutcome } from "../orchestration/resultSurfaceModule.js";
import { dispatchRuntimeTool } from "../orchestration/toolRuntimeModule.js";
import { buildReadTaskDelivery } from "./readDeliveryProjection.js";
import { computeFragmentFingerprint } from "./readWindowContinuation.js";
import type { ContextRuntimeStageResult } from "./runtimeStageTypes.js";

export type ReadRuntimeStageOutcome =
  | {
      readonly kind: "terminal";
      readonly result: ContextRuntimeStageResult;
    }
  | {
      readonly kind: "continue";
      readonly originalContent: string;
      readonly protectedSnapshots: ReadonlyMap<string, string>;
    };

export async function runReadRuntimeStage(input: {
  readonly plan: WorkflowTaskPlan;
  readonly prompt: string;
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
  readonly unchangedAssertions: readonly FileUnchangedAssertion[];
  readonly sessionId: string;
  readonly turn: number;
  readonly workspaceRoot: string;
  readonly abortSignal?: AbortSignal;
}): Promise<ReadRuntimeStageOutcome | undefined> {
  if (
    !input.plan.inspectFirst ||
    !input.plan.targetPath ||
    (input.plan.taskKind !== "edit-file" && input.plan.taskKind !== "read-file")
  ) {
    return undefined;
  }

  const readStep = await dispatchRuntimeTool({
    dispatcher: input.dispatcher,
    events: input.events,
    toolName: "read",
    taskId: `task_${input.sessionId}_${input.turn}_read`,
    args: { path: input.plan.targetPath },
    workspaceRoot: input.workspaceRoot,
    sessionId: input.sessionId,
    abortSignal: input.abortSignal,
    requireApprovalEvent: false,
  });
  if (!readStep.success) {
    return {
      kind: "terminal",
      result: projectReadFailure(input, readStep.error ?? "read failed"),
    };
  }

  const originalContent = readStep.output ?? "";
  input.notes.push(`tool: read file ${input.plan.targetPath}`);
  input.evidence.push(`inspect: read ${input.plan.targetPath}`);

  const protectedSnapshots = new Map<string, string>();
  if (
    input.plan.taskKind === "edit-file" &&
    input.unchangedAssertions.length > 0
  ) {
    for (const assertion of input.unchangedAssertions) {
      const readProtected = await dispatchRuntimeTool({
        dispatcher: input.dispatcher,
        events: input.events,
        toolName: "read",
        taskId: `task_${input.sessionId}_${input.turn}_protected_read_${hashStableId(assertion.path)}`,
        args: { path: assertion.path },
        workspaceRoot: input.workspaceRoot,
        sessionId: input.sessionId,
        abortSignal: input.abortSignal,
        requireApprovalEvent: false,
      });
      if (readProtected.success) {
        protectedSnapshots.set(assertion.path, readProtected.output ?? "");
        input.notes.push(`protected snapshot captured: ${assertion.path}`);
        input.evidence.push(`verify-unchanged-snapshot:${assertion.path}`);
      } else {
        input.notes.push(
          `protected snapshot unavailable: ${assertion.path} (${readProtected.error ?? "read failed"})`,
        );
      }
    }
  }

  if (input.plan.taskKind !== "read-file") {
    return {
      kind: "continue",
      originalContent,
      protectedSnapshots,
    };
  }

  const readDelivery = buildReadTaskDelivery({
    prompt: input.prompt,
    targetPath: input.plan.targetPath,
    content: originalContent,
    preferredMode: input.plan.groundedDeliverableMode,
    requestedLines: input.plan.readLineCount,
    lineOffset: input.plan.readLineOffset,
    readFragmentLineIndexes: input.plan.readFragmentLineIndexes,
    readFragmentRanges: input.plan.readFragmentRanges,
    readFragmentSourceWindowStart: input.plan.readFragmentSourceWindowStart,
    readFragmentSourceWindowEnd: input.plan.readFragmentSourceWindowEnd,
    readFragmentFingerprint: input.plan.readFragmentFingerprint,
    readFilter: input.plan.readFilter,
    repairInstruction: input.plan.repairInstruction,
  });
  if (input.plan.contextPlanningRequested) {
    const planning = await buildContextGraphPlanningBundle({
      workspaceRoot: input.workspaceRoot,
      targetPath: input.plan.targetPath,
      workflowPlan: input.plan,
    });
    const agentPlanResult = buildAgentPlanResult(planning.agentPlan);
    const planningReady = planning.agentPlan.executionReadiness === "ready";
    const planningReason = planningReady
      ? "Agent plan is ready for the existing read/context route."
      : planning.agentPlan.doNext;
    return {
      kind: "terminal",
      result: {
        events: input.events,
        notes: [
          ...input.notes,
          `context-packet: ${planning.packet.packetId}`,
          `context-graph: ${planning.graph.graphId}`,
          `test-impact: ${planning.testImpact.impactPlanId}`,
          planning.packet.replaySafeSummary,
          planning.graph.replaySafeSummary,
          planning.testImpact.replaySafeSummary,
          planning.agentPlan.replaySafeSummary,
        ],
        ...projectWorkflowRuntimeOutcome({
          taskKind: "read-file",
          changedFiles: input.changedFiles,
          failedFiles: planningReady
            ? []
            : [{ path: input.plan.targetPath, reason: planningReason }],
          patches: input.patches,
          verifiedFiles: input.verifiedFiles,
          unverifiedFiles: input.unverifiedFiles,
          verification: notRequested("read-only context packet"),
          repairNotes: input.repairNotes,
          evidence: [
            ...input.evidence,
            ...readDelivery.evidenceMarkers,
            ...planning.packetResult.evidence,
            ...planning.graphResult.evidence,
            ...agentPlanResult.evidence,
          ],
          taskVerdict:
            readDelivery.completed && planningReady
              ? "satisfied"
              : "insufficient-evidence",
          taskReasons: [
            readDelivery.completed
              ? "Read/summarize task delivered requested content."
              : "Read step succeeded but no user-facing delivery could be produced.",
            planningReason,
          ],
          userFacingOutput: [
            readDelivery.output,
            "",
            planning.packetResult.output,
            "",
            planning.graphResult.output,
            "",
            agentPlanResult.output,
          ].join("\n"),
        }),
      },
    };
  }

  return {
    kind: "terminal",
    result: {
      events: input.events,
      notes: input.notes,
      ...projectWorkflowRuntimeOutcome({
        taskKind: "read-file",
        changedFiles: input.changedFiles,
        failedFiles: input.failedFiles,
        patches: input.patches,
        verifiedFiles: input.verifiedFiles,
        unverifiedFiles: input.unverifiedFiles,
        verification: notRequested("read-only task"),
        repairNotes: input.repairNotes,
        evidence: [...input.evidence, ...readDelivery.evidenceMarkers],
        taskVerdict: readDelivery.completed
          ? "satisfied"
          : "insufficient-evidence",
        taskReasons: [
          readDelivery.completed
            ? "Read/summarize task delivered requested content."
            : readDelivery.output.length > 0
              ? readDelivery.output
              : "Read step succeeded but no user-facing delivery could be produced.",
        ],
        userFacingOutput: readDelivery.output,
      }),
    },
  };
}

function projectReadFailure(
  input: Parameters<typeof runReadRuntimeStage>[0],
  rawReason: string,
): ContextRuntimeStageResult {
  const reason =
    input.plan.replaceFrom && input.plan.replaceTo
      ? formatPatchFailureReason({
          ok: false,
          failureCode: "patch-target-missing",
          failureReason: "patch-target-missing",
          explanation: "Patch target could not be read before applying replace.",
          reason: "Patch target could not be read before applying replace.",
          matchedCount: 0,
          nextAction:
            "Check that the target file exists and rerun with an explicit in-workspace path.",
        })
      : rawReason;
  input.notes.push(`inspect failed: ${reason}`);
  if (input.plan.replaceFrom && input.plan.replaceTo) {
    input.patches.push({
      path: input.plan.targetPath!,
      operation: "replace",
      status: "failed",
      failureCode: "patch-target-missing",
      reason,
    });
  }
  input.failedFiles.push({ path: input.plan.targetPath!, reason });
  const inspectFailureTaskReason =
    input.plan.taskKind === "read-file"
      ? "Read/inspect step failed; no files changed."
      : "Inspect step failed; mutation skipped.";
  const inspectFailureRepairNotes =
    input.plan.replaceFrom && input.plan.replaceTo
      ? [reason]
      : ["inspect step failed before edit"];
  return {
    events: input.events,
    notes: input.notes,
    ...projectWorkflowRuntimeOutcome({
      taskKind: input.plan.taskKind,
      changedFiles: input.changedFiles,
      failedFiles: input.failedFiles,
      patches: input.patches,
      verifiedFiles: input.verifiedFiles,
      unverifiedFiles: input.unverifiedFiles,
      verification: {
        status: "skipped",
        reason: "inspect failed before edit",
        selectionScope: "none",
        selectionSource: "not-requested",
      },
      repairNotes: inspectFailureRepairNotes,
      evidence: [`read failed: ${reason}`],
      taskVerdict: "insufficient-evidence",
      taskReasons: [inspectFailureTaskReason],
      userFacingOutput: `Task not completed: failed to read ${input.plan.targetPath}. Reason: ${reason}`,
    }),
  };
}

function notRequested(reason: string): CodingVerificationSummary {
  return {
    status: "not-requested",
    reason,
    selectionScope: "none",
    selectionSource: "not-requested",
  };
}

function hashStableId(value: string): string {
  return computeFragmentFingerprint(value).slice(0, 12);
}
