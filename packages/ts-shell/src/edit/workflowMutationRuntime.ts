import type { QueryEvent } from "../core/query/events.js";
import { buildContextGraphPlanningBundle } from "../orchestration/readInspectModule.js";
import { buildAgentPlanResult } from "../orchestration/agentPlanResult.js";
import {
  projectWorkflowRuntimeOutcome,
} from "../orchestration/resultSurfaceModule.js";
import type {
  CodingPatchRecord,
  CodingResultSummary,
} from "../orchestration/types.js";
import type { FileMutationExecutionResult } from "../orchestration/mutationExecution.js";
import type { WorkflowTaskPlan } from "../orchestration/workflowTaskPlanner.js";
import type { ToolDispatcher } from "../tools/dispatcher.js";
import { runCrossFileRepairStage } from "../repair/crossFileRepairStage.js";
import { runLowRiskRenameStage } from "./lowRiskRenameStage.js";
import {
  extractFencedContent,
  extractLowRiskRenameRefactor,
  extractReplaceDirective,
  inferAlternativeReplaceDirective,
  isSafeGeneratedAlternativeDirective,
  isSafeReboundDirective,
  resolveMutationInstruction,
} from "./mutationInstructionPlanner.js";
import { runPrimaryMutationRuntimeStage } from "./mutationRuntimeStage.js";
import { runSecondaryWriteStage } from "./secondaryWriteStage.js";

export interface WorkflowMutationRuntimeAggregate {
  readonly events: QueryEvent[];
  readonly notes: string[];
  readonly changedFiles: string[];
  readonly failedFiles: Array<{ path: string; reason: string }>;
  readonly patches: CodingPatchRecord[];
  readonly verifiedFiles: string[];
  readonly unverifiedFiles: Array<{ path: string; reason: string }>;
  readonly repairNotes: string[];
  readonly evidence: string[];
  readonly mutationResults: FileMutationExecutionResult[];
  readonly appliedContentByPath: Map<string, string>;
}

export interface WorkflowMutationRuntimeResult {
  readonly terminal?: {
    readonly events: QueryEvent[];
    readonly notes: string[];
    readonly codingResult: CodingResultSummary;
    readonly userFacingOutput: string;
  };
  readonly crossFileRemainingTargets: string[];
  readonly crossFileFailedByReason: Array<{
    path: string;
    failureCode: "read-failed" | "patch-generation-failed" | "write-failed";
    reason: string;
  }>;
  readonly crossFileSkippedFiles: Array<{ path: string; reason: string }>;
  readonly degradedCrossFileTargets: string[];
  readonly crossFileDegradationReason?: string;
}

