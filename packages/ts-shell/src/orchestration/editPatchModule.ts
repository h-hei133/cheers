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
} from "./editPatchResult.js";
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
  type EditRecoveryResult,
} from "./editRecoveryResult.js";
export {
  applyExplicitSingleFileRollback,
  projectSingleFileRollbackPlan,
  type EditRollbackPlan,
} from "./editRollback.js";
export {
  selectFencedEditReplacementActivation,
  type FencedEditActivation,
} from "./fencedEditActivation.js";

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
