import {
  computeFragmentFingerprintFromIndexes,
  extractLastReadDeliveredFragmentFromContinuity,
  extractLastReadWindowFromContinuity,
  resolveReadWindowDirectiveForWorkflow,
  type ReadWindowDirective,
} from "../context/readWindowContinuation.js";
import {
  buildInspectFilesPlan,
  buildReadOnlyPlan,
} from "../context/readIntentPlanning.js";
import { buildPathlessReadContinuationBlockedPlan } from "../context/readContinuationPlanning.js";
import {
  buildGroundedReadMissingTargetPlan,
  buildGroundedReadOutOfWorkspacePlan,
} from "../context/readTargetPlanning.js";
import { hasPathLikeReference } from "./promptTargetProjection.js";
import {
  extractFencedContent,
  extractInlineWriteContent,
  extractLowRiskRenameRefactor,
} from "../edit/mutationInstructionPlanner.js";
import {
  buildLocalMutationScopeBlockedPlan,
  resolveMutationScopePlanning,
} from "../edit/mutationScopePlanning.js";
import {
  buildMissingMutationTargetPlan,
  buildOutOfWorkspaceMutationTargetPlan,
  buildUnclearEditTransformPlan,
  buildUnsupportedDiscoveryEditPlan,
  selectMutationIntentTarget,
} from "../edit/mutationIntentPlanning.js";
import {
  resolveSingleFileEditFailureRepairContext,
  resolveSingleFileEditFailureRepairContextAbandonment,
  resolveSingleFileEditRepairPayloadKind,
} from "../repair/singleFileRepairPlanning.js";
import {
  deriveCrossFileRepairCandidates,
  extractCrossFileFailureEntriesFromContinuity,
  extractCrossFileStateListFromContinuityEvidence,
  hasCrossFileContinuationContextInContinuity,
  hasCrossFileEvidenceSignalInContinuity,
} from "../repair/crossFileRepairPlanning.js";
import {
  hasDegradedContinuationEvidenceInState,
  isAtypicalReopenFollowUpPrompt,
  isDegradedReopenFollowUpPrompt,
  resolveContinuationReopenTarget,
} from "../repair/degradedReopenPlanning.js";
import {
  collectContinuationTransforms,
  inferReplaceDirectiveFromContinuity,
  isRepairContinuationFollowUpPrompt,
} from "../repair/repairContinuationPlanning.js";
import {
  detectGroundedDeliverableMode,
  inferGroundedDeliverableModeFromContinuity,
  normalizeGroundedRepairInstruction,
} from "../repair/groundedAnswerRepair.js";
import { buildBrowserIntentPlan } from "../browser/browserIntentPlanning.js";
import {
  buildWorkflowContinuationLineage,
  buildWorkflowRepairContinuation,
  classifyWorkflowContinuationIntent,
  deriveWorkflowContinuationTarget,
  hasWorkflowLocalExplainEvidence,
  hasWorkflowReadFragmentEvidence,
  inferWorkflowVerifyCommand,
  projectWorkflowLineageActivation,
  type RepairContinuationObject,
} from "../orchestration/continuationModule.js";
import { buildReflectiveStateQueryResponse } from "../orchestration/continuationPlanning.js";
import { formatTargetResolutionBlockerReason } from "../orchestration/doNextProjection.js";
import { projectProviderDiagnosticHandoff } from "../orchestration/providerModule.js";
import {
  inferRepoDiagnosis,
  isPathOnlyReadRequest,
  recoverReadContinuationTarget,
} from "../orchestration/readInspectModule.js";
import {
  classifyEditExpectationContract,
  isWriteExpectationPrompt,
} from "../orchestration/editExpectationContract.js";
import {
  buildActionResultSeedDecisionTrace,
  buildPostEditVerifyContinuationLineage,
  continuityStateAsObject,
  hasPassedVerificationLineage,
  type ContinuityStateLike,
  type GroundedDeliverableMode,
} from "../orchestration/runtimeHandoffProjection.js";
import {
  buildWorkflowDecisionTrace,
  type GroundedDeliverableConstraints,
  type GroundedRepairInstruction,
  type GroundedRepairStage,
  type WorkflowTaskPlan,
} from "../orchestration/workflowTaskPlanner.js";
import {
  extractWorkflowTaskIntentSignals,
  isAmbiguousGroundedRepairFollowUp,
  isPostEditReadOnlyVerifyFollowUp,
  isTemporalSuccessorCuePrompt,
  isUltraWeakContinuationFollowUpPrompt,
  isWeakSeedTargetCarryoverPrompt,
} from "./workflowIntentSignals.js";
import {
  resolveWorkflowTargetPlanning,
  shouldBlockMutationForTargetResolution,
} from "./workflowTargetPlanning.js";
import { rebindContinuationTargetToWorkspace } from "../session/continuationTargetRebase.js";
import { deriveWorkflowTurnContinuationFacts } from "../session/turnContinuationFacts.js";
import { buildCommandIntentPlan } from "../verification/commandIntentPlanning.js";
import { buildVerifyContinuationPlanning } from "../verification/verifyContinuationPlanning.js";

export { extractInlineContinuityContext } from "../session/inlineContinuityContext.js";
export { rebindContinuationTargetToWorkspace } from "../session/continuationTargetRebase.js";

