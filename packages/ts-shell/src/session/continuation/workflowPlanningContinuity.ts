import type { ContinuityStateLike } from "../../orchestration/runtimeHandoffProjection.js";
import { deriveWorkflowTurnContinuationFacts } from "./turnFacts.js";

export interface WorkflowPlanningContinuitySignals {
  readonly hasActionResultSeed: boolean;
  readonly seedWasReadLike: boolean;
  readonly lastTaskWasReadLike: boolean;
  readonly lastTaskWasMutationLike: boolean;
  readonly seedVerificationStatus?: string;
  readonly diagnosticHasVerifySignal: boolean;
  readonly hasDiagnosticVerifyHandoffCue: boolean;
  readonly hasWeakDiagnosticHandoffCue: boolean;
  readonly diagnosticHandoffLineage?: readonly string[];
  readonly ignoredExplicitTargetLineageOrUndefined?: readonly string[];
  readonly hasPostEditReadOnlyVerifyCue: boolean;
  readonly hasSeedReadOnlyCheckCue: boolean;
  readonly verifyContinuationLineageOrUndefined?: readonly string[];
  readonly lastTaskHadVerifySignal: boolean;
}

export function deriveWorkflowPlanningContinuitySignals(input: {
  readonly continuity: ContinuityStateLike;
  readonly diagnosticHandoffEvidence?: {
    readonly command?: string;
    readonly status?: string;
  };
  readonly diagnosticHandoffProjectionLineage?: readonly string[];
  readonly hasVerifyIntent: boolean;
  readonly hasExplicitPathReference: boolean;
  readonly hasPostEditReadOnlyVerifyPrompt: boolean;
  readonly hasWeakSeedTargetCarryoverCue: boolean;
  readonly hasCorrectionCue: boolean;
  readonly hasCreateIntent: boolean;
  readonly hasExecutionIntent: boolean;
  readonly hasEditIntent: boolean;
  readonly hasEffectiveReplaceDirectiveFromPrompt: boolean;
  readonly hasFencedContent: boolean;
}): WorkflowPlanningContinuitySignals {
  const {
    hasActionResultSeed,
    seedWasReadLike,
    lastTaskWasReadLike,
    lastTaskWasMutationLike,
    seedVerificationStatus,
    diagnosticHasVerifySignal,
  } = deriveWorkflowTurnContinuationFacts({
    continuity: input.continuity,
    diagnosticHandoffEvidence: input.diagnosticHandoffEvidence,
  });

  const seedIgnoredExplicitTargetLineage =
    hasActionResultSeed && input.hasExplicitPathReference
      ? ["seedInfluence=ignored-explicit-target"]
      : undefined;
  const hasDiagnosticVerifyHandoffCue =
    Boolean(input.diagnosticHandoffEvidence?.command) &&
    input.hasVerifyIntent &&
    !input.hasExplicitPathReference;
  const hasWeakDiagnosticHandoffCue =
    Boolean(input.diagnosticHandoffEvidence) &&
    input.hasWeakSeedTargetCarryoverCue &&
    !input.hasExplicitPathReference;
  const diagnosticHandoffLineage =
    (hasWeakDiagnosticHandoffCue || hasDiagnosticVerifyHandoffCue) &&
    input.diagnosticHandoffEvidence
      ? input.diagnosticHandoffProjectionLineage
      : undefined;
  const ignoredExplicitTargetLineage = [
    ...(seedIgnoredExplicitTargetLineage ?? []),
    ...(input.diagnosticHandoffEvidence && input.hasExplicitPathReference
      ? ["diagnosticHandoff=ignored-explicit-target"]
      : []),
  ];
  const ignoredExplicitTargetLineageOrUndefined =
    ignoredExplicitTargetLineage.length > 0
      ? ignoredExplicitTargetLineage
      : undefined;
  const hasPostEditReadOnlyVerifyCue =
    input.hasPostEditReadOnlyVerifyPrompt &&
    lastTaskWasMutationLike &&
    !input.hasCorrectionCue &&
    !input.hasCreateIntent &&
    !input.hasExecutionIntent &&
    !input.hasEffectiveReplaceDirectiveFromPrompt &&
    !input.hasFencedContent;
  const hasSeedReadOnlyCheckCue =
    (input.hasPostEditReadOnlyVerifyPrompt ||
      input.hasWeakSeedTargetCarryoverCue) &&
    seedWasReadLike &&
    !input.hasEditIntent &&
    !input.hasCorrectionCue &&
    !input.hasCreateIntent &&
    !input.hasExecutionIntent &&
    !input.hasEffectiveReplaceDirectiveFromPrompt &&
    !input.hasFencedContent;
  const seedVerifySignalLineage =
    seedVerificationStatus && seedVerificationStatus !== "not-requested"
      ? ["seedInfluence=verify-signal"]
      : undefined;
  const verifyContinuationLineage = [
    ...(seedVerifySignalLineage ?? []),
    ...(diagnosticHandoffLineage ?? []),
  ];
  const verifyContinuationLineageOrUndefined =
    verifyContinuationLineage.length > 0
      ? verifyContinuationLineage
      : undefined;
  const lastTaskHadVerifySignal =
    input.continuity.lastVerificationStatus === "failed" ||
    input.continuity.lastVerificationStatus === "blocked" ||
    input.continuity.lastVerificationStatus === "skipped" ||
    Boolean(seedVerificationStatus && seedVerificationStatus !== "not-requested") ||
    diagnosticHasVerifySignal ||
    (input.continuity.unresolvedItems ?? []).some(
      (entry) =>
        entry.toLowerCase().startsWith("verify:") &&
        !entry.toLowerCase().includes("not-requested"),
    );

  return {
    hasActionResultSeed,
    seedWasReadLike,
    lastTaskWasReadLike,
    lastTaskWasMutationLike,
    seedVerificationStatus,
    diagnosticHasVerifySignal,
    hasDiagnosticVerifyHandoffCue,
    hasWeakDiagnosticHandoffCue,
    diagnosticHandoffLineage,
    ignoredExplicitTargetLineageOrUndefined,
    hasPostEditReadOnlyVerifyCue,
    hasSeedReadOnlyCheckCue,
    verifyContinuationLineageOrUndefined,
    lastTaskHadVerifySignal,
  };
}
