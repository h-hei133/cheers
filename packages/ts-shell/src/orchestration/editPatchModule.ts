import {
  classifyEditExpectationContract,
  type EditExpectationContract,
} from "./editExpectationContract.js";
import {
  classifyFutureEditContract,
  type FutureEditContract,
  type FutureEditContractInput,
} from "./futureEditContract.js";
import {
  buildEditPatchMutationManifest,
  type EditPatchMutationManifest,
} from "./editPatchManifest.js";
import {
  buildEditPatchPreview,
  type EditPatchPreviewEvidence,
} from "./editPatchPreview.js";
import {
  evaluateEditPatchPreconditions,
  type EditPatchPreconditionFactInput,
  type EditPatchPreconditionProjection,
} from "./editPatchPreconditions.js";
import {
  projectEditPatchResult,
  type EditPatchResultProjection,
} from "../edit/result/patch/projection.js";
export {
  parseExactFencedReplacementMapping,
  planExactFencedReplacement,
  type ExactFencedReplacementPlan,
  type FencedEditMapping,
  type FencedEditMappingResult,
} from "./fencedEditPlanner.js";
export {
  runFencedEditReplacementRoute,
  buildStoppedFencedEditReplacementRoute,
  type FencedEditReplacementRoute,
  type FencedEditReplacementRouteOptions,
} from "./fencedEditRoute.js";
export { buildFencedEditReplacementRouteResult } from "./fencedEditResult.js";
export {
  buildEditSnapshotStoreConfig,
  projectEditSnapshotReceipt,
  type EditSnapshotReceipt,
} from "./editSnapshot.js";
export {
  projectEditRecoveryResult,
  buildEditRecoveryApplyRouteResult,
  type EditRecoveryResult,
} from "./editRecoveryResult.js";
export {
  applyExplicitSingleFileRollback,
  projectSingleFileRollbackPlan,
  type EditRollbackPlan,
} from "./editRollback.js";
export {
  buildEditRecoveryPlan,
  type EditRecoveryPlan,
  type EditRecoveryPlanTarget,
} from "./editRecoveryPlan.js";
export {
  runEditRecoveryApplyRoute,
  type EditRecoveryApplyRoute,
  type EditRecoveryApplyFileResult,
} from "./editRecoveryApply.js";
export {
  buildEditRecoveryOutcome,
  type EditRecoveryOutcome,
} from "./editRecoveryOutcome.js";
export {
  buildTargetSetPartialRecoveryPlan,
} from "./targetSetEditRecovery.js";
export {
  selectFencedEditReplacementActivation,
  type FencedEditActivation,
} from "./fencedEditActivation.js";
export {
  buildDiscoveryEditManifest,
  type DiscoveryEditCandidate,
  type DiscoveryEditManifest,
} from "./discoveryEditManifest.js";
export {
  decideDiscoveryEditConfirmation,
  type DiscoveryEditConfirmationDecision,
  type DiscoveryEditConfirmationState,
} from "./discoveryEditConfirmation.js";
export {
  planDiscoveryEdit,
  type DiscoveryEditCandidateInput,
  type DiscoveryEditPlan,
} from "./discoveryEditPlanner.js";
export {
  buildDiscoveryEditRuntimeRequest,
  type DiscoveryEditRuntimeRequest,
} from "./discoveryEditRuntime.js";
export { buildDiscoveryEditPlanResult } from "./discoveryEditResult.js";
export {
  buildTargetSetEditPlan,
  type TargetSetEditPlan,
  type TargetSetEditPlanTarget,
} from "./targetSetEditPlan.js";
export {
  runTargetSetEditRoute,
  type TargetSetEditFileResult,
  type TargetSetEditRoute,
  type TargetSetEditRouteOptions,
} from "./targetSetEditRoute.js";
export { buildTargetSetEditRouteResult } from "./targetSetEditResult.js";
export {
  buildTargetSetEditTransaction,
  buildTargetSetEditTransactionId,
  type TargetSetEditTransaction,
} from "./targetSetEditTransaction.js";
export {
  buildTargetSetEditPreflightJournal,
  buildTargetSetEditExecutionJournalEntry,
  projectTargetSetEditJournalEvidence,
  type TargetSetEditJournalEntry,
} from "./targetSetEditJournal.js";
export {
  evaluateTargetSetEditPreflightPolicy,
  classifyTargetSetExecutionFailure,
  type TargetSetEditPreflightPolicy,
} from "./targetSetEditPolicy.js";
export {
  aggregateTargetSetEditVerification,
  type TargetSetEditVerificationAggregate,
} from "./targetSetEditVerification.js";
export {
  buildTargetSetEditRecoveryWorkflow,
  type TargetSetEditRecoveryWorkflow,
} from "./targetSetEditRecoveryWorkflow.js";
export {
  buildGeneratedEditProposalManifest,
  type GeneratedEditProposalManifest,
} from "./generatedEditProposal.js";
export {
  planGeneratedEdit,
  type GeneratedEditPlan,
} from "./generatedEditPlanner.js";
export {
  decideGeneratedEditConfirmation,
  runGeneratedEditHandoff,
  type GeneratedEditConfirmationDecision,
  type GeneratedEditHandoffResult,
} from "./generatedEditConfirmation.js";
export { buildGeneratedEditProposalResult } from "./generatedEditResult.js";
export {
  buildProviderEditContextPacket,
  redactProviderEditText,
  type ProviderEditContextPacket,
  type ProviderEditTargetContext,
} from "./providerEditContext.js";
export {
  buildProviderEditProposalManifest,
  normalizeProviderEditProposal,
  type ProviderEditProposalManifest,
  type ProviderEditRawProposal,
} from "./providerEditProposal.js";
export {
  planProviderEditProposal,
  providerReadinessFailureToEditAvailability,
  type ProviderEditAvailability,
  type ProviderEditFakeProvider,
  type ProviderEditPlan,
} from "./providerEditPlanner.js";
export {
  buildContextAwareProviderEditInput,
  type ContextAwareProviderEditInput,
} from "./contextAwareProviderEdit.js";
export {
  buildContextAwareProviderPrompt,
  type ContextAwareProviderPromptContext,
} from "../provider/request/prompt.js";
export {
  planContextAwareProviderProposal,
  type ContextAwareProviderFakeProvider,
  type ContextAwareProviderProposalPlan,
} from "./contextAwareProviderProposal.js";
export { buildContextAwareProviderProposalResult } from "./contextAwareProviderResult.js";
export {
  decideProviderEditConfirmation,
  type ProviderEditConfirmationDecision,
} from "./providerEditConfirmation.js";
export { buildProviderEditProposalResult } from "./providerEditResult.js";
export {
  buildGeneratedEditProposalReview,
  buildEditRepairProposalReview,
  buildProviderEditProposalReview,
  formatEditProposalReviewForPrint,
  type EditProposalReview,
  type EditProposalReviewHunk,
} from "./editProposalReview.js";
export {
  selectEditProposalHunks,
  type EditProposalSelection,
} from "./editProposalSelection.js";
export {
  applyEditProposalSelection,
  type EditProposalApplyResult,
} from "./editProposalApply.js";
export { buildEditProposalReviewResult } from "./editProposalReviewResult.js";
export {
  buildProposalHunkSetManifest,
  type ProposalHunkSetManifest,
  type ProposalHunkSetHunk,
} from "./proposalHunkSet.js";
export {
  buildProposalHunkSetPlan,
  type ProposalHunkSetPlan,
  type ProposalHunkSetPlanTarget,
} from "./proposalHunkSetPlan.js";
export {
  buildExactHunkSetModel,
  locateExactHunkRange,
  sortHunksForApply,
  type ExactHunkSetEntry,
  type ExactHunkSetFile,
  type ExactHunkSetModel,
  type ExactHunkRange,
} from "../edit/patch/plan/hunkSet.js";
export {
  detectExactHunkConflicts,
  type ExactHunkConflictResult,
} from "../edit/patch/apply/conflict.js";
export {
  buildMultiHunkApplyPatch,
  runExactHunkApplyRoute,
  type ExactHunkApplyRoute,
} from "./exactHunkApply.js";
export {
  projectExactHunkResultSummary,
  type ExactHunkResultSummary,
} from "../edit/patch/result/hunk.js";
export {
  runProposalHunkSetRoute,
  type ProposalHunkSetRoute,
  type ProposalHunkSetRouteOptions,
} from "./proposalHunkSetRoute.js";
export { buildProposalHunkSetRouteResult } from "./proposalHunkSetResult.js";
export {
  buildEditRepairContext,
  buildEditRepairContextFromCodingResult,
  type EditRepairContext,
  type EditRepairContextStatus,
  type EditRepairHunkSummary,
} from "./editRepairContext.js";
export {
  buildEditRepairProposalManifest,
  normalizeEditRepairProposal,
  type EditRepairProposalManifest,
  type EditRepairRawProposal,
} from "./editRepairProposal.js";
export {
  planEditRepairHunkSetHandoff,
  planEditRepairProposal,
  type EditRepairFakeProvider,
  type EditRepairPlan,
  type EditRepairPlannerStatus,
} from "./editRepairPlanner.js";
export {
  buildEditRepairResult,
  type EditRepairResultState,
} from "./editRepairResult.js";
export {
  buildVerificationRepairContext,
  buildVerificationRepairContextFromCodingResult,
  buildVerificationRepairContextFromEditContext,
  type VerificationRepairContext,
  type VerificationRepairContextStatus,
} from "./verificationRepairContext.js";
export {
  planVerificationRepairHunkSetHandoff,
  planVerificationRepairLoop,
  type VerificationRepairFakeProvider,
  type VerificationRepairPlan,
  type VerificationRepairPlannerStatus,
  type VerificationRepairPromptContext,
} from "./verificationRepairPlanner.js";
export {
  buildVerificationRepairResult,
  type VerificationRepairResultState,
} from "./verificationRepairResult.js";
export {
  runVerificationRepairLoop,
  type VerificationRepairLoopRun,
} from "./verificationRepairLoop.js";
export {
  buildVerificationCommandPlan,
  type VerificationCommandKind,
  type VerificationCommandPlan,
  type VerificationCommandPlanState,
  type VerificationCommandSource,
} from "../verification/command/plan.js";
export {
  classifyVerificationCommandFailure,
  type VerificationFailureClass,
  type VerificationFailureClassification,
} from "../verification/result/failure/classifier.js";
export {
  buildVerificationCommandResult,
  buildVerificationCommandSurfaceResult,
  type VerificationCommandOutcome,
  type VerificationCommandResult,
} from "../verification/command/result.js";
export {
  runVerificationCommand,
  type VerificationCommandRun,
} from "../verification/command/runner.js";
export {
  bridgeVerificationCommandToRepairLoop,
  type VerificationRepairBridgeResult,
  type VerificationRepairBridgeStatus,
} from "./verificationRepairBridge.js";

