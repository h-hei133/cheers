import { hasLocalSliceExplainCue } from "../../context/readWindowContinuation.js";
import type { WorkflowTaskPlan } from "../../orchestration/workflowTaskPlanner.js";
import type { ReadFragmentPlanInput } from "../../context/readIntentPlanning.js";

export interface MutationScopePlanningInput {
  readonly prompt: string;
  readonly readFragment: ReadFragmentPlanInput;
  readonly hasEditIntent: boolean;
  readonly hasExecutionCorrectionCue: boolean;
  readonly hasContinuationCue: boolean;
  readonly hasGroundedReadLikeIntent: boolean;
  readonly hasVerifyIntent: boolean;
  readonly hasDiagnosisIntent: boolean;
  readonly hasCreateIntent: boolean;
}

export interface MutationScopePlanning {
  readonly hasLocalMutationCue: boolean;
  readonly hasMutationScopeEvidence: boolean;
  readonly fields: Pick<
    WorkflowTaskPlan,
    | "mutationScopeLineIndexes"
    | "mutationScopeRanges"
    | "mutationScopeSourceWindowStart"
    | "mutationScopeSourceWindowEnd"
    | "mutationScopeFingerprint"
  >;
  readonly requiredFields: Pick<WorkflowTaskPlan, "mutationScopeRequired">;
}

export function resolveMutationScopePlanning(
  input: MutationScopePlanningInput,
): MutationScopePlanning {
  const hasLocalMutationCue =
    hasLocalSliceExplainCue(input.prompt) &&
    (input.hasEditIntent ||
      input.hasExecutionCorrectionCue ||
      (input.hasContinuationCue &&
        !input.hasGroundedReadLikeIntent &&
        !input.hasVerifyIntent &&
        !input.hasDiagnosisIntent));
  const hasMutationScopeEvidence =
    (input.readFragment.lineIndexes?.length ?? 0) > 0 ||
    (input.readFragment.ranges?.length ?? 0) > 0 ||
    (input.readFragment.sourceWindowStart !== undefined &&
      input.readFragment.sourceWindowEnd !== undefined);
  return {
    hasLocalMutationCue,
    hasMutationScopeEvidence,
    fields:
      hasLocalMutationCue && hasMutationScopeEvidence
        ? {
            ...(input.readFragment.lineIndexes?.length
              ? { mutationScopeLineIndexes: input.readFragment.lineIndexes }
              : {}),
            ...(input.readFragment.ranges?.length
              ? { mutationScopeRanges: input.readFragment.ranges }
              : {}),
            ...(input.readFragment.sourceWindowStart !== undefined
              ? {
                  mutationScopeSourceWindowStart:
                    input.readFragment.sourceWindowStart,
                }
              : {}),
            ...(input.readFragment.sourceWindowEnd !== undefined
              ? {
                  mutationScopeSourceWindowEnd:
                    input.readFragment.sourceWindowEnd,
                }
              : {}),
            ...(input.readFragment.fingerprint
              ? { mutationScopeFingerprint: input.readFragment.fingerprint }
              : {}),
          }
        : {},
    requiredFields:
      hasLocalMutationCue && !input.hasCreateIntent
        ? { mutationScopeRequired: true }
        : {},
  };
}

export function buildLocalMutationScopeBlockedPlan(input: {
  readonly usedRestoredState?: boolean;
}): WorkflowTaskPlan {
  return {
    taskKind: "edit-file",
    reason: "local mutation follow-up lacks explain fragment scope evidence",
    inspectFirst: true,
    verifyAfterEdit: false,
    blockedReason:
      "This follow-up refers to the previously explained part, but no reliable local fragment is available to mutate. Re-read/re-explain the target slice or provide an explicit file path and transform.",
    targetMissing: false,
    usedRestoredState: input.usedRestoredState,
  };
}
