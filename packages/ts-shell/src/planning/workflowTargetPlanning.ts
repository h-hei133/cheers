import { stripVerificationTailForTarget } from "../orchestration/verificationModule.js";
import {
  resolveTaskTargets,
  type TargetResolutionBlocker,
} from "../orchestration/targetResolution.js";
import {
  derivePromptPathTarget,
  hasPathLikeReference,
} from "./promptTargetProjection.js";

type TargetResolution = ReturnType<typeof resolveTaskTargets>;
type PromptPathTarget = NonNullable<ReturnType<typeof derivePromptPathTarget>>;

export interface WorkflowTargetPlanningFacts {
  readonly targetResolution: TargetResolution;
  readonly promptPathTarget: PromptPathTarget | null;
  readonly explicitPrimaryTarget: TargetResolution["primaryTarget"];
  readonly hasExplicitPathReference: boolean;
}

export function resolveWorkflowTargetPlanning(input: {
  readonly prompt: string;
  readonly workspaceRoot: string;
  readonly hasVerifyIntent: boolean;
}): WorkflowTargetPlanningFacts {
  let targetResolution = resolveTaskTargets(input.prompt, input.workspaceRoot);
  if (targetResolution.blocker && input.hasVerifyIntent) {
    const mutationTargetPrompt = stripVerificationTailForTarget(input.prompt);
    if (
      mutationTargetPrompt &&
      mutationTargetPrompt !== input.prompt.trim()
    ) {
      const mutationTargetResolution = resolveTaskTargets(
        mutationTargetPrompt,
        input.workspaceRoot,
      );
      if (
        !mutationTargetResolution.blocker &&
        mutationTargetResolution.primaryTarget
      ) {
        targetResolution = mutationTargetResolution;
      }
    }
  }

  const promptPathTarget = derivePromptPathTarget(
    input.prompt,
    input.workspaceRoot,
  );
  const explicitPrimaryTarget = targetResolution.primaryTarget;
  const hasExplicitPathReference =
    Boolean(promptPathTarget || explicitPrimaryTarget) ||
    targetResolution.targets.length > 0 ||
    hasPathLikeReference(input.prompt);

  return {
    targetResolution,
    promptPathTarget,
    explicitPrimaryTarget,
    hasExplicitPathReference,
  };
}

export function shouldBlockMutationForTargetResolution(input: {
  readonly blocker: TargetResolutionBlocker;
  readonly hasCorrectionCue: boolean;
  readonly hasCreateIntent: boolean;
  readonly hasEditIntent: boolean;
  readonly hasExecutionCorrectionCue: boolean;
  readonly hasFencedContent: boolean;
  readonly hasReplaceDirective: boolean;
}): boolean {
  return (
    input.blocker.code === "ambiguous-target" &&
    (input.hasCorrectionCue ||
      input.hasCreateIntent ||
      input.hasEditIntent ||
      input.hasExecutionCorrectionCue ||
      input.hasFencedContent ||
      input.hasReplaceDirective)
  );
}