export interface EditPatchModuleState {
  readonly editExpectation: EditExpectationContract;
  readonly futureContract: FutureEditContract;
  readonly manifest: EditPatchMutationManifest;
  readonly preconditions: EditPatchPreconditionProjection;
  readonly preview: EditPatchPreviewEvidence;
  readonly result: EditPatchResultProjection;
}

export function classifyEditRequest(
  input: FutureEditContractInput,
): FutureEditContract {
  return classifyFutureEditContract(input);
}

export function buildMutationManifest(input: {
  readonly request: FutureEditContractInput;
  readonly contract?: FutureEditContract;
  readonly candidateTargets?: readonly string[];
}): EditPatchMutationManifest {
  const contract = input.contract ?? classifyEditRequest(input.request);
  return buildEditPatchMutationManifest({
    contract,
    request: input.request,
    candidateTargets: input.candidateTargets,
  });
}

export function buildPreview(input: {
  readonly manifest: EditPatchMutationManifest;
  readonly preconditions?: EditPatchPreconditionProjection;
}): EditPatchPreviewEvidence {
  return buildEditPatchPreview(input);
}

export function evaluatePreconditions(input: {
  readonly manifest: EditPatchMutationManifest;
  readonly facts?: EditPatchPreconditionFactInput;
}): EditPatchPreconditionProjection {
  return evaluateEditPatchPreconditions(input);
}

