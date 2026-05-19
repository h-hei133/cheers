import {
  classifyFutureEditContract,
  type FutureEditContract,
  type FutureEditContractInput,
  type FutureEditPrecondition,
} from "./futureEditContract.js";
import {
  buildEditPatchMutationManifest,
  type EditPatchMutationManifest,
} from "./editPatchManifest.js";
import {
  evaluateEditPatchPreconditions,
  type EditPatchPreconditionProjection,
} from "./editPatchPreconditions.js";

export interface FutureEditPlan {
  readonly mode: FutureEditContract["mode"];
  readonly supportStatus: FutureEditContract["supportStatus"];
  readonly requestedScope: "single-file" | "multi-file" | "workspace" | "unknown";
  readonly targetHints: readonly string[];
  readonly missingInformation: readonly FutureEditPrecondition[];
  readonly confirmationRequirement:
    | "not-required"
    | "required-before-target-selection"
    | "required-before-mutation";
  readonly verificationRequirement: "required-before-future-execution" | "current-route";
  readonly rollbackRequirement: "required-before-future-execution" | "not-required";
  readonly mutationAllowedNow: boolean;
  readonly moduleManifest: EditPatchMutationManifest;
  readonly modulePreconditions: EditPatchPreconditionProjection;
  readonly stoppedActionableProjection: FutureEditContract["stoppedResult"];
  readonly contract: FutureEditContract;
}

export function planFutureEditExpansion(
  input: FutureEditContractInput,
): FutureEditPlan {
  const contract = classifyFutureEditContract(input);
  const moduleManifest = buildEditPatchMutationManifest({
    contract,
    request: input,
  });
  const modulePreconditions = evaluateEditPatchPreconditions({
    manifest: moduleManifest,
  });
  const targetHints = normalizeTargetHints(input);
  const requestedScope = inferRequestedScope(input, targetHints, contract);
  const missingInformation = contract.mutationAllowedNow
    ? []
    : contract.requiredPreconditions;

  return {
    mode: contract.mode,
    supportStatus: contract.supportStatus,
    requestedScope,
    targetHints,
    missingInformation,
    confirmationRequirement: confirmationRequirement(contract),
    verificationRequirement: contract.mutationAllowedNow
      ? "current-route"
      : "required-before-future-execution",
    rollbackRequirement: contract.requiredPreconditions.includes(
      "snapshot-or-rollback-story",
    )
      ? "required-before-future-execution"
      : "not-required",
    mutationAllowedNow: contract.mutationAllowedNow,
    moduleManifest,
    modulePreconditions,
    stoppedActionableProjection: contract.stoppedResult,
    contract,
  };
}

function normalizeTargetHints(input: FutureEditContractInput): readonly string[] {
  return input.targetPath ? [input.targetPath.trim()].filter(Boolean) : [];
}

function inferRequestedScope(
  input: FutureEditContractInput,
  targetHints: readonly string[],
  contract: FutureEditContract,
): FutureEditPlan["requestedScope"] {
  if (contract.mode === "future-multi-file-discovery-edit") {
    return "workspace";
  }
  if (contract.mode === "future-broad-refactor-planning") {
    return "workspace";
  }
  if ((input.targetCount ?? targetHints.length) > 1) {
    return "multi-file";
  }
  if (targetHints.length === 1) {
    return "single-file";
  }
  return "unknown";
}

function confirmationRequirement(
  contract: FutureEditContract,
): FutureEditPlan["confirmationRequirement"] {
  if (!contract.userConfirmationRequired) {
    return "not-required";
  }
  if (contract.mode === "future-multi-file-discovery-edit") {
    return "required-before-target-selection";
  }
  return "required-before-mutation";
}
