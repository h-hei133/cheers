import {
  projectProductVerdictFromClaims,
  type ProductClaimInput,
  type ProductVerdict,
} from "../../evidence/verdictFacade.js";

// Reset compatibility facade. Final ownership should live with edit authority,
// apply, readback, and recovery modules.
export const PRODUCT_EDIT_FACADE_VERSION = "v1";

export type ProductEditOperationKind =
  | "update-existing-file"
  | "create-file"
  | "delete-file-preview"
  | "move-or-rename-preview"
  | "multi-file-target-set"
  | "broad-refactor-preview"
  | "unsupported-operation";

export type ProductEditMode = "selected-workspace-apply" | "preview-only";

export type ProductEditAuthorityStatus =
  | "explicit-selected-workspace"
  | "not-granted";

export type ProductEditApplyStatus = "applied" | "not-run" | "blocked";

export type ProductEditReadbackStatus =
  | "verified"
  | "not-run"
  | "blocked"
  | "failed";

export interface ProductEditOperationProjection {
  readonly facadeVersion: typeof PRODUCT_EDIT_FACADE_VERSION;
  readonly operationKind: ProductEditOperationKind;
  readonly mode: ProductEditMode;
  readonly authority: ProductEditAuthorityStatus;
  readonly applyStatus: ProductEditApplyStatus;
  readonly readbackStatus: ProductEditReadbackStatus;
  readonly changedFiles: readonly string[];
  readonly failedFiles: readonly string[];
  readonly plannedFiles: readonly string[];
  readonly recoveryAvailable: boolean;
  readonly recoveryExecuted: false;
  readonly atomicRollbackAvailable: false;
  readonly providerCallDuringApply: false;
  readonly notProvenClaims: readonly string[];
  readonly verdict: ProductVerdict;
  readonly applyIsVerificationSuccess: false;
  readonly oneFileSuccessCanHideAnotherFailure: false;
}

export function projectEditOperation(input: {
  readonly operationKind: ProductEditOperationKind;
  readonly mode: ProductEditMode;
  readonly authority: ProductEditAuthorityStatus;
  readonly applyStatus: ProductEditApplyStatus;
  readonly verificationState: "passed" | "not-run" | "blocked" | "failed";
  readonly changedFiles: readonly string[];
  readonly failedFiles: readonly string[];
  readonly plannedFiles: readonly string[];
  readonly recoveryAvailable: boolean;
  readonly recoveryExecuted: false;
  readonly atomicRollbackAvailable: false;
  readonly providerCallDuringApply: false;
  readonly reportedSuccess: boolean;
}): ProductEditOperationProjection {
  const readbackStatus = readbackStatusFromVerification(input.verificationState);
  const notProvenClaims = editNotProvenClaims({ ...input, readbackStatus });
  const claims: ProductClaimInput[] = [
    {
      group: "authority",
      status: input.authority === "explicit-selected-workspace" ? "proven" : "not-run",
      reason: "Selected workspace write authority is required for apply.",
      blocker: input.authority === "explicit-selected-workspace" ? undefined : "edit authority not granted",
    },
    {
      group: "mutation",
      status: mutationClaimStatus(input),
      reason: "Edit apply receipt must cover every target without failed files.",
      blocker: mutationBlocker(input),
    },
    {
      group: "verification",
      status: verificationClaimStatus(readbackStatus),
      reason: "Post-write readback or verification must pass before success.",
      blocker: readbackStatus === "verified" ? undefined : "post-write verification/readback not proven",
    },
  ];

  return {
    facadeVersion: PRODUCT_EDIT_FACADE_VERSION,
    operationKind: input.operationKind,
    mode: input.mode,
    authority: input.authority,
    applyStatus: input.applyStatus,
    readbackStatus,
    changedFiles: input.changedFiles,
    failedFiles: input.failedFiles,
    plannedFiles: input.plannedFiles,
    recoveryAvailable: input.recoveryAvailable,
    recoveryExecuted: input.recoveryExecuted,
    atomicRollbackAvailable: input.atomicRollbackAvailable,
    providerCallDuringApply: input.providerCallDuringApply,
    notProvenClaims,
    verdict: projectProductVerdictFromClaims({
      claims,
      provenance: { source: "product-runtime", adapter: "edit-facade" },
      redaction: "raw-content-excluded",
      cleanup: "clean",
      successClaim: input.reportedSuccess,
      successReason: "Edit applied and post-write verification passed.",
    }),
    applyIsVerificationSuccess: false,
    oneFileSuccessCanHideAnotherFailure: false,
  };
}

function readbackStatusFromVerification(
  verificationState: "passed" | "not-run" | "blocked" | "failed",
): ProductEditReadbackStatus {
  if (verificationState === "passed") return "verified";
  return verificationState;
}

function mutationClaimStatus(input: {
  readonly applyStatus: ProductEditApplyStatus;
  readonly failedFiles: readonly string[];
}): ProductClaimInput["status"] {
  if (input.failedFiles.length > 0) return "failed";
  if (input.applyStatus === "applied") return "proven";
  if (input.applyStatus === "blocked") return "blocked";
  return "not-run";
}

function mutationBlocker(input: {
  readonly applyStatus: ProductEditApplyStatus;
  readonly failedFiles: readonly string[];
}): string | undefined {
  if (input.failedFiles.length > 0) return "one or more target files failed to apply";
  if (input.applyStatus === "blocked") return "edit apply blocked";
  if (input.applyStatus === "not-run") return "edit apply not run";
  return undefined;
}

function verificationClaimStatus(
  readbackStatus: ProductEditReadbackStatus,
): ProductClaimInput["status"] {
  if (readbackStatus === "verified") return "proven";
  if (readbackStatus === "blocked") return "blocked";
  if (readbackStatus === "failed") return "failed";
  return "not-run";
}

function editNotProvenClaims(input: {
  readonly authority: ProductEditAuthorityStatus;
  readonly applyStatus: ProductEditApplyStatus;
  readonly readbackStatus: ProductEditReadbackStatus;
  readonly failedFiles: readonly string[];
}): readonly string[] {
  return [
    input.authority === "explicit-selected-workspace" ? undefined : "edit authority not granted",
    input.applyStatus === "applied" ? undefined : "edit apply not proven",
    input.readbackStatus === "verified" ? undefined : "post-write verification/readback not proven",
    input.failedFiles.length === 0 ? undefined : "partial file failure present",
  ].filter((entry): entry is string => Boolean(entry));
}