export function projectEditResult(input: {
  readonly manifest: EditPatchMutationManifest;
  readonly preconditions: EditPatchPreconditionProjection;
  readonly preview: EditPatchPreviewEvidence;
}): EditPatchResultProjection {
  return projectEditPatchResult(input);
}

export function describeUnsupportedFutureEdit(input: {
  readonly contract: FutureEditContract;
}): string {
  if (input.contract.supportStatus === "current-supported") {
    return "Current bounded edit/write remains delegated to the existing route.";
  }
  return input.contract.doNext;
}

export function buildEditPatchModuleState(input: {
  readonly request: FutureEditContractInput;
  readonly candidateTargets?: readonly string[];
  readonly facts?: EditPatchPreconditionFactInput;
}): EditPatchModuleState {
  const editExpectation = classifyEditExpectationContract(input.request);
  const futureContract = classifyEditRequest(input.request);
  const manifest = buildMutationManifest({
    request: input.request,
    contract: futureContract,
    candidateTargets: input.candidateTargets,
  });
  const preconditions = evaluatePreconditions({
    manifest,
    facts: input.facts,
  });
  const preview = buildPreview({ manifest, preconditions });
  const result = projectEditResult({ manifest, preconditions, preview });

  return {
    editExpectation,
    futureContract,
    manifest,
    preconditions,
    preview,
    result,
  };
}