export function buildWorkflowTaskPlan(
  prompt: string,
  workspaceRoot: string,
  continuityState?: unknown,
): WorkflowTaskPlan {
  const continuity = continuityStateAsObject(continuityState);
  const continuationIntent = classifyWorkflowContinuationIntent({
    prompt,
    continuity,
  });
  const replaySafeLineage = buildWorkflowContinuationLineage({ continuity });
  const {
    normalized,
    intentPrompt,
    groundedIntentPrompt,
    hasContextSeedPrefix,
    hasExplicitBoundaryResetPrompt,
    hasFileReadIntent,
    hasTargetedFileReadIntent,
    hasRepositoryInspectIntent,
    hasSummarizeIntent,
    hasExplainIntent,
    hasReflectiveExplainStateQuestion,
    hasReflectiveExplainContinuation,
    hasReflectiveExplainQuery,
    detectedReflectiveStateQueryKind,
    reflectiveStateQueryKind,
    hasReflectiveActionCue,
    hasPriorLocalExplainEvidence,
    hasRecoverableReadFragmentEvidence,
    hasLocalExplainCue,
    hasGroundedReadLikeIntent,
    hasGroundedConstraintCue,
    hasCreateIntent,
    hasEditIntentRaw,
    hasEditIntent,
    hasVerifyIntent,
    hasCorrectionCue,
    hasExecutionCorrectionCue,
    hasAnswerRepairCue,
    isAmbiguousRepairFollowUp,
    hasDiagnosisIntent,
    hasWeakRepairFollowUp,
    avoidPreviousDirection,
    hasCrossFileCue,
    hasVerifyContinuationCue,
    verifyCommand,
    preferTestOverBuild,
    effectiveVerifyCommand,
    effectiveReplaceDirectiveFromPrompt,
    hasExecutionIntent,
    unsupportedCommand,
  } = extractWorkflowTaskIntentSignals(prompt, continuity);
  const {
    targetResolution,
    promptPathTarget,
    explicitPrimaryTarget,
    hasExplicitPathReference,
  } = resolveWorkflowTargetPlanning({
    prompt,
    workspaceRoot,
    hasVerifyIntent,
  });
  const browserPlan = buildBrowserIntentPlan({
    prompt,
    continuity,
  });
  if (browserPlan) {
    return browserPlan;
  }
  if (
    targetResolution.blocker &&
    shouldBlockMutationForTargetResolution({
      blocker: targetResolution.blocker,
      hasCorrectionCue,
      hasCreateIntent,
      hasEditIntent,
      hasExecutionCorrectionCue,
      hasFencedContent: Boolean(extractFencedContent(prompt)),
      hasReplaceDirective: Boolean(effectiveReplaceDirectiveFromPrompt),
    })
  ) {
    return {
      taskKind: "edit-file",
      reason: "target resolution blocked mutation planning",
      inspectFirst: false,
      verifyAfterEdit: false,
      blockedReason: formatTargetResolutionBlockerReason(
        targetResolution.blocker,
      ),
      targetMissing: true,
    };
  }
  const rawContinuityTargetPath = deriveWorkflowContinuationTarget({
    continuity,
    workspaceRoot,
  });
  const hasImplicitPathOnlyReadIntent =
    !hasFileReadIntent &&
    !hasSummarizeIntent &&
    !hasExplainIntent &&
    hasExplicitPathReference &&
    isPathOnlyReadRequest(prompt);
  const diagnosticHandoffProjection = projectProviderDiagnosticHandoff(continuity);
  const diagnosticHandoffEvidence =
    diagnosticHandoffProjection.diagnosticHandoff;
  const {
    seedActionKind,
    hasActionResultSeed,
    seedWasReadLike,
    lastTaskWasReadLike,
    lastTaskWasMutationLike,
    seedVerificationStatus,
    diagnosticVerifyStatus,
    diagnosticHasVerifySignal,
  } = deriveWorkflowTurnContinuationFacts({
    continuity,
    diagnosticHandoffEvidence,
  });
  const seedIgnoredExplicitTargetLineage =
    hasActionResultSeed && hasExplicitPathReference
      ? ["seedInfluence=ignored-explicit-target"]
      : undefined;
  const hasDiagnosticVerifyHandoffCue =
    Boolean(diagnosticHandoffEvidence?.command) &&
    hasVerifyIntent &&
    !hasExplicitPathReference;
  const hasWeakDiagnosticHandoffCue =
    Boolean(diagnosticHandoffEvidence) &&
    isWeakSeedTargetCarryoverPrompt(prompt) &&
    !hasExplicitPathReference;
  const diagnosticHandoffLineage =
    (hasWeakDiagnosticHandoffCue || hasDiagnosticVerifyHandoffCue) &&
    diagnosticHandoffEvidence
      ? diagnosticHandoffProjection.lineage
      : undefined;
  const ignoredExplicitTargetLineage = [
    ...(seedIgnoredExplicitTargetLineage ?? []),
    ...(diagnosticHandoffEvidence && hasExplicitPathReference
      ? ["diagnosticHandoff=ignored-explicit-target"]
      : []),
  ];
  const ignoredExplicitTargetLineageOrUndefined =
    ignoredExplicitTargetLineage.length > 0
      ? ignoredExplicitTargetLineage
      : undefined;
  const hasPostEditReadOnlyVerifyPrompt =
    isPostEditReadOnlyVerifyFollowUp(prompt);
  const hasWeakSeedTargetCarryoverCue =
    isWeakSeedTargetCarryoverPrompt(prompt) && !hasExplicitPathReference;
  const hasPostEditReadOnlyVerifyCue =
    hasPostEditReadOnlyVerifyPrompt &&
    lastTaskWasMutationLike &&
    !hasCorrectionCue &&
    !hasCreateIntent &&
    !hasExecutionIntent &&
    !effectiveReplaceDirectiveFromPrompt &&
    !extractFencedContent(prompt);
  const hasSeedReadOnlyCheckCue =
    (hasPostEditReadOnlyVerifyPrompt || hasWeakSeedTargetCarryoverCue) &&
    seedWasReadLike &&
    !hasEditIntent &&
    !hasCorrectionCue &&
    !hasCreateIntent &&
    !hasExecutionIntent &&
    !effectiveReplaceDirectiveFromPrompt &&
    !extractFencedContent(prompt);
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
    continuity.lastVerificationStatus === "failed" ||
    continuity.lastVerificationStatus === "blocked" ||
    continuity.lastVerificationStatus === "skipped" ||
    Boolean(seedVerificationStatus && seedVerificationStatus !== "not-requested") ||
    diagnosticHasVerifySignal ||
    (continuity.unresolvedItems ?? []).some(
      (entry) =>
        entry.toLowerCase().startsWith("verify:") &&
        !entry.toLowerCase().includes("not-requested"),
    );
  const mutationVerificationLineage =
    buildPostEditVerifyContinuationLineage(continuity);
  const previousRemainingTargets =
    extractCrossFileStateListFromContinuityEvidence(
      continuity,
      "repair-remaining-files:",
    );
  const previousFailedEntries =
    extractCrossFileFailureEntriesFromContinuity(continuity);
  const hasFailureRecoverySignals =
    previousRemainingTargets.length > 0 ||
    previousFailedEntries.length > 0 ||
    (continuity.recentFailedFiles?.length ?? 0) > 0;
  const hasTaskTruthAnchor =
    Boolean(continuity.lastUserIntent?.trim()) ||
    Boolean(continuity.lastAssistantOutput?.trim()) ||
    Boolean(continuity.lastTaskSatisfactionVerdict) ||
    Boolean(continuity.lastContinuationStatus) ||
    Boolean(continuity.lastFailure);
  const hasContinuationStateSignals =
    previousRemainingTargets.length > 0 ||
    previousFailedEntries.length > 0 ||
    (continuity.recentTargetFiles?.length ?? 0) > 0 ||
    (continuity.recentFailedFiles?.length ?? 0) > 0 ||
    (continuity.lastContinuationEvidence?.length ?? 0) > 0 ||
    Boolean(diagnosticHandoffEvidence) ||
    hasTaskTruthAnchor;
  const editFailureRepairContext = resolveSingleFileEditFailureRepairContext(
    continuity,
    workspaceRoot,
  );
  const editFailureRepairContextAbandonment = editFailureRepairContext
    ? undefined
    : resolveSingleFileEditFailureRepairContextAbandonment(
        continuity,
        workspaceRoot,
      );
  const hasEditFailureRepairLikePayload = Boolean(
    !hasGroundedReadLikeIntent &&
    !hasVerifyIntent &&
    !hasDiagnosisIntent &&
    !hasExecutionIntent &&
    (effectiveReplaceDirectiveFromPrompt ||
      extractFencedContent(prompt) ||
      ((editFailureRepairContext?.failureReason === "edit-target-missing" ||
        editFailureRepairContextAbandonment?.failureReason ===
          "edit-target-missing") &&
        hasPathLikeReference(prompt) &&
        (hasEditIntent ||
          Boolean(effectiveReplaceDirectiveFromPrompt) ||
          Boolean(extractFencedContent(prompt))))),
  );
  const hasEditFailureRepairPayload = Boolean(
    editFailureRepairContext && hasEditFailureRepairLikePayload,
  );
  const editFailureRepairPayloadKind =
    hasEditFailureRepairPayload && editFailureRepairContext
      ? resolveSingleFileEditRepairPayloadKind({
          failureReason: editFailureRepairContext.failureReason,
          prompt,
          hasEditIntent,
          replaceDirective: effectiveReplaceDirectiveFromPrompt,
          fencedContent: extractFencedContent(prompt),
        })
      : undefined;
  const hasTemporalSuccessorContextSignal =
    hasContinuationStateSignals ||
    hasContextSeedPrefix ||
    continuity.lastTerminalClassification === "stopped" ||
    continuity.lastTerminalReason === "stopped_error";
  const hasAtypicalReopenCue = isAtypicalReopenFollowUpPrompt(prompt);
  const hasUltraWeakContinuationCue =
    isUltraWeakContinuationFollowUpPrompt(prompt);
  const hasTemporalSuccessorCue =
    isTemporalSuccessorCuePrompt(prompt) &&
    hasTemporalSuccessorContextSignal &&
    !hasDiagnosisIntent &&
    !hasExecutionIntent &&
    !hasGroundedReadLikeIntent &&
    !hasVerifyIntent &&
    !hasCreateIntent;
  const hasResumeTaskContinuityCue =
    /\b(?:after\s+resume|resume\s+check|same\s+task|exact\s+task|keep\s+the\s+exact\s+task|continue\s+the\s+same\s+task)\b/i.test(
      prompt,
    ) &&
    hasContinuationStateSignals &&
    !hasDiagnosisIntent &&
    !hasExecutionIntent &&
    !hasGroundedReadLikeIntent &&
    (!hasVerifyIntent ||
      detectedReflectiveStateQueryKind === "task-continuity") &&
    !hasCreateIntent;
  const hasAmbiguousUltraWeakContinuationCue =
    isAmbiguousGroundedRepairFollowUp(prompt) &&
    !hasDiagnosisIntent &&
    !hasExecutionIntent &&
    !hasGroundedReadLikeIntent &&
    !hasVerifyIntent &&
    !hasCreateIntent;
  const hasUltraWeakContinuationEquivalentCue =
    hasUltraWeakContinuationCue ||
    hasAmbiguousUltraWeakContinuationCue ||
    hasTemporalSuccessorCue;
  const hasContinuationCueRaw =
    /(?:continue|same file|use the failure above|wrong direction|not the right fix|\u7ee7\u7eed|\u63a5\u7740|\u4e0a\u4e00\u8f6e|\u5931\u8d25)/i.test(
      prompt,
    ) ||
    (hasUltraWeakContinuationEquivalentCue &&
      hasContinuationStateSignals &&
      !hasDiagnosisIntent &&
      !hasExecutionIntent &&
      !hasGroundedReadLikeIntent &&
      !hasVerifyIntent &&
      !hasCreateIntent) ||
    (Boolean(reflectiveStateQueryKind) && hasReflectiveActionCue) ||
    (hasAtypicalReopenCue &&
      hasContinuationStateSignals &&
      !hasDiagnosisIntent &&
      !hasExecutionIntent &&
      !hasGroundedReadLikeIntent);
  const hasContinuationCue =
    hasContinuationCueRaw &&
    !hasExplicitBoundaryResetPrompt &&
    !hasContextSeedPrefix;
  const hasWeakNextStepContinuationCue =
    hasUltraWeakContinuationEquivalentCue ||
    /\b(?:now\s+)?(?:continue|proceed|do\s+(?:the\s+)?next\s+step)\b/i.test(
      prompt,
    );
  const hasDegradedContinuationEvidence =
    hasDegradedContinuationEvidenceInState(continuity);
  const hasDegradedReopenCue = isDegradedReopenFollowUpPrompt(prompt);
  const continuationReopenDecision = resolveContinuationReopenTarget({
    continuity,
    prompt,
    workspaceRoot,
    enabled:
      (hasFailureRecoverySignals || hasDegradedContinuationEvidence) &&
      (hasDegradedReopenCue ||
        hasAtypicalReopenCue ||
        hasCrossFileCue ||
        hasUltraWeakContinuationEquivalentCue ||
        hasContinuationCue) &&
      !explicitPrimaryTarget &&
      !promptPathTarget,
    degradedOnly: hasDegradedContinuationEvidence && hasDegradedReopenCue,
  });
  const hasContinuationExecutionIntent =
    hasContinuationCue ||
    hasEditFailureRepairPayload ||
    hasEditIntent ||
    hasCreateIntent ||
    (continuationReopenDecision.enabled &&
      (Boolean(continuationReopenDecision.selectedTarget) ||
        continuationReopenDecision.candidates.length > 0));
  const readContinuityRecovery = recoverReadContinuationTarget({
    candidatePath: rawContinuityTargetPath,
    continuity,
    workspaceRoot,
  });
  const continuityCandidateForIntent =
    hasGroundedReadLikeIntent || hasImplicitPathOnlyReadIntent
      ? readContinuityRecovery.targetPath
      : rawContinuityTargetPath;
  const hasPathlessReadTargetCarryoverCue =
    hasFileReadIntent &&
    !hasExplicitPathReference &&
    !hasEditIntent &&
    !hasCreateIntent &&
    !hasExecutionIntent &&
    !hasVerifyIntent;
  const shouldUseContinuationTarget = Boolean(
    !explicitPrimaryTarget &&
    continuityCandidateForIntent &&
    (hasContinuationCue ||
      hasCorrectionCue ||
      hasExecutionCorrectionCue ||
      hasAnswerRepairCue ||
      hasGroundedConstraintCue ||
      hasEditFailureRepairPayload ||
      isAmbiguousRepairFollowUp ||
      hasWeakRepairFollowUp ||
      hasPostEditReadOnlyVerifyCue ||
      hasSeedReadOnlyCheckCue ||
      hasWeakDiagnosticHandoffCue ||
      hasDiagnosticVerifyHandoffCue ||
      hasPathlessReadTargetCarryoverCue ||
      (hasGroundedReadLikeIntent && lastTaskWasReadLike) ||
      hasEditIntent ||
      hasCreateIntent ||
      (hasVerifyIntent && lastTaskHadVerifySignal) ||
      (hasWeakNextStepContinuationCue &&
        Boolean(mutationVerificationLineage?.length) &&
        hasPassedVerificationLineage(continuity))),
  );
  const continuityTargetPath =
    continuationReopenDecision.selectedTarget ??
    (shouldUseContinuationTarget ? continuityCandidateForIntent : undefined);
  const explicitHasExtension = Boolean(
    explicitPrimaryTarget?.cleaned &&
    /\/[^/]+\.[A-Za-z0-9._-]+$/.test(
      normalizePathLike(explicitPrimaryTarget.cleaned),
    ),
  );
  const hasWriteExpectationIntent =
    !hasCreateIntent && isWriteExpectationPrompt(prompt);
  const hasWriteTaskIntent = hasCreateIntent || hasWriteExpectationIntent;
  const mutationIntentTarget = selectMutationIntentTarget({
    prompt,
    targets: targetResolution.targets,
    hasWriteTaskIntent,
    hasEditIntent,
  });
  const primaryTarget =
    mutationIntentTarget ??
    (explicitHasExtension ? explicitPrimaryTarget : null) ??
    promptPathTarget ??
    explicitPrimaryTarget ??
    (continuityTargetPath
      ? {
          raw: continuityTargetPath,
          cleaned: continuityTargetPath,
          absolutePath: continuityTargetPath,
          inWorkspace: true,
        }
      : null);
  const editExpectationContract = classifyEditExpectationContract({
    prompt,
    targetPath: primaryTarget?.cleaned,
    targetCount: targetResolution.targets.length,
    hasConcreteContent: Boolean(
      extractFencedContent(prompt) ?? extractInlineWriteContent(prompt),
    ),
    hasReplaceDirective: Boolean(effectiveReplaceDirectiveFromPrompt),
    hasFencedContent: Boolean(extractFencedContent(prompt)),
    hasCreateIntent: hasWriteTaskIntent,
    hasEditIntent,
    hasReadInspectIntent: hasGroundedReadLikeIntent,
  });
  const readContinuationLineage = [
    ...(ignoredExplicitTargetLineageOrUndefined ?? []),
    ...(readContinuityRecovery.relocationNote
      ? [readContinuityRecovery.relocationNote]
      : []),
  ];
  const readContinuationLineageOrUndefined =
    readContinuationLineage.length > 0 ? readContinuationLineage : undefined;
  const usedRestoredState =
    !explicitPrimaryTarget &&
    (Boolean(continuityTargetPath) ||
      hasWeakDiagnosticHandoffCue ||
      hasDiagnosticVerifyHandoffCue ||
      ((hasContinuationCue ||
        hasEditFailureRepairPayload ||
        hasTemporalSuccessorCue ||
        hasResumeTaskContinuityCue) &&
        hasTaskTruthAnchor));
  const explicitDeliverableMode = detectGroundedDeliverableMode(prompt);
  const inferredDeliverableModeFromContinuity =
    inferGroundedDeliverableModeFromContinuity(continuity);
  const effectiveGroundedDeliverableMode =
    explicitDeliverableMode ??
    (lastTaskWasReadLike &&
    (hasContinuationCue ||
      hasCorrectionCue ||
      hasAnswerRepairCue ||
      isAmbiguousRepairFollowUp ||
      hasGroundedReadLikeIntent ||
      (usedRestoredState && !hasDiagnosisIntent))
      ? inferredDeliverableModeFromContinuity
      : undefined);
  const normalizedRepairInstruction = normalizeGroundedRepairInstruction({
    prompt,
    continuity,
    explicitDeliverableMode,
    effectiveDeliverableMode: effectiveGroundedDeliverableMode,
    hasContinuationCue,
    hasCorrectionCue,
    hasAnswerRepairCue,
    isAmbiguousRepairFollowUp,
    hasGroundedReadLikeIntent,
    lastTaskWasReadLike,
  });
  const readWindowDirective = resolveReadWindowDirectiveForWorkflow(
    prompt,
    continuity,
    {
      localSliceExplain: hasLocalExplainCue,
    },
  );
  const readFragmentDirective =
    extractLastReadDeliveredFragmentFromContinuity(continuity);
  const mutationScopePlanning = resolveMutationScopePlanning({
    prompt,
    readFragment: readFragmentDirective,
    hasEditIntent,
    hasExecutionCorrectionCue,
    hasContinuationCue,
    hasGroundedReadLikeIntent,
    hasVerifyIntent,
    hasDiagnosisIntent,
    hasCreateIntent,
  });
  const failedTransforms = collectContinuationTransforms({
    continuity,
    preferredTarget: primaryTarget?.cleaned,
    workspaceRoot,
  });
  const hasCrossFileContinuationContext =
    hasCrossFileContinuationContextInContinuity(continuity);
  const crossFileCandidates = deriveCrossFileRepairCandidates(
    continuity,
    primaryTarget?.cleaned,
  );
  const hasCrossFileEvidenceSignal =
    hasCrossFileEvidenceSignalInContinuity(continuity);
  const hasCrossFileUltraWeakFollowUp =
    hasUltraWeakContinuationEquivalentCue &&
    !hasCrossFileCue &&
    !hasCorrectionCue &&
    !hasExecutionCorrectionCue &&
    !hasAnswerRepairCue &&
    (hasCrossFileEvidenceSignal || hasCrossFileContinuationContext);
  const selectedReopenTargetPath = continuationReopenDecision.selectedTarget;
  const selectedReopenTargetExists = Boolean(
    selectedReopenTargetPath && continuationReopenDecision.selectedTargetExists,
  );
  const hasSingleRecoverableCrossFileReopenTarget = Boolean(
    hasCrossFileUltraWeakFollowUp &&
    continuationReopenDecision.selectedTarget &&
    continuationReopenDecision.candidates.length === 1 &&
    selectedReopenTargetExists,
  );
  const continuityReplaceDirective = inferReplaceDirectiveFromContinuity({
    continuity,
    preferredTarget: primaryTarget?.cleaned,
    workspaceRoot,
  });
  const hasStaleTransformExhaustionHistory =
    ((continuity.lastTerminalClassification === "stopped" ||
      continuity.lastTerminalReason === "stopped_error") &&
      /stale against current file content|stale-transform-already-applied/i.test(
        continuity.lastFailure ?? "",
      )) ||
    (continuity.lastContinuationEvidence ?? []).some((entry) =>
      /rebind-blocker:[^:]+:stale-transform-already-applied:/i.test(entry),
    );
  const retireContinuityTransformForCrossFileUltraWeak =
    hasCrossFileUltraWeakFollowUp &&
    !effectiveReplaceDirectiveFromPrompt &&
    hasStaleTransformExhaustionHistory;
  const continuityReplaceDirectiveForExecution =
    retireContinuityTransformForCrossFileUltraWeak
      ? undefined
      : continuityReplaceDirective;
  const hasExecutableCrossFileTransformEvidence = Boolean(
    effectiveReplaceDirectiveFromPrompt ??
    continuityReplaceDirectiveForExecution,
  );
  const allowCrossFileUltraWeakAutoContinuation = Boolean(
    hasSingleRecoverableCrossFileReopenTarget &&
    hasExecutableCrossFileTransformEvidence,
  );
  const lineageActivationResult = projectWorkflowLineageActivation({
    continuity,
    weakOrTemporalCue: hasUltraWeakContinuationEquivalentCue,
    selectedReopenTarget: continuationReopenDecision.selectedTarget,
    reopenCandidates: continuationReopenDecision.candidates,
    crossFileSignal: hasCrossFileEvidenceSignal,
  });
  const lineageActivation = lineageActivationResult.decision;
  const lineageActivationProjection = lineageActivationResult.projection;
  const lineageActivationEvidence =
    lineageActivationProjection.evidence.length > 0
      ? lineageActivationProjection.evidence
      : undefined;
  const shouldUsePostExhaustionUnifiedBlocker =
    hasStaleTransformExhaustionHistory &&
    hasUltraWeakContinuationEquivalentCue &&
    !effectiveReplaceDirectiveFromPrompt &&
    (hasCrossFileEvidenceSignal ||
      hasCrossFileContinuationContext ||
      continuationReopenDecision.enabled);
  const verifyContinuationPlanning = buildVerifyContinuationPlanning({
    continuity,
    primaryTargetPath: primaryTarget?.cleaned,
    primaryTargetInWorkspace: primaryTarget?.inWorkspace === true,
    rawContinuityTargetPath,
    effectiveVerifyCommand,
    hasVerifyContinuationCue,
    hasDiagnosticVerifyHandoffCue,
    reflectiveStateQueryKind,
    hasReflectiveActionCue,
    hasVerifyIntent,
    hasExecutionCorrectionCue,
    lastTaskHadVerifySignal,
    workspaceRoot,
    usedRestoredState,
    continuationLineage: verifyContinuationLineageOrUndefined,
  });
  const hasVerifyLineageHint =
    verifyContinuationPlanning.hasVerifyLineageHint;
  const hasBlockedVerifyResumeContext =
    verifyContinuationPlanning.hasBlockedVerifyResumeContext;
  const inferredTransformDirective =
    failedTransforms.length > 0
      ? {
          from: failedTransforms[failedTransforms.length - 1]!.from,
          to: failedTransforms[failedTransforms.length - 1]!.to,
        }
      : undefined;
  const interruptedGoalRepairDirective =
    effectiveReplaceDirectiveFromPrompt ??
    continuityReplaceDirectiveForExecution ??
    inferredTransformDirective ??
    inferReplaceDirectiveFromContinuity({
      continuity,
      workspaceRoot,
    });
  const hasInterruptedGoalRepairCue = Boolean(
    /continue the interrupted task/i.test(prompt) &&
      lastTaskWasMutationLike &&
      continuity.lastVerificationStatus === "failed" &&
      (primaryTarget?.inWorkspace || rawContinuityTargetPath) &&
      interruptedGoalRepairDirective &&
      !hasExplicitBoundaryResetPrompt,
  );
  const hasRepairContinuationCue =
    hasInterruptedGoalRepairCue ||
    isRepairContinuationFollowUpPrompt(prompt) ||
    (reflectiveStateQueryKind === "stop-reason" && hasReflectiveActionCue) ||
    (reflectiveStateQueryKind === "next-step" &&
      /(?:\bcontinue fixing(?:\s+that)?\b|继续修|继续修这个|按这个继续修)/i.test(
        prompt,
      ));
  const repairObject = hasRepairContinuationCue
    ? buildWorkflowRepairContinuation({
        continuity,
        targetPath:
          primaryTarget?.inWorkspace
            ? (rebindContinuationTargetToWorkspace(
                primaryTarget.cleaned,
                workspaceRoot,
              ) ?? primaryTarget.cleaned)
            : hasInterruptedGoalRepairCue
              ? rawContinuityTargetPath
              : undefined,
        replaceDirective:
          effectiveReplaceDirectiveFromPrompt ??
          continuityReplaceDirectiveForExecution ??
          inferredTransformDirective ??
          interruptedGoalRepairDirective,
      })
    : undefined;
  const allowWeakFollowUpInheritedTransform =
    hasWeakRepairFollowUp &&
    crossFileCandidates.length > 0 &&
    (hasCrossFileCue || hasCrossFileEvidenceSignal);
  const effectiveReplaceDirective =
    effectiveReplaceDirectiveFromPrompt ??
    (hasWeakRepairFollowUp && !allowWeakFollowUpInheritedTransform
      ? undefined
      : continuityReplaceDirectiveForExecution);
  const shouldKeepVerifiedMutationNextStep =
    Boolean(mutationVerificationLineage?.length) &&
    hasPassedVerificationLineage(continuity) &&
    hasWeakNextStepContinuationCue &&
    primaryTarget?.inWorkspace === true &&
    !hasReflectiveActionCue &&
    !hasEditIntent &&
    !hasCreateIntent &&
    !hasRepairContinuationCue &&
    !hasVerifyIntent &&
    !hasExecutionIntent &&
    !hasGroundedReadLikeIntent &&
    !effectiveReplaceDirective &&
    !extractFencedContent(prompt);
  const shouldCoordinateCrossFileRepair =
    !hasCreateIntent &&
    !effectiveReplaceDirectiveFromPrompt &&
    crossFileCandidates.length > 0 &&
    (hasCrossFileCue ||
      hasCrossFileEvidenceSignal ||
      hasContinuationCue ||
      hasCorrectionCue ||
      hasWeakRepairFollowUp);
  const shouldReturnCrossFileConvergedNoop =
    !hasCreateIntent &&
    !effectiveReplaceDirectiveFromPrompt &&
    !allowCrossFileUltraWeakAutoContinuation &&
    (hasCrossFileCue || hasContinuationCue || hasWeakRepairFollowUp) &&
    hasCrossFileContinuationContext &&
    crossFileCandidates.length === 0;
  const missingActiveWorkContext =
    (hasExecutionCorrectionCue || hasContinuationCue) &&
    !primaryTarget?.inWorkspace &&
    !explicitPrimaryTarget &&
    (lastTaskWasMutationLike || lastTaskHadVerifySignal);

  if (repairObject && hasRepairContinuationCue) {
    if (!repairObject.executableNow) {
      return {
        taskKind: "edit-file",
        reason:
          "repair continuation requested, but structured repair object is incomplete",
        inspectFirst: true,
        verifyAfterEdit: false,
        blockedReason: `Repair continuation is unavailable: missing ${repairObject.missingFields.join(", ")}.`,
        targetMissing: !repairObject.targetPath,
        usedRestoredState,
      };
    }
    return {
      taskKind: "edit-file",
      reason:
        hasInterruptedGoalRepairCue
          ? "interrupted verification failure continuation resumed original edit goal before rerunning verification"
          : "repair continuation resolved from structured blocker/failure lineage",
      targetPath: repairObject.targetPath,
      inspectFirst: true,
      verifyAfterEdit: hasInterruptedGoalRepairCue,
      ...(repairObject.verifyCommand || hasInterruptedGoalRepairCue
        ? {
            verifyCommand:
              repairObject.verifyCommand ??
              effectiveVerifyCommand ??
              inferWorkflowVerifyCommand(continuity) ??
              continuity.lastVerificationCommand,
          }
        : {}),
      ...(repairObject.replaceFrom && repairObject.replaceTo
        ? {
            replaceFrom: repairObject.replaceFrom,
            replaceTo: repairObject.replaceTo,
          }
        : {}),
      ...(failedTransforms.length > 0 ? { failedTransforms } : {}),
      continuationLineage: [
        `continuation-intent:${continuationIntent.kind}`,
        ...lineageActivationProjection.evidence,
        ...(repairObject.verifyCommand
          ? [
              `verify-command-hint:${repairObject.verifyCommand}`,
              ...(repairObject.targetPath
                ? [`verify-target-hint:${repairObject.targetPath}`]
                : []),
            ]
          : []),
        ...(repairObject.sourceLineage.length > 0
          ? repairObject.sourceLineage
          : replaySafeLineage.evidenceIds),
      ],
      usedRestoredState: hasInterruptedGoalRepairCue ? true : usedRestoredState,
    };
  }

  if (lineageActivation.status === "blocked") {
    return {
      taskKind: "edit-file",
      reason: "continuation lineage requires explicit disambiguation",
      inspectFirst: true,
      verifyAfterEdit: false,
      blockedReason:
        lineageActivation.reason ??
        "Continuation follow-up is ambiguous; provide explicit target/action.",
      targetMissing: true,
      usedRestoredState,
      continuationLineage: [
        `continuation-intent:${continuationIntent.kind}`,
        ...lineageActivationProjection.evidence,
      ],
      previousRemainingTargets,
      previousFailedEntries,
      ...(continuationReopenDecision.enabled
        ? {
            degradedReopen: true,
            degradedReopenReason:
              continuationReopenDecision.reason ??
              lineageActivation.reason,
            degradedReopenCandidates: continuationReopenDecision.candidates,
            degradedReopenCandidateSource:
              continuationReopenDecision.candidateSourceSummary,
            degradedReopenCandidatePruned:
              continuationReopenDecision.prunedCandidateSummary,
          }
        : {}),
    };
  }

  if (shouldUsePostExhaustionUnifiedBlocker) {
    return {
      taskKind: "edit-file",
      reason:
        "post-exhaustion cross-file ultra-weak follow-up requires explicit transform",
      inspectFirst: true,
      verifyAfterEdit: false,
      blockedReason:
        "Cross-file follow-up is ambiguous for direct execution (missing transform evidence). Provide explicit file path or transform to continue.",
      targetMissing: true,
      usedRestoredState,
      previousRemainingTargets,
      previousFailedEntries,
      ...(continuationReopenDecision.enabled
        ? {
            degradedReopen: true,
            degradedReopenReason:
              continuationReopenDecision.reason ??
              "post-exhaustion stale transform retired for generic follow-up",
            degradedReopenCandidates: continuationReopenDecision.candidates,
            degradedReopenCandidateSource:
              continuationReopenDecision.candidateSourceSummary,
            degradedReopenCandidatePruned:
              continuationReopenDecision.prunedCandidateSummary,
          }
        : {}),
    };
  }

  if (verifyContinuationPlanning.plan) {
    return verifyContinuationPlanning.plan;
  }

  if (
    continuationReopenDecision.enabled &&
    !continuationReopenDecision.selectedTarget
  ) {
    const useUnifiedUltraWeakExhaustionSurface =
      hasUltraWeakContinuationEquivalentCue &&
      (hasCrossFileEvidenceSignal ||
        hasCrossFileContinuationContext ||
        continuationReopenDecision.enabled);
    const reason = useUnifiedUltraWeakExhaustionSurface
      ? "Cross-file follow-up is ambiguous for direct execution (missing transform evidence). Provide explicit file path or transform to continue."
      : continuationReopenDecision.candidates.length > 1
        ? `Continuation reopen has multiple candidate targets (${continuationReopenDecision.candidates.join(", ")}). Cannot auto-select; provide explicit file path or transform to continue repair.`
        : "Continuation reopen has no recoverable target candidate. Provide explicit file path to reopen repair.";
    return {
      taskKind: "edit-file",
      reason: "continuation reopen requires explicit target disambiguation",
      inspectFirst: true,
      verifyAfterEdit: false,
      blockedReason: reason,
      targetMissing: true,
      usedRestoredState,
      previousRemainingTargets,
      previousFailedEntries,
      degradedReopen: true,
      degradedReopenReason: continuationReopenDecision.reason,
      degradedReopenCandidates: continuationReopenDecision.candidates,
      degradedReopenCandidateSource:
        continuationReopenDecision.candidateSourceSummary,
      degradedReopenCandidatePruned:
        continuationReopenDecision.prunedCandidateSummary,
      continuationLineage: [
        `continuation-intent:${continuationIntent.kind}`,
        ...(lineageActivationEvidence ?? []),
      ],
    };
  }

  if (
    continuationReopenDecision.enabled &&
    continuationReopenDecision.selectedTarget &&
    hasCrossFileUltraWeakFollowUp &&
    !effectiveReplaceDirectiveFromPrompt
  ) {
    const missingTransform =
      !effectiveReplaceDirective && !allowCrossFileUltraWeakAutoContinuation;
    const missingTarget = !selectedReopenTargetExists;
    if (missingTransform || missingTarget) {
      const reasonParts: string[] = [];
      if (missingTransform) {
        reasonParts.push("missing transform evidence");
      }
      if (missingTarget) {
        reasonParts.push(
          `target '${continuationReopenDecision.selectedTarget}' is not recoverable in workspace`,
        );
      }
      return {
        taskKind: "edit-file",
        reason:
          "cross-file ultra-weak follow-up requires clarification before execution",
        inspectFirst: true,
        verifyAfterEdit: false,
        blockedReason: `Cross-file follow-up is ambiguous for direct execution (${reasonParts.join("; ")}). Provide explicit file path or transform to continue.`,
        targetMissing: true,
        usedRestoredState,
        previousRemainingTargets,
        previousFailedEntries,
        degradedReopen: true,
        degradedReopenReason:
          continuationReopenDecision.reason ??
          "ultra-weak cross-file follow-up with insufficient executable evidence",
        degradedReopenCandidates: continuationReopenDecision.candidates,
        degradedReopenCandidateSource:
          continuationReopenDecision.candidateSourceSummary,
        degradedReopenCandidatePruned:
          continuationReopenDecision.prunedCandidateSummary,
      };
    }
  }

  if (missingActiveWorkContext) {
    return {
      taskKind: "edit-file",
      reason:
        "follow-up mutation/verify prompt has no resolvable active target",
      inspectFirst: true,
      verifyAfterEdit: false,
      blockedReason:
        "Follow-up refers to previous edit/verify work, but no active target/failure context could be inherited. Provide explicit file path or rerun with the previous session context.",
      targetMissing: true,
      usedRestoredState,
    };
  }

  if (
    hasContextSeedPrefix &&
    !hasGroundedReadLikeIntent &&
    !hasCreateIntent &&
    !hasVerifyIntent &&
    !hasDiagnosisIntent
  ) {
    return {
      taskKind: "read-file",
      reason: "context-seed prompt acknowledged without executing prior task",
      inspectFirst: true,
      verifyAfterEdit: false,
      blockedReason:
        "Previous-task context was noted, but no execution was performed. Provide a concrete next task to continue.",
      targetMissing: true,
      usedRestoredState,
    };
  }

  if (
    hasExplicitBoundaryResetPrompt &&
    !hasGroundedReadLikeIntent &&
    !hasCreateIntent &&
    !hasVerifyIntent &&
    !hasDiagnosisIntent
  ) {
    return {
      taskKind: "read-file",
      reason:
        "freshness boundary reset requested for prior continuation history",
      inspectFirst: true,
      verifyAfterEdit: false,
      blockedReason:
        "Boundary reset applied. Prior mutation lineage was not consumed; provide a new explicit task or target to proceed.",
      targetMissing: true,
      usedRestoredState,
    };
  }

  if (shouldKeepVerifiedMutationNextStep && primaryTarget?.inWorkspace) {
    return {
      taskKind: "chat",
      reason:
        "verified mutation weak follow-up preserved target and next-step lineage",
      reflectiveStateQueryKind: "next-step",
      targetPath: primaryTarget.cleaned,
      inspectFirst: false,
      verifyAfterEdit: false,
      usedRestoredState: true,
      continuationLineage: mutationVerificationLineage,
    };
  }

  if (reflectiveStateQueryKind && !hasReflectiveActionCue) {
    return {
      taskKind: "chat",
      reason: "reflective state query requested without execution cue",
      inspectFirst: false,
      verifyAfterEdit: false,
      reflectiveStateQueryKind,
      usedRestoredState,
    };
  }

  if (
    lastTaskWasReadLike &&
    normalizedRepairInstruction.operation !== "continue" &&
    (hasAnswerRepairCue ||
      hasCorrectionCue ||
      normalizedRepairInstruction.operation === "switch" ||
      normalizedRepairInstruction.operation === "repair" ||
      normalizedRepairInstruction.operation === "clarify" ||
      isAmbiguousRepairFollowUp)
  ) {
    if (!primaryTarget?.inWorkspace) {
      return {
        taskKind: "read-file",
        reason: "answer-repair follow-up lacks active grounded target",
        inspectFirst: true,
        verifyAfterEdit: false,
        blockedReason:
          "Follow-up asks to repair previous grounded answer, but active target could not be inherited. Provide explicit file path.",
        targetMissing: true,
        usedRestoredState,
      };
    }
    if (normalizedRepairInstruction.operation === "clarify") {
      return {
        taskKind: "read-file",
        reason: normalizedRepairInstruction.reason,
        inspectFirst: true,
        verifyAfterEdit: false,
        blockedReason:
          normalizedRepairInstruction.clarificationPrompt ??
          "Follow-up mixes multiple grounded corrections. Clarify whether you want read, summary, or explain.",
        targetMissing: false,
        usedRestoredState,
        repairInstruction: normalizedRepairInstruction,
      };
    }
    return buildReadOnlyPlan({
      reason: continuity.lastAnswerDefect
        ? `answer-repair follow-up on prior defect: ${continuity.lastAnswerDefect}`
        : "answer-repair follow-up on previous grounded response",
      targetPath: primaryTarget.cleaned,
      groundedDeliverableMode:
        normalizedRepairInstruction.targetMode ??
        effectiveGroundedDeliverableMode ??
        continuity.lastGroundedDeliverableMode ??
        "read",
      readWindow: readWindowDirective,
      readFragment: readFragmentDirective,
      includeReadFragment: true,
      usedRestoredState,
      repairInstruction: normalizedRepairInstruction,
      continuationLineage: readContinuationLineageOrUndefined,
    });
  }

  if (
    hasFileReadIntent &&
    !hasExplicitPathReference &&
    !primaryTarget &&
    readContinuityRecovery.blockedReason
  ) {
    return buildPathlessReadContinuationBlockedPlan({
      blockedReason: readContinuityRecovery.blockedReason,
      rawContinuityTargetPath,
      continuationLineage: readContinuationLineageOrUndefined,
    });
  }

  if (
    mutationScopePlanning.hasLocalMutationCue &&
    !mutationScopePlanning.hasMutationScopeEvidence &&
    !explicitPrimaryTarget &&
    !promptPathTarget &&
    continuity.lastGroundedDeliverableMode === "explain" &&
    !hasGroundedReadLikeIntent &&
    !hasVerifyIntent
  ) {
    return buildLocalMutationScopeBlockedPlan({
      usedRestoredState,
    });
  }

  if (
    hasExecutionCorrectionCue &&
    lastTaskWasMutationLike &&
    primaryTarget?.inWorkspace
  ) {
    return {
      taskKind: "edit-file",
      reason:
        "execution correction follow-up reused last active mutation target",
      targetPath: primaryTarget.cleaned,
      inspectFirst: true,
      verifyAfterEdit: hasVerifyIntent,
      ...(effectiveVerifyCommand
        ? { verifyCommand: effectiveVerifyCommand }
        : {}),
      continuationRepairReplan: true,
      ...(effectiveReplaceDirective
        ? {
            replaceFrom: effectiveReplaceDirective.from,
            replaceTo: effectiveReplaceDirective.to,
          }
        : {}),
      ...mutationScopePlanning.fields,
      ...mutationScopePlanning.requiredFields,
      usedRestoredState,
    };
  }

  if (hasContinuationCue && hasFileReadIntent && primaryTarget?.inWorkspace) {
    return buildReadOnlyPlan({
      reason: usedRestoredState
        ? "pathless read follow-up resolved from restored session state"
        : "read follow-up resolved from explicit target",
      targetPath: primaryTarget.cleaned,
      groundedDeliverableMode: effectiveGroundedDeliverableMode ?? "read",
      readWindow: readWindowDirective,
      usedRestoredState,
      repairInstruction: normalizedRepairInstruction,
      continuationLineage: readContinuationLineageOrUndefined,
    });
  }

  if (
    isAmbiguousRepairFollowUp &&
    !hasCrossFileUltraWeakFollowUp &&
    lastTaskWasReadLike &&
    primaryTarget?.inWorkspace &&
    !hasEditIntent &&
    !hasCreateIntent &&
    !hasVerifyIntent &&
    !hasDiagnosisIntent
  ) {
    return buildReadOnlyPlan({
      reason:
        "ambiguous short follow-up resolved to active read-like continuation target",
      targetPath: primaryTarget.cleaned,
      groundedDeliverableMode:
        effectiveGroundedDeliverableMode ??
        continuity.lastGroundedDeliverableMode ??
        "read",
      readWindow: readWindowDirective,
      readFragment: readFragmentDirective,
      includeReadFragment: true,
      usedRestoredState,
      repairInstruction: normalizedRepairInstruction,
    });
  }

  if (hasGroundedReadLikeIntent && hasExplicitPathReference && !primaryTarget) {
    return buildGroundedReadMissingTargetPlan({
      reason:
        "grounded read/summarize/explain requires a resolvable target path",
      stopReason:
        "Grounded read/summarize/explain request included a path reference, but no resolvable target was found. Provide a valid in-workspace file path.",
      doNext: "Provide a valid in-workspace file path.",
      usedRestoredState,
    });
  }

  if (
    hasGroundedReadLikeIntent &&
    primaryTarget &&
    !primaryTarget.inWorkspace
  ) {
    return buildGroundedReadOutOfWorkspacePlan({
      targetPath: primaryTarget.cleaned,
      usedRestoredState,
    });
  }

  if (
    hasDiagnosisIntent &&
    !hasExecutionIntent &&
    !hasEditIntent &&
    !hasCreateIntent &&
    (hasExplainIntent ||
      /\b(?:repository|repo|runtime|session|implementation|implemented)\b/i.test(
        groundedIntentPrompt,
      ) ||
      /\b(?:fail|fails|failing|error|errors|exception|boom|intermittently)\b/i.test(
        groundedIntentPrompt,
      ))
  ) {
    return {
      taskKind: "repo-explain",
      reason: "repo diagnosis intent",
      targetPath: primaryTarget?.inWorkspace ? primaryTarget.cleaned : undefined,
      inspectFirst: true,
      verifyAfterEdit: false,
      usedRestoredState,
    };
  }

  if ((hasSummarizeIntent || hasExplainIntent) && !primaryTarget?.inWorkspace) {
    return {
      taskKind: "read-file",
      reason: "grounded summarize/explain requires explicit readable target",
      inspectFirst: true,
      verifyAfterEdit: false,
      blockedReason:
        "Summarize/explain requests require an explicit readable target file. Provide the file path in this workspace.",
      targetMissing: true,
      usedRestoredState,
    };
  }

  if (
    hasFileReadIntent &&
    primaryTarget?.inWorkspace &&
    !hasEditIntent &&
    !hasCreateIntent &&
    !hasExecutionCorrectionCue
  ) {
    return buildReadOnlyPlan({
      reason:
        "explicit read intent takes precedence over inherited mutation context",
      targetPath: primaryTarget.cleaned,
      groundedDeliverableMode: effectiveGroundedDeliverableMode ?? "read",
      readWindow: readWindowDirective,
      contextPrompt: prompt,
      usedRestoredState,
      repairInstruction: normalizedRepairInstruction,
      continuationLineage: ignoredExplicitTargetLineageOrUndefined,
    });
  }

  if (hasPostEditReadOnlyVerifyCue && primaryTarget?.inWorkspace) {
    return buildReadOnlyPlan({
      reason:
        "post-edit verify/check follow-up resolved as read-only continuation",
      targetPath: primaryTarget.cleaned,
      groundedDeliverableMode: effectiveGroundedDeliverableMode ?? "read",
      usedRestoredState,
      repairInstruction: normalizedRepairInstruction,
      continuationLineage: mutationVerificationLineage,
    });
  }

  if (hasSeedReadOnlyCheckCue && primaryTarget?.inWorkspace) {
    return buildReadOnlyPlan({
      reason:
        "seed-driven read-only check follow-up reused action result target",
      targetPath: primaryTarget.cleaned,
      groundedDeliverableMode: effectiveGroundedDeliverableMode ?? "read",
      usedRestoredState,
      repairInstruction: normalizedRepairInstruction,
      continuationLineage: ["seedInfluence=target-carryover"],
    });
  }

  if (
    hasWeakDiagnosticHandoffCue &&
    primaryTarget?.inWorkspace &&
    !hasEditIntent &&
    !hasCorrectionCue &&
    !hasCreateIntent &&
    !hasExecutionIntent &&
    !hasVerifyIntent &&
    !effectiveReplaceDirectiveFromPrompt &&
    !extractFencedContent(prompt)
  ) {
    return buildReadOnlyPlan({
      reason: "diagnostic-driven weak follow-up reused handoff target",
      targetPath: primaryTarget.cleaned,
      groundedDeliverableMode: effectiveGroundedDeliverableMode ?? "read",
      usedRestoredState,
      repairInstruction: normalizedRepairInstruction,
      continuationLineage: diagnosticHandoffLineage,
    });
  }

  if (
    reflectiveStateQueryKind === "next-step" &&
    hasReflectiveActionCue &&
    lastTaskWasReadLike &&
    primaryTarget?.inWorkspace &&
    !hasEditIntent &&
    !hasCreateIntent &&
    !hasRepairContinuationCue &&
    !hasVerifyIntent &&
    !effectiveReplaceDirective
  ) {
    return buildReadOnlyPlan({
      reason: "reflective next-step handoff reused read continuity target",
      targetPath: primaryTarget.cleaned,
      groundedDeliverableMode: effectiveGroundedDeliverableMode ?? "read",
      readWindow: readWindowDirective,
      usedRestoredState,
      repairInstruction: normalizedRepairInstruction,
      continuationLineage: ignoredExplicitTargetLineageOrUndefined,
    });
  }

  if (hasContinuationExecutionIntent && primaryTarget?.inWorkspace) {
    if (shouldReturnCrossFileConvergedNoop) {
      return {
        taskKind: "edit-file",
        reason:
          "cross-file continuation already converged; no remaining related targets",
        targetPath: primaryTarget.cleaned,
        inspectFirst: false,
        verifyAfterEdit: false,
        crossFileRepair: true,
        additionalTargetPaths: [],
        crossFileConvergedNoop: true,
        usedRestoredState,
        previousRemainingTargets,
        previousFailedEntries,
        ...(continuationReopenDecision.enabled
          ? {
              degradedReopen: true,
              degradedReopenReason: continuationReopenDecision.reason,
              degradedReopenCandidates: continuationReopenDecision.candidates,
              degradedReopenCandidateSource:
                continuationReopenDecision.candidateSourceSummary,
              degradedReopenCandidatePruned:
                continuationReopenDecision.prunedCandidateSummary,
            }
          : {}),
      };
    }
    return {
      taskKind: hasCreateIntent ? "write-file" : "edit-file",
      reason: allowCrossFileUltraWeakAutoContinuation
        ? "cross-file ultra-weak follow-up auto-activated from single recoverable continuation target"
        : hasEditFailureRepairPayload && editFailureRepairContext
          ? `single-file edit failure follow-up reused ${editFailureRepairContext.failureReason} context`
          : usedRestoredState
            ? "continuation edit/write target resolved from restored session state"
            : hasCreateIntent
              ? "write intent with explicit target"
              : "edit/repair intent with explicit target",
      targetPath: primaryTarget.cleaned,
      inspectFirst: !hasCreateIntent,
      verifyAfterEdit: hasVerifyIntent,
      ...(effectiveVerifyCommand
        ? { verifyCommand: effectiveVerifyCommand }
        : {}),
      ...(hasWeakRepairFollowUp ? { continuationRepairReplan: true } : {}),
      ...(avoidPreviousDirection ? { avoidPreviousDirection: true } : {}),
      ...(failedTransforms.length > 0 ? { failedTransforms } : {}),
      ...(shouldCoordinateCrossFileRepair
        ? {
            crossFileRepair: true,
            additionalTargetPaths: crossFileCandidates,
          }
        : {}),
      ...(effectiveReplaceDirective
        ? {
            replaceFrom: effectiveReplaceDirective.from,
            replaceTo: effectiveReplaceDirective.to,
          }
        : {}),
      continuationLineage: [
        `continuation-intent:${continuationIntent.kind}`,
        ...(lineageActivationEvidence ?? []),
        ...(replaySafeLineage.verificationHint?.command &&
        hasVerifyLineageHint &&
        continuityTargetPath === primaryTarget.cleaned
          ? [`verify-command-hint:${replaySafeLineage.verificationHint.command}`]
          : []),
      ],
      ...(hasEditFailureRepairPayload &&
      editFailureRepairContext &&
      editFailureRepairPayloadKind
        ? {
            repairContextUsed: true,
            repairedFailureReason: editFailureRepairContext.failureReason,
            repairedTargetFile: primaryTarget.cleaned,
            repairPayloadKind: editFailureRepairPayloadKind,
          }
        : {}),
      ...(hasEditFailureRepairLikePayload && editFailureRepairContextAbandonment
        ? {
            repairContextAbandoned: true,
            repairContextAbandonedReason:
              editFailureRepairContextAbandonment.reason,
            repairContextAbandonedFailureReason:
              editFailureRepairContextAbandonment.failureReason,
            repairContextAbandonedTargetCount:
              editFailureRepairContextAbandonment.failedTargetCandidates.length,
          }
        : {}),
      ...(!hasCreateIntent ? mutationScopePlanning.fields : {}),
      ...(!hasCreateIntent ? mutationScopePlanning.requiredFields : {}),
      usedRestoredState,
      previousRemainingTargets,
      previousFailedEntries,
      ...(continuationReopenDecision.enabled
        ? {
            degradedReopen: true,
            degradedReopenReason: continuationReopenDecision.reason,
            degradedReopenCandidates: continuationReopenDecision.candidates,
            degradedReopenCandidateSource:
              continuationReopenDecision.candidateSourceSummary,
            degradedReopenCandidatePruned:
              continuationReopenDecision.prunedCandidateSummary,
          }
        : {}),
    };
  }

  if (
    hasDiagnosisIntent &&
    !hasExecutionIntent &&
    !hasGroundedReadLikeIntent &&
    !(
      lastTaskWasReadLike &&
      (effectiveGroundedDeliverableMode ||
        hasAnswerRepairCue ||
        isAmbiguousRepairFollowUp)
    )
  ) {
    return {
      taskKind: "repo-explain",
      reason: "repo diagnosis intent",
      targetPath: primaryTarget?.inWorkspace
        ? primaryTarget.cleaned
        : undefined,
      inspectFirst: true,
      verifyAfterEdit: false,
      usedRestoredState,
    };
  }

  if (editExpectationContract.reasonCode === "unsupported-discovery-edit") {
    return buildUnsupportedDiscoveryEditPlan({
      doNext: editExpectationContract.doNext,
      usedRestoredState,
    });
  }

  const commandIntentPlan = buildCommandIntentPlan({
    normalizedPrompt: normalized,
    hasExecutionIntent,
    unsupportedCommand,
    usedRestoredState,
  });
  if (commandIntentPlan) {
    return commandIntentPlan;
  }

  if (hasWriteTaskIntent || hasEditIntent) {
    if (!primaryTarget) {
      return buildMissingMutationTargetPlan({
        hasWriteTaskIntent,
        hasVerifyIntent,
        verifyCommand: effectiveVerifyCommand,
        replaceDirective: effectiveReplaceDirective,
        editDoNext: editExpectationContract.doNext,
        usedRestoredState,
      });
    }

    if (!primaryTarget.inWorkspace) {
      return buildOutOfWorkspaceMutationTargetPlan({
        hasWriteTaskIntent,
        hasVerifyIntent,
        verifyCommand: effectiveVerifyCommand,
        targetPath: primaryTarget.cleaned,
        usedRestoredState,
      });
    }

    if (
      hasEditIntent &&
      !effectiveReplaceDirective &&
      !extractFencedContent(prompt) &&
      !extractLowRiskRenameRefactor(prompt)
    ) {
      return buildUnclearEditTransformPlan({
        targetPath: primaryTarget.cleaned,
        usedRestoredState,
      });
    }

    return {
      taskKind: hasWriteTaskIntent ? "write-file" : "edit-file",
      reason: hasWriteTaskIntent
        ? "write intent with explicit target"
        : "edit intent with explicit target",
      targetPath: primaryTarget.cleaned,
      inspectFirst: !hasWriteTaskIntent,
      verifyAfterEdit: hasVerifyIntent,
      ...(effectiveVerifyCommand
        ? { verifyCommand: effectiveVerifyCommand }
        : {}),
      ...(effectiveReplaceDirective
        ? {
            replaceFrom: effectiveReplaceDirective.from,
            replaceTo: effectiveReplaceDirective.to,
          }
        : {}),
      ...(!hasCreateIntent ? mutationScopePlanning.fields : {}),
      ...(!hasCreateIntent ? mutationScopePlanning.requiredFields : {}),
      usedRestoredState,
      continuationLineage: ignoredExplicitTargetLineageOrUndefined,
    };
  }

  if (hasFileReadIntent && primaryTarget?.inWorkspace) {
    return buildReadOnlyPlan({
      reason: "read/inspect intent with explicit target",
      targetPath: primaryTarget.cleaned,
      groundedDeliverableMode: effectiveGroundedDeliverableMode ?? "read",
      readWindow: readWindowDirective,
      contextPrompt: prompt,
      usedRestoredState,
      repairInstruction: normalizedRepairInstruction,
      continuationLineage: ignoredExplicitTargetLineageOrUndefined,
    });
  }

  if (
    hasImplicitPathOnlyReadIntent &&
    primaryTarget?.inWorkspace &&
    !hasEditIntent &&
    !hasCreateIntent &&
    !hasExecutionIntent
  ) {
    return buildReadOnlyPlan({
      reason: "path-only prompt resolved as grounded read",
      targetPath: primaryTarget.cleaned,
      groundedDeliverableMode: "read",
      readWindow: { lineCount: readWindowDirective.lineCount },
      usedRestoredState,
    });
  }

  if ((hasSummarizeIntent || hasExplainIntent) && primaryTarget?.inWorkspace) {
    const effectiveRepairInstruction = hasLocalExplainCue
      ? { ...normalizedRepairInstruction, targetMode: "explain" as const }
      : normalizedRepairInstruction;
    return buildReadOnlyPlan({
      reason: "summarize/explain intent with explicit target",
      targetPath: primaryTarget.cleaned,
      groundedDeliverableMode:
        (hasLocalExplainCue ? "explain" : effectiveGroundedDeliverableMode) ??
        (hasExplainIntent ? "explain" : "summary"),
      readWindow: readWindowDirective,
      readFragment: readFragmentDirective,
      includeReadFragment: hasLocalExplainCue,
      contextPrompt: prompt,
      usedRestoredState,
      repairInstruction: effectiveRepairInstruction,
    });
  }

  if (hasFileReadIntent) {
    if (hasTargetedFileReadIntent && !hasRepositoryInspectIntent) {
      return buildGroundedReadMissingTargetPlan({
        reason: "targeted read intent requires explicit readable target",
        stopReason:
          "I can read the file, but I still need an explicit in-workspace file path.",
        doNext: "Provide an explicit in-workspace file path.",
        usedRestoredState,
      });
    }
    return buildInspectFilesPlan({
      reason: "read/inspect intent without explicit in-workspace target",
      usedRestoredState,
    });
  }

  return {
    taskKind: "chat",
    reason: "no deterministic inspect/edit/verify contract detected",
    inspectFirst: false,
    verifyAfterEdit: false,
    usedRestoredState,
  };
}

function normalizePathLike(value: string): string {
  return value
    .replace(/\\/g, "/")
    .replace(/^\.\/+/g, "")
    .trim();
}
