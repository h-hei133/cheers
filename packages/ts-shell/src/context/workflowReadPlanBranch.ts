import type {
  GroundedRepairInstruction,
  ReflectiveStateQueryKind,
  WorkflowTaskPlan,
} from "../orchestration/workflowTaskPlanner.js";
import type { GroundedDeliverableMode } from "../orchestration/runtimeHandoffProjection.js";
import {
  buildGroundedReadMissingTargetPlan,
  buildGroundedReadOutOfWorkspacePlan,
} from "./readTargetPlanning.js";
import { buildReadOnlyPlan } from "./readIntentPlanning.js";
import type {
  ReadFragmentPlanInput,
  ReadWindowPlanInput,
} from "./readIntentPlanning.js";

export interface WorkflowReadPlanTarget {
  readonly cleaned: string;
  readonly inWorkspace: boolean;
}

export function buildWorkflowReadPlanBranch(input: {
  readonly prompt: string;
  readonly primaryTarget?: WorkflowReadPlanTarget | null;
  readonly continuityLastGroundedDeliverableMode?: GroundedDeliverableMode;
  readonly hasContinuationCue: boolean;
  readonly hasFileReadIntent: boolean;
  readonly hasExplicitPathReference: boolean;
  readonly hasGroundedReadLikeIntent: boolean;
  readonly hasDiagnosisIntent: boolean;
  readonly hasExecutionIntent: boolean;
  readonly hasEditIntent: boolean;
  readonly hasCreateIntent: boolean;
  readonly hasExecutionCorrectionCue: boolean;
  readonly hasExplainIntent: boolean;
  readonly hasSummarizeIntent: boolean;
  readonly groundedIntentPrompt: string;
  readonly isAmbiguousRepairFollowUp: boolean;
  readonly hasCrossFileUltraWeakFollowUp: boolean;
  readonly lastTaskWasReadLike: boolean;
  readonly hasVerifyIntent: boolean;
  readonly hasPostEditReadOnlyVerifyCue: boolean;
  readonly hasSeedReadOnlyCheckCue: boolean;
  readonly hasWeakDiagnosticHandoffCue: boolean;
  readonly hasCorrectionCue: boolean;
  readonly hasEffectiveReplaceDirectiveFromPrompt: boolean;
  readonly hasFencedContent: boolean;
  readonly reflectiveStateQueryKind?: ReflectiveStateQueryKind;
  readonly hasReflectiveActionCue: boolean;
  readonly hasRepairContinuationCue: boolean;
  readonly hasEffectiveReplaceDirective: boolean;
  readonly effectiveGroundedDeliverableMode?: GroundedDeliverableMode;
  readonly readWindowDirective: ReadWindowPlanInput;
  readonly readFragmentDirective?: ReadFragmentPlanInput;
  readonly normalizedRepairInstruction: GroundedRepairInstruction;
  readonly readContinuationLineage?: readonly string[];
  readonly ignoredExplicitTargetLineage?: readonly string[];
  readonly mutationVerificationLineage?: readonly string[];
  readonly diagnosticHandoffLineage?: readonly string[];
  readonly usedRestoredState: boolean;
}): WorkflowTaskPlan | undefined {
  const target = input.primaryTarget;

  if (input.hasContinuationCue && input.hasFileReadIntent && target?.inWorkspace) {
    return buildReadOnlyPlan({
      reason: input.usedRestoredState
        ? "pathless read follow-up resolved from restored session state"
        : "read follow-up resolved from explicit target",
      targetPath: target.cleaned,
      groundedDeliverableMode: input.effectiveGroundedDeliverableMode ?? "read",
      readWindow: input.readWindowDirective,
      usedRestoredState: input.usedRestoredState,
      repairInstruction: input.normalizedRepairInstruction,
      continuationLineage: input.readContinuationLineage,
    });
  }

  if (
    input.isAmbiguousRepairFollowUp &&
    !input.hasCrossFileUltraWeakFollowUp &&
    input.lastTaskWasReadLike &&
    target?.inWorkspace &&
    !input.hasEditIntent &&
    !input.hasCreateIntent &&
    !input.hasVerifyIntent &&
    !input.hasDiagnosisIntent
  ) {
    return buildReadOnlyPlan({
      reason:
        "ambiguous short follow-up resolved to active read-like continuation target",
      targetPath: target.cleaned,
      groundedDeliverableMode:
        input.effectiveGroundedDeliverableMode ??
        input.continuityLastGroundedDeliverableMode ??
        "read",
      readWindow: input.readWindowDirective,
      readFragment: input.readFragmentDirective,
      includeReadFragment: true,
      usedRestoredState: input.usedRestoredState,
      repairInstruction: input.normalizedRepairInstruction,
    });
  }

  if (
    input.hasGroundedReadLikeIntent &&
    input.hasExplicitPathReference &&
    !target
  ) {
    return buildGroundedReadMissingTargetPlan({
      reason:
        "grounded read/summarize/explain requires a resolvable target path",
      stopReason:
        "Grounded read/summarize/explain request included a path reference, but no resolvable target was found. Provide a valid in-workspace file path.",
      doNext: "Provide a valid in-workspace file path.",
      usedRestoredState: input.usedRestoredState,
    });
  }

  if (input.hasGroundedReadLikeIntent && target && !target.inWorkspace) {
    return buildGroundedReadOutOfWorkspacePlan({
      targetPath: target.cleaned,
      usedRestoredState: input.usedRestoredState,
    });
  }

  if (
    input.hasDiagnosisIntent &&
    !input.hasExecutionIntent &&
    !input.hasEditIntent &&
    !input.hasCreateIntent &&
    (input.hasExplainIntent ||
      /\b(?:repository|repo|runtime|session|implementation|implemented)\b/i.test(
        input.groundedIntentPrompt,
      ) ||
      /\b(?:fail|fails|failing|error|errors|exception|boom|intermittently)\b/i.test(
        input.groundedIntentPrompt,
      ))
  ) {
    return {
      taskKind: "repo-explain",
      reason: "repo diagnosis intent",
      targetPath: target?.inWorkspace ? target.cleaned : undefined,
      inspectFirst: true,
      verifyAfterEdit: false,
      usedRestoredState: input.usedRestoredState,
    };
  }

  if ((input.hasSummarizeIntent || input.hasExplainIntent) && !target?.inWorkspace) {
    return {
      taskKind: "read-file",
      reason: "grounded summarize/explain requires explicit readable target",
      inspectFirst: true,
      verifyAfterEdit: false,
      blockedReason:
        "Summarize/explain requests require an explicit readable target file. Provide the file path in this workspace.",
      targetMissing: true,
      usedRestoredState: input.usedRestoredState,
    };
  }

  if (
    input.hasFileReadIntent &&
    target?.inWorkspace &&
    !input.hasEditIntent &&
    !input.hasCreateIntent &&
    !input.hasExecutionCorrectionCue
  ) {
    return buildReadOnlyPlan({
      reason:
        "explicit read intent takes precedence over inherited mutation context",
      targetPath: target.cleaned,
      groundedDeliverableMode: input.effectiveGroundedDeliverableMode ?? "read",
      readWindow: input.readWindowDirective,
      contextPrompt: input.prompt,
      usedRestoredState: input.usedRestoredState,
      repairInstruction: input.normalizedRepairInstruction,
      continuationLineage: input.ignoredExplicitTargetLineage,
    });
  }

  if (input.hasPostEditReadOnlyVerifyCue && target?.inWorkspace) {
    return buildReadOnlyPlan({
      reason:
        "post-edit verify/check follow-up resolved as read-only continuation",
      targetPath: target.cleaned,
      groundedDeliverableMode: input.effectiveGroundedDeliverableMode ?? "read",
      usedRestoredState: input.usedRestoredState,
      repairInstruction: input.normalizedRepairInstruction,
      continuationLineage: input.mutationVerificationLineage,
    });
  }

  if (input.hasSeedReadOnlyCheckCue && target?.inWorkspace) {
    return buildReadOnlyPlan({
      reason:
        "seed-driven read-only check follow-up reused action result target",
      targetPath: target.cleaned,
      groundedDeliverableMode: input.effectiveGroundedDeliverableMode ?? "read",
      usedRestoredState: input.usedRestoredState,
      repairInstruction: input.normalizedRepairInstruction,
      continuationLineage: ["seedInfluence=target-carryover"],
    });
  }

  if (
    input.hasWeakDiagnosticHandoffCue &&
    target?.inWorkspace &&
    !input.hasEditIntent &&
    !input.hasCorrectionCue &&
    !input.hasCreateIntent &&
    !input.hasExecutionIntent &&
    !input.hasVerifyIntent &&
    !input.hasEffectiveReplaceDirectiveFromPrompt &&
    !input.hasFencedContent
  ) {
    return buildReadOnlyPlan({
      reason: "diagnostic-driven weak follow-up reused handoff target",
      targetPath: target.cleaned,
      groundedDeliverableMode: input.effectiveGroundedDeliverableMode ?? "read",
      usedRestoredState: input.usedRestoredState,
      repairInstruction: input.normalizedRepairInstruction,
      continuationLineage: input.diagnosticHandoffLineage,
    });
  }

  if (
    input.reflectiveStateQueryKind === "next-step" &&
    input.hasReflectiveActionCue &&
    input.lastTaskWasReadLike &&
    target?.inWorkspace &&
    !input.hasEditIntent &&
    !input.hasCreateIntent &&
    !input.hasRepairContinuationCue &&
    !input.hasVerifyIntent &&
    !input.hasEffectiveReplaceDirective
  ) {
    return buildReadOnlyPlan({
      reason: "reflective next-step handoff reused read continuity target",
      targetPath: target.cleaned,
      groundedDeliverableMode: input.effectiveGroundedDeliverableMode ?? "read",
      readWindow: input.readWindowDirective,
      usedRestoredState: input.usedRestoredState,
      repairInstruction: input.normalizedRepairInstruction,
      continuationLineage: input.ignoredExplicitTargetLineage,
    });
  }

  return undefined;
}