export async function runWorkflowMutationRuntime(input: {
  readonly plan: WorkflowTaskPlan;
  readonly prompt: string;
  readonly originalContent?: string;
  readonly workspaceRoot: string;
  readonly sessionId: string;
  readonly turn: number;
  readonly dispatcher: ToolDispatcher;
  readonly aggregate: WorkflowMutationRuntimeAggregate;
  readonly abortSignal?: AbortSignal;
}): Promise<WorkflowMutationRuntimeResult | undefined> {
  if (input.plan.taskKind !== "write-file" && input.plan.taskKind !== "edit-file") {
    return undefined;
  }

  const {
    events,
    notes,
    changedFiles,
    failedFiles,
    patches,
    verifiedFiles,
    unverifiedFiles,
    repairNotes,
    evidence,
    mutationResults,
    appliedContentByPath,
  } = input.aggregate;
  const emptyCrossFile = (): WorkflowMutationRuntimeResult => ({
    crossFileRemainingTargets: [],
    crossFileFailedByReason: [],
    crossFileSkippedFiles: [],
    degradedCrossFileTargets: [],
  });

  const targetPath = input.plan.targetPath ?? "(unknown)";
  if (input.plan.taskKind === "edit-file" && input.plan.crossFileConvergedNoop) {
    const convergedMessage =
      "Cross-file continuation already converged; no remaining related files require edits.";
    notes.push("repair: cross-file continuation converged (no remaining targets)");
    evidence.push("repair-cross-file converged:no-remaining-targets");
    evidence.push("repair-processed-files:(none-added-this-turn)");
    evidence.push("repair-remaining-files:(none)");
    return {
      ...emptyCrossFile(),
      terminal: {
        events,
        notes,
        ...projectWorkflowRuntimeOutcome({
          taskKind: input.plan.taskKind,
          changedFiles,
          failedFiles,
          patches,
          verifiedFiles,
          unverifiedFiles,
          verification: {
            status: "not-requested",
            reason: "cross-file continuation converged",
            selectionScope: "none",
            selectionSource: "not-requested",
          },
          repairNotes: [convergedMessage],
          evidence,
          taskVerdict: "satisfied",
          taskReasons: ["No remaining related files required continuation edits."],
          userFacingOutput: convergedMessage,
        }),
      },
    };
  }

  const fenced = extractFencedContent(input.prompt);
  const lowRiskRenameRefactor = extractLowRiskRenameRefactor(input.prompt);
  let replaceDirective =
    input.plan.replaceFrom && input.plan.replaceTo
      ? { from: input.plan.replaceFrom, to: input.plan.replaceTo }
      : extractReplaceDirective(input.prompt);
  if (!replaceDirective && lowRiskRenameRefactor) {
    replaceDirective = {
      from: lowRiskRenameRefactor.from,
      to: lowRiskRenameRefactor.to,
    };
  }

  const explicitPromptDirective = extractReplaceDirective(input.prompt);
  const isExplicitPromptDirective = Boolean(
    explicitPromptDirective &&
      replaceDirective &&
      explicitPromptDirective.from === replaceDirective.from &&
      explicitPromptDirective.to === replaceDirective.to,
  );
  if (
    !replaceDirective &&
    input.plan.taskKind === "edit-file" &&
    input.plan.continuationRepairReplan
  ) {
    const alternativeDirective = inferAlternativeReplaceDirective({
      targetPath,
      originalContent: input.originalContent,
      failedTransforms: input.plan.failedTransforms ?? [],
      avoidPreviousDirection: input.plan.avoidPreviousDirection === true,
    });
    if (
      alternativeDirective &&
      isSafeGeneratedAlternativeDirective(alternativeDirective)
    ) {
      replaceDirective = alternativeDirective;
      notes.push("repair: continuation re-plan applied");
      const isBlockScoped =
        alternativeDirective.from.includes("\n") ||
        alternativeDirective.to.includes("\n");
      notes.push(
        isBlockScoped
          ? "repair replan: block-scoped alternative selected from current code context"
          : `repair replan: alternative transform selected ${alternativeDirective.from}=>${alternativeDirective.to}`,
      );
      evidence.push(
        `replan-transform:${targetPath}:${alternativeDirective.from}=>${alternativeDirective.to}`,
      );
      if (isBlockScoped) {
        evidence.push(`replan-context:${targetPath}:block-scoped`);
      }
    } else if (alternativeDirective) {
      notes.push("repair replan: unsafe alternative transform skipped");
      evidence.push(
        `replan-skipped:${targetPath}:unsafe-transform:${alternativeDirective.from}=>${alternativeDirective.to}`,
      );
    }
  }

  if (
    replaceDirective &&
    input.plan.taskKind === "edit-file" &&
    typeof input.originalContent === "string" &&
    !isExplicitPromptDirective &&
    !input.originalContent.includes(replaceDirective.from)
  ) {
    const hasPotentialCrossFileRepair =
      input.plan.crossFileRepair === true &&
      (input.plan.additionalTargetPaths?.length ?? 0) > 0;
    const reboundDirective = inferAlternativeReplaceDirective({
      targetPath,
      originalContent: input.originalContent,
      failedTransforms: [
        ...(input.plan.failedTransforms ?? []),
        {
          path: normalizePathLike(targetPath),
          from: replaceDirective.from,
          to: replaceDirective.to,
        },
      ],
      avoidPreviousDirection: input.plan.avoidPreviousDirection === true,
    });
    if (
      reboundDirective &&
      reboundDirective.from !== replaceDirective.from &&
      input.originalContent.includes(reboundDirective.from) &&
      isSafeReboundDirective({
        original: replaceDirective,
        rebound: reboundDirective,
      })
    ) {
      notes.push(
        `repair: reopen transform rebound from ${replaceDirective.from}=>${replaceDirective.to} to ${reboundDirective.from}=>${reboundDirective.to}`,
      );
      evidence.push(
        `rebind-transform:${targetPath}:${replaceDirective.from}=>${replaceDirective.to}->${reboundDirective.from}=>${reboundDirective.to}`,
      );
      replaceDirective = reboundDirective;
    } else if (
      input.originalContent.includes(replaceDirective.to) &&
      !hasPotentialCrossFileRepair
    ) {
      const reason =
        "Reopened target recovered, but previous transform is stale against current file content (replacement already present). Provide an explicit next transform to continue.";
      failedFiles.push({ path: targetPath, reason });
      repairNotes.push(reason);
      evidence.push(
        `rebind-blocker:${targetPath}:stale-transform-already-applied:${replaceDirective.from}=>${replaceDirective.to}`,
      );
      return {
        ...emptyCrossFile(),
        terminal: {
          events,
          notes: [...notes, `blocker: ${reason}`],
          ...projectWorkflowRuntimeOutcome({
            taskKind: input.plan.taskKind,
            changedFiles,
            failedFiles,
            patches,
            verifiedFiles,
            unverifiedFiles,
            verification: {
              status: "skipped",
              reason: "stale transform requires explicit override",
              selectionScope: "none",
              selectionSource: "not-requested",
            },
            repairNotes,
            evidence,
            taskVerdict: "insufficient-evidence",
            taskReasons: [reason],
            userFacingOutput: `Task not completed: ${reason}`,
          }),
        },
      };
    } else if (
      input.originalContent.includes(replaceDirective.to) &&
      hasPotentialCrossFileRepair
    ) {
      notes.push(
        "repair: stale primary transform detected, allowing cross-file continuation to proceed",
      );
      evidence.push(
        `rebind-primary-skip:${targetPath}:stale-transform-preserved-for-cross-file`,
      );
    }
  }

  if (replaceDirective) {
    evidence.push(
      `transform:${targetPath}:${replaceDirective.from}=>${replaceDirective.to}`,
    );
  } else if (
    input.plan.taskKind === "edit-file" &&
    input.plan.continuationRepairReplan &&
    (input.plan.failedTransforms?.length ?? 0) > 0
  ) {
    evidence.push(
      `repair-replan:blocker:${targetPath}:no-safe-alternative-transform`,
    );
    if (input.plan.avoidPreviousDirection) {
      const reason =
        "Continuation cannot safely avoid the previous failed direction with current evidence. Provide an explicit replacement transform.";
      failedFiles.push({ path: targetPath, reason });
      repairNotes.push(reason);
      return {
        ...emptyCrossFile(),
        terminal: {
          events,
          notes: [...notes, `blocker: ${reason}`],
          ...projectWorkflowRuntimeOutcome({
            taskKind: input.plan.taskKind,
            changedFiles,
            failedFiles,
            patches,
            verifiedFiles,
            unverifiedFiles,
            verification: {
              status: "skipped",
              reason: "continuation repair evidence insufficient",
              selectionScope: "none",
              selectionSource: "not-requested",
            },
            repairNotes,
            evidence,
            taskVerdict: "insufficient-evidence",
            taskReasons: [reason],
            userFacingOutput: `Task not completed: ${reason}`,
          }),
        },
      };
    }
  }

  const mutationInstruction = resolveMutationInstruction(
    input.plan,
    input.prompt,
    input.originalContent,
    fenced,
    replaceDirective,
  );
  const hasCrossFileRepairTargets =
    input.plan.taskKind === "edit-file" &&
    input.plan.crossFileRepair &&
    Boolean(replaceDirective) &&
    (input.plan.additionalTargetPaths?.length ?? 0) > 0;
  let primarySkippedForCrossFile = false;

  if (isMutationInstructionFailure(mutationInstruction)) {
    if (
      hasCrossFileRepairTargets &&
      mutationInstruction.reason.includes("Replace source text not found")
    ) {
      primarySkippedForCrossFile = true;
      notes.push(
        `repair: primary target skipped for coordinated continuation (${targetPath})`,
      );
      evidence.push(`repair-cross-file primary-skip:${targetPath}:anchor-not-found`);
    } else {
      const patchFailureCode = mutationInstruction.reason.includes(
        "patch-from-not-found",
      )
        ? "patch-from-not-found"
        : mutationInstruction.reason.includes("patch-ambiguous")
          ? "patch-ambiguous"
          : mutationInstruction.reason.includes("patch-generation-failed")
            ? "patch-generation-failed"
            : undefined;
      if (patchFailureCode) {
        patches.push({
          path: targetPath,
          operation: "replace",
          status: "failed",
          failureCode: patchFailureCode,
          reason: mutationInstruction.reason,
        });
      }
      failedFiles.push({
        path: targetPath,
        reason: mutationInstruction.reason,
      });
      repairNotes.push(mutationInstruction.reason);
      if (mutationInstruction.reason.includes("edit-transform-unclear")) {
        const planning = await buildContextGraphPlanningBundle({
          workspaceRoot: input.workspaceRoot,
          targetPath,
          workflowPlan: {
            ...input.plan,
            blockedReason: mutationInstruction.reason,
            contextPlanningRequested: true,
            contextPlanningReason: "missing-edit-context",
          },
        });
        const agentPlanResult = buildAgentPlanResult(planning.agentPlan);
        return {
          ...emptyCrossFile(),
          terminal: {
            events,
            notes: [
              ...notes,
              `blocker: ${mutationInstruction.reason}`,
              `context-packet: ${planning.packet.packetId}`,
              `context-graph: ${planning.graph.graphId}`,
              `test-impact: ${planning.testImpact.impactPlanId}`,
              planning.packet.replaySafeSummary,
              planning.graph.replaySafeSummary,
              planning.testImpact.replaySafeSummary,
              planning.agentPlan.replaySafeSummary,
            ],
            ...projectWorkflowRuntimeOutcome({
              taskKind: input.plan.taskKind,
              changedFiles,
              failedFiles,
              patches,
              verifiedFiles,
              unverifiedFiles,
              verification: {
                status: "skipped",
                reason: "mutation instruction missing",
                selectionScope: "none",
                selectionSource: "not-requested",
              },
              repairNotes,
              evidence: [
                ...evidence,
                ...planning.packetResult.evidence,
                ...planning.graphResult.evidence,
                ...agentPlanResult.evidence,
              ],
              taskVerdict: "insufficient-evidence",
              taskReasons: [
                mutationInstruction.reason,
                planning.agentPlan.doNext,
              ],
              userFacingOutput: [
                `Task not completed: ${mutationInstruction.reason}`,
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
        ...emptyCrossFile(),
        terminal: {
          events,
          notes: [...notes, `blocker: ${mutationInstruction.reason}`],
          ...projectWorkflowRuntimeOutcome({
            taskKind: input.plan.taskKind,
            changedFiles,
            failedFiles,
            patches,
            verifiedFiles,
            unverifiedFiles,
            verification: {
              status: "skipped",
              reason: "mutation instruction missing",
              selectionScope: "none",
              selectionSource: "not-requested",
            },
            repairNotes,
            evidence,
            taskVerdict: "insufficient-evidence",
            taskReasons: [mutationInstruction.reason],
            userFacingOutput: `Task not completed: ${mutationInstruction.reason}`,
          }),
        },
      };
    }
  }

  const successfulMutationInstruction = mutationInstruction as Exclude<
    typeof mutationInstruction,
    { ok: false; reason: string }
  >;

  if (!primarySkippedForCrossFile) {
    const transformKind =
      input.plan.taskKind === "write-file"
        ? "write"
        : fenced
          ? "fenced-replacement"
          : replaceDirective
            ? "replace"
            : "rewrite";
    await runPrimaryMutationRuntimeStage({
      plan: input.plan,
      targetPath,
      workspaceRoot: input.workspaceRoot,
      sessionId: input.sessionId,
      turn: input.turn,
      dispatcher: input.dispatcher,
      aggregate: {
        events,
        notes,
        changedFiles,
        failedFiles,
        patches,
        evidence,
        mutationResults,
        appliedContentByPath,
      },
      content: successfulMutationInstruction.content,
      changedLines: successfulMutationInstruction.changedLines,
      addedLines: successfulMutationInstruction.addedLines,
      removedLines: successfulMutationInstruction.removedLines,
      originalContent: input.originalContent,
      transformKind,
      ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
    });
  }

  if (!primarySkippedForCrossFile && changedFiles.includes(targetPath)) {
    if (lowRiskRenameRefactor) {
      await runLowRiskRenameStage({
        rename: lowRiskRenameRefactor,
        targetPath,
        workspaceRoot: input.workspaceRoot,
        sessionId: input.sessionId,
        turn: input.turn,
        dispatcher: input.dispatcher,
        events,
        aggregate: {
          events,
          notes,
          changedFiles,
          failedFiles,
          patches,
          evidence,
          mutationResults,
          appliedContentByPath,
        },
        ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
      });
    }

    await runSecondaryWriteStage({
      prompt: input.prompt,
      targetPath,
      workspaceRoot: input.workspaceRoot,
      sessionId: input.sessionId,
      turn: input.turn,
      dispatcher: input.dispatcher,
      events,
      aggregate: {
        events,
        notes,
        changedFiles,
        failedFiles,
        patches,
        evidence,
        mutationResults,
        appliedContentByPath,
      },
      ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
    });
  }

  if (
    input.plan.taskKind === "edit-file" &&
    input.plan.crossFileRepair &&
    replaceDirective &&
    (changedFiles.includes(targetPath) || primarySkippedForCrossFile) &&
    (input.plan.additionalTargetPaths?.length ?? 0) > 0
  ) {
    const repairStage = await runCrossFileRepairStage({
      plan: input.plan,
      prompt: input.prompt,
      targetPath,
      replaceDirective,
      workspaceRoot: input.workspaceRoot,
      sessionId: input.sessionId,
      turn: input.turn,
      dispatcher: input.dispatcher,
      aggregate: {
        events,
        notes,
        changedFiles,
        failedFiles,
        patches,
        evidence,
        mutationResults,
        appliedContentByPath,
      },
      ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
    });
    return {
      crossFileRemainingTargets: repairStage.remainingTargets,
      crossFileFailedByReason: repairStage.failedByReason,
      crossFileSkippedFiles: repairStage.skippedFiles,
      degradedCrossFileTargets: repairStage.degradedTargets,
      ...(repairStage.degradationReason
        ? { crossFileDegradationReason: repairStage.degradationReason }
        : {}),
    };
  }

  return emptyCrossFile();
}

function isMutationInstructionFailure(
  instruction: ReturnType<typeof resolveMutationInstruction>,
): instruction is { ok: false; reason: string } {
  return instruction.ok === false;
}

function normalizePathLike(value: string): string {
  return value
    .replace(/\\/g, "/")
    .replace(/^\.\/+/g, "")
    .trim();
}
