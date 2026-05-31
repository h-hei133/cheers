import type { ContinuityStateLike } from "../orchestration/runtimeHandoffProjection.js";
import type { ContinuationTransform } from "../orchestration/workflowTaskPlanner.js";
import {
  collectContinuationTransformsFromEvidence,
  inferReplaceDirectiveFromContinuationEvidence,
} from "../evidence/projection/continuation.js";
import { rebindContinuationTargetToWorkspace } from "../session/continuation/target.js";

export function isRepairContinuationFollowUpPrompt(prompt: string): boolean {
  return /(?:\bcontinue fixing(?:\s+that)?\b|\bthen continue(?:\s+fixing)?\b|\bwhy did it stop[^\n]*continue\b|\bwhat should we do next[^\n]*continue fixing\b|刚才为什么停了.*继续修|那继续修|继续修这个|就按刚才那个继续修|按这个继续修|那就按这个继续修)/i.test(
    prompt,
  );
}

export function inferReplaceDirectiveFromContinuity(input: {
  readonly continuity: ContinuityStateLike;
  readonly preferredTarget?: string;
  readonly workspaceRoot: string;
}): { from: string; to: string } | undefined {
  return inferReplaceDirectiveFromContinuationEvidence({
    evidence: input.continuity.lastContinuationEvidence ?? [],
    preferredTarget: input.preferredTarget,
    workspaceRoot: input.workspaceRoot,
    rebindTarget: rebindContinuationTargetToWorkspace,
  });
}

export function collectContinuationTransforms(input: {
  readonly continuity: ContinuityStateLike;
  readonly preferredTarget?: string;
  readonly workspaceRoot: string;
}): ContinuationTransform[] {
  return collectContinuationTransformsFromEvidence({
    evidence: input.continuity.lastContinuationEvidence ?? [],
    preferredTarget: input.preferredTarget,
    workspaceRoot: input.workspaceRoot,
    rebindTarget: rebindContinuationTargetToWorkspace,
  });
}
