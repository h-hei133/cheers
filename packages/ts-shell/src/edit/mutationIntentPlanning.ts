import {
  formatEditExecutionFailure,
} from "../orchestration/doNextProjection.js";
import type { WorkflowTaskPlan } from "../orchestration/workflowTaskPlanner.js";
import { selectMutationTargetFromPrompt } from "./mutationTargetSelection.js";

export interface MutationPlanningTarget {
  readonly cleaned: string;
  readonly inWorkspace?: boolean;
}

export function selectMutationIntentTarget<
  TTarget extends MutationPlanningTarget,
>(input: {
  readonly prompt: string;
  readonly targets: readonly TTarget[];
  readonly hasWriteTaskIntent: boolean;
  readonly hasEditIntent: boolean;
}): TTarget | undefined {
  return input.hasWriteTaskIntent || input.hasEditIntent
    ? selectMutationTargetFromPrompt(input.prompt, input.targets)
    : undefined;
}

export function buildUnsupportedDiscoveryEditPlan(input: {
  readonly doNext: string;
  readonly usedRestoredState?: boolean;
}): WorkflowTaskPlan {
  return {
    taskKind: "edit-file",
    reason: "discovery edit is outside current write/edit contract",
    inspectFirst: true,
    verifyAfterEdit: false,
    blockedReason: `Discovery edit is unsupported in the current bounded edit contract. ${input.doNext}`,
    targetMissing: true,
    usedRestoredState: input.usedRestoredState,
  };
}

export function buildMissingMutationTargetPlan(input: {
  readonly hasWriteTaskIntent: boolean;
  readonly hasVerifyIntent: boolean;
  readonly verifyCommand?: string;
  readonly replaceDirective?: { readonly from: string; readonly to: string };
  readonly editDoNext: string;
  readonly usedRestoredState?: boolean;
}): WorkflowTaskPlan {
  return {
    taskKind: input.hasWriteTaskIntent ? "write-file" : "edit-file",
    reason: "write/edit intent without resolvable target",
    inspectFirst: !input.hasWriteTaskIntent,
    verifyAfterEdit: input.hasVerifyIntent,
    ...(input.verifyCommand ? { verifyCommand: input.verifyCommand } : {}),
    blockedReason: input.hasWriteTaskIntent
      ? `Target file is required for write task. ${input.editDoNext}`
      : formatEditExecutionFailure({
          failureReason: "edit-target-missing",
          explanation:
            "The edit request did not identify one unique in-workspace target file.",
          nextAction:
            "Rerun with exactly one target file path, for example: Edit src/example.ts and replace '<current text>' with '<desired text>'.",
        }),
    targetMissing: true,
    ...(input.replaceDirective
      ? {
          replaceFrom: input.replaceDirective.from,
          replaceTo: input.replaceDirective.to,
        }
      : {}),
    usedRestoredState: input.usedRestoredState,
  };
}

export function buildOutOfWorkspaceMutationTargetPlan(input: {
  readonly hasWriteTaskIntent: boolean;
  readonly hasVerifyIntent: boolean;
  readonly verifyCommand?: string;
  readonly targetPath: string;
  readonly usedRestoredState?: boolean;
}): WorkflowTaskPlan {
  return {
    taskKind: input.hasWriteTaskIntent ? "write-file" : "edit-file",
    reason: "target resolved outside workspace",
    inspectFirst: !input.hasWriteTaskIntent,
    verifyAfterEdit: input.hasVerifyIntent,
    ...(input.verifyCommand ? { verifyCommand: input.verifyCommand } : {}),
    targetPath: input.targetPath,
    blockedReason:
      "Resolved target is outside current workspace. Attach/switch project or provide an in-workspace path.",
    usedRestoredState: input.usedRestoredState,
  };
}

export function buildUnclearEditTransformPlan(input: {
  readonly targetPath: string;
  readonly usedRestoredState?: boolean;
}): WorkflowTaskPlan {
  return {
    taskKind: "edit-file",
    reason: "edit intent needs targeted context planning before mutation",
    targetPath: input.targetPath,
    inspectFirst: false,
    verifyAfterEdit: false,
    blockedReason: formatEditExecutionFailure({
      failureReason: "edit-transform-unclear",
      explanation:
        "Missing concrete edit transform. A targeted context packet is required before planning this edit.",
      nextAction:
        "Inspect suggested reads and rerun with an exact replacement or confirmed proposal.",
    }),
    targetMissing: false,
    contextPlanningRequested: true,
    contextPlanningReason: "missing-edit-context",
    usedRestoredState: input.usedRestoredState,
  };
}
