import type {
  FutureEditContract,
  FutureEditContractInput,
  FutureEditMode,
  FutureEditPrecondition,
} from "./futureEditContract.js";

export type EditPatchOperationKind =
  | "write"
  | "replace"
  | "transform"
  | "discover"
  | "unknown";

export type EditPatchRequirementState =
  | "required"
  | "not-required"
  | "delegated-to-current-route";

export interface EditPatchPlannedOperation {
  readonly targetPath?: string;
  readonly operationKind: EditPatchOperationKind;
  readonly supportStatus: FutureEditContract["supportStatus"];
  readonly writeIntent: "current-route-only" | "none";
  readonly summary: string;
}

export interface EditPatchMutationManifest {
  readonly source: "edit-patch-module";
  readonly requestedMode: FutureEditMode;
  readonly supportStatus: FutureEditContract["supportStatus"];
  readonly reasonCode: FutureEditContract["reasonCode"];
  readonly explicitTargets: readonly string[];
  readonly candidateTargets: readonly string[];
  readonly operations: readonly EditPatchPlannedOperation[];
  readonly contentSummary: "concrete" | "exact-mapping" | "missing" | "future-transform";
  readonly staleReadRequirement: EditPatchRequirementState;
  readonly workspaceAuthorityRequirement: EditPatchRequirementState;
  readonly verificationRequirement: EditPatchRequirementState;
  readonly rollbackSnapshotRequirement: EditPatchRequirementState;
  readonly confirmationRequirement: EditPatchRequirementState;
  readonly redaction: "raw-content-excluded";
  readonly authorization: "not-authorization";
  readonly mutationAllowedNow: boolean;
  readonly requiredPreconditions: readonly FutureEditPrecondition[];
  readonly doNext: string;
}

export function buildEditPatchMutationManifest(input: {
  readonly contract: FutureEditContract;
  readonly request?: FutureEditContractInput;
  readonly candidateTargets?: readonly string[];
}): EditPatchMutationManifest {
  const explicitTargets = normalizeTargets([
    input.request?.targetPath,
    ...(input.request?.targetCount && input.request.targetCount > 1
      ? []
      : []),
  ]);
  const candidateTargets = normalizeTargets(input.candidateTargets ?? []);
  const currentSupported = input.contract.supportStatus === "current-supported";
  const operationKind = operationKindFor(input.contract.mode);
  const operationTargets =
    explicitTargets.length > 0
      ? explicitTargets
      : candidateTargets.length > 0
        ? candidateTargets
        : [undefined];

  return {
    source: "edit-patch-module",
    requestedMode: input.contract.mode,
    supportStatus: input.contract.supportStatus,
    reasonCode: input.contract.reasonCode,
    explicitTargets,
    candidateTargets,
    operations: operationTargets.map((targetPath) => ({
      ...(targetPath ? { targetPath } : {}),
      operationKind,
      supportStatus: input.contract.supportStatus,
      writeIntent: input.contract.mutationAllowedNow
        ? "current-route-only"
        : "none",
      summary: operationSummary(operationKind, targetPath),
    })),
    contentSummary: contentSummaryFor(input.contract, input.request),
    staleReadRequirement: requirementState(
      "final-stale-read",
      input.contract,
      currentSupported,
    ),
    workspaceAuthorityRequirement: requirementState(
      "workspace-authority-check",
      input.contract,
      currentSupported,
    ),
    verificationRequirement: requirementState(
      "post-write-verification-plan",
      input.contract,
      currentSupported,
    ),
    rollbackSnapshotRequirement: requirementState(
      "snapshot-or-rollback-story",
      input.contract,
      currentSupported,
    ),
    confirmationRequirement: input.contract.userConfirmationRequired
      ? "required"
      : "not-required",
    redaction: "raw-content-excluded",
    authorization: "not-authorization",
    mutationAllowedNow: input.contract.mutationAllowedNow,
    requiredPreconditions: input.contract.requiredPreconditions,
    doNext: input.contract.doNext,
  };
}

function normalizeTargets(values: readonly (string | undefined)[]): readonly string[] {
  return values
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
}

function operationKindFor(mode: FutureEditMode): EditPatchOperationKind {
  switch (mode) {
    case "current-bounded-write":
      return "write";
    case "current-bounded-edit":
    case "future-fenced-replacement":
      return "replace";
    case "future-broad-refactor-planning":
      return "transform";
    case "future-multi-file-discovery-edit":
      return "discover";
    case "unsupported-vague-edit":
    case "unsupported-generated-content":
    case "unsupported-unsafe-or-ambiguous-mutation":
    case "not-edit":
      return "unknown";
  }
}

function operationSummary(
  operationKind: EditPatchOperationKind,
  targetPath: string | undefined,
): string {
  const target = targetPath ?? "(target pending)";
  switch (operationKind) {
    case "write":
      return `bounded write candidate for ${target}`;
    case "replace":
      return `bounded replacement candidate for ${target}`;
    case "transform":
      return "future broad refactor planning preview";
    case "discover":
      return "future discovery edit candidate selection preview";
    case "unknown":
      return `unsupported edit request for ${target}`;
  }
}

function contentSummaryFor(
  contract: FutureEditContract,
  request: FutureEditContractInput | undefined,
): EditPatchMutationManifest["contentSummary"] {
  if (contract.mode === "future-broad-refactor-planning") {
    return "future-transform";
  }
  if (request?.hasExactOldNewMapping || request?.hasReplaceDirective) {
    return "exact-mapping";
  }
  if (request?.hasConcreteContent) {
    return "concrete";
  }
  return "missing";
}

function requirementState(
  precondition: FutureEditPrecondition,
  contract: FutureEditContract,
  currentSupported: boolean,
): EditPatchRequirementState {
  if (!contract.requiredPreconditions.includes(precondition)) {
    return "not-required";
  }
  return currentSupported ? "delegated-to-current-route" : "required";
}
