import {
  buildRepairContinuationObject,
  buildVerifyContinuationObject,
  deriveContinuationTargetPath,
  hasLocalExplainEvidenceInContinuity,
  hasReadFragmentEvidenceInContinuity,
  inferVerifyCommandFromContinuity,
  isVerifyResumeEligibleFromContinuity,
  type RepairContinuationObject,
  type VerifyContinuationObject,
} from "./continuationPlanning.js";
import { classifyContinuationIntent } from "./continuationIntent.js";
import {
  buildReplaySafeContinuationLineage,
  decideLineageActivation,
  type LineageActivationDecision,
  type ReplaySafeContinuationLineage,
} from "./continuationLineage.js";
import {
  projectLineageActivation,
  type ContinuationProjection,
} from "./continuationProjection.js";
import type { ContinuityStateLike } from "./runtimeHandoffProjection.js";

export type {
  LineageActivationDecision,
  ContinuationProjection,
  RepairContinuationObject,
  ReplaySafeContinuationLineage,
  VerifyContinuationObject,
};

export function classifyWorkflowContinuationIntent(input: {
  readonly prompt: string;
  readonly continuity: ContinuityStateLike;
}): ReturnType<typeof classifyContinuationIntent> {
  return classifyContinuationIntent(input);
}

export function buildWorkflowContinuationLineage(input: {
  readonly continuity: ContinuityStateLike;
}): ReplaySafeContinuationLineage {
  return buildReplaySafeContinuationLineage(input);
}

export function deriveWorkflowContinuationTarget(input: {
  readonly continuity: ContinuityStateLike;
  readonly workspaceRoot: string;
}): string | undefined {
  return deriveContinuationTargetPath(input.continuity, input.workspaceRoot);
}

export function projectWorkflowLineageActivation(input: {
  readonly continuity: ContinuityStateLike;
  readonly weakOrTemporalCue: boolean;
  readonly selectedReopenTarget?: string;
  readonly reopenCandidates?: readonly string[];
  readonly crossFileSignal?: boolean;
}): {
  readonly decision: LineageActivationDecision;
  readonly projection: ContinuationProjection;
} {
  const decision = decideLineageActivation(input);
  return {
    decision,
    projection: projectLineageActivation(decision),
  };
}

export function buildWorkflowRepairContinuation(input: {
  readonly continuity: ContinuityStateLike;
  readonly targetPath?: string;
  readonly replaceDirective?: { readonly from: string; readonly to: string };
}): RepairContinuationObject {
  return buildRepairContinuationObject(input);
}

export function buildWorkflowVerifyContinuation(input: {
  readonly continuity: ContinuityStateLike;
  readonly targetPath?: string;
  readonly command?: string;
}): VerifyContinuationObject {
  return buildVerifyContinuationObject(input);
}

export function hasWorkflowLocalExplainEvidence(
  continuity: ContinuityStateLike,
): boolean {
  return hasLocalExplainEvidenceInContinuity(continuity);
}

export function hasWorkflowReadFragmentEvidence(
  continuity: ContinuityStateLike,
): boolean {
  return hasReadFragmentEvidenceInContinuity(continuity);
}

export function inferWorkflowVerifyCommand(
  continuity: ContinuityStateLike,
): string | undefined {
  return inferVerifyCommandFromContinuity(continuity);
}

export function isWorkflowVerifyResumeEligible(
  continuity: ContinuityStateLike,
): boolean {
  return isVerifyResumeEligibleFromContinuity(continuity);
}
