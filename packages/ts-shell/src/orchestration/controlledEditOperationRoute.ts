import { projectApplyPatchRuntimeMutationRoute } from "./mutationRoutingProjection.js";
import type { OrchestrationResult } from "./types.js";
import { classifyBoundedApplyPatchCandidate } from "../edit/patch/plan/candidate.js";
import type { MutationRoutingProjectionAuthority } from "./mutationRoutingProjection.js";
import type { RecoveryAuthorityStoreConfig } from "./patchRecovery/recoveryAuthorityStore.js";
import {
  projectEditOperation,
  type ProductEditOperationProjection,
} from "../edit/result/projection.js";

export type ControlledEditOperationKind =
  | "update-existing-file"
  | "create-file"
  | "delete-file-preview"
  | "move-or-rename-preview"
  | "multi-file-target-set"
  | "broad-refactor-preview"
  | "unsupported-operation";

export type ControlledEditOperationMode =
  | "selected-workspace-apply"
  | "preview-only";

export interface ControlledEditOperationRouteResult {
  readonly operationKind: ControlledEditOperationKind;
  readonly mode: ControlledEditOperationMode;
  readonly result: OrchestrationResult;
  readonly providerCallDuringApply: false;
  readonly mutationAuthority: "explicit-selected-workspace" | "not-granted";
  readonly applyState: "applied" | "not-run" | "blocked";
  readonly verificationState: "passed" | "not-run" | "blocked" | "failed";
  readonly changedFiles: readonly string[];
  readonly failedFiles: readonly string[];
  readonly plannedFiles: readonly string[];
  readonly previewOnly: boolean;
  readonly recoveryAvailable: boolean;
  readonly recoveryExecuted: false;
  readonly atomicRollbackAvailable: false;
  readonly reportedSuccess: boolean;
  readonly productEdit: ProductEditOperationProjection;
  readonly evidence: readonly string[];
}

export async function runControlledEditOperationRoute(input: {
  readonly sessionId: string;
  readonly prompt: string;
  readonly workspaceRoot: string;
  readonly rawPatchText: string;
  readonly getWorkspaceAuthority: () => MutationRoutingProjectionAuthority;
  readonly readNoWriteRuntimeFile: (absolutePath: string) => string | undefined;
  readonly allowSelectedWorkspaceApply: boolean;
  readonly recoveryAuthority?: RecoveryAuthorityStoreConfig;
}): Promise<ControlledEditOperationRouteResult> {
  const operationKind = classifyOperation({
    workspaceRoot: input.workspaceRoot,
    rawPatchText: input.rawPatchText,
  });
  const destructivePreview =
    operationKind === "delete-file-preview" ||
    operationKind === "move-or-rename-preview" ||
    operationKind === "broad-refactor-preview";
  const allowApply = input.allowSelectedWorkspaceApply && !destructivePreview;
  const result = await projectApplyPatchRuntimeMutationRoute({
    sessionId: input.sessionId,
    prompt: input.prompt,
    workspaceRoot: input.workspaceRoot,
    routeOptions: {
      explicitRuntimeOptIn: true,
      rawPatchText: input.rawPatchText,
      ...(allowApply ? { requestedUserDecision: "approved" as const } : {}),
      ...(allowApply
        ? {
            workspaceWrite: {
              explicitWorkspaceWriteOptIn: true,
            },
          }
        : {}),
      ...(input.recoveryAuthority ? { recoveryAuthority: input.recoveryAuthority } : {}),
    },
    getWorkspaceAuthority: input.getWorkspaceAuthority,
    readNoWriteRuntimeFile: input.readNoWriteRuntimeFile,
  });
  if (!result) {
    throw new Error("controlled edit operation route expected a mutation routing result");
  }

  const perFilePlan = result.codingResult?.perFilePatchPlan;
  const changedFiles = result.codingResult?.changedFiles ?? [];
  const failedFiles = result.codingResult?.failedFiles.map((entry) => entry.path) ?? [];
  const plannedFiles = perFilePlan?.plannedFiles ?? [];
  const verificationStatus = result.codingResult?.verification.status;
  const reportedSuccess =
    result.status === "completed" &&
    result.terminalClassification === "success" &&
    perFilePlan?.successLike === true &&
    perFilePlan.postWriteVerification === "passed";
  const productEdit = projectEditOperation({
    operationKind,
    mode: allowApply ? "selected-workspace-apply" : "preview-only",
    authority: allowApply ? "explicit-selected-workspace" : "not-granted",
    applyStatus: changedFiles.length > 0
      ? "applied"
      : result.status === "stopped_error"
        ? "blocked"
        : "not-run",
    verificationState: verificationStatus === "passed"
      ? "passed"
      : verificationStatus === "failed"
        ? "failed"
        : result.status === "stopped_error" && changedFiles.length > 0
          ? "blocked"
          : "not-run",
    changedFiles,
    failedFiles,
    plannedFiles,
    recoveryAvailable: result.codingResult?.recoverySurface?.recoveryAvailable === true,
    recoveryExecuted: false,
    atomicRollbackAvailable: false,
    providerCallDuringApply: false,
    reportedSuccess,
  });
  return {
    operationKind,
    mode: allowApply ? "selected-workspace-apply" : "preview-only",
    result,
    providerCallDuringApply: false,
    mutationAuthority: allowApply ? "explicit-selected-workspace" : "not-granted",
    applyState: changedFiles.length > 0
      ? "applied"
      : result.status === "stopped_error"
        ? "blocked"
        : "not-run",
    verificationState: verificationStatus === "passed"
      ? "passed"
      : verificationStatus === "failed"
        ? "failed"
        : result.status === "stopped_error" && changedFiles.length > 0
          ? "blocked"
          : "not-run",
    changedFiles,
    failedFiles,
    plannedFiles,
    previewOnly: !allowApply,
    recoveryAvailable: result.codingResult?.recoverySurface?.recoveryAvailable === true,
    recoveryExecuted: false,
    atomicRollbackAvailable: false,
    reportedSuccess,
    productEdit,
    evidence: [
      `controlled-edit-operation-route:operation:${operationKind}`,
      `controlled-edit-operation-route:mode:${allowApply ? "selected-workspace-apply" : "preview-only"}`,
      "controlled-edit-operation-route:provider-call-during-apply:false",
      ...(destructivePreview
        ? ["controlled-edit-operation-route:destructive-operation-preview-only"]
        : []),
      ...(reportedSuccess
        ? ["controlled-edit-operation-route:success-after-post-write-verification"]
        : ["controlled-edit-operation-route:no-success-without-post-write-verification"]),
      ...(result.codingResult?.evidence ?? []).filter((entry) =>
        entry.startsWith("apply-patch-") ||
        entry.startsWith("workspace-write-failure-state:"),
      ),
    ],
  };
}

function classifyOperation(input: {
  readonly workspaceRoot: string;
  readonly rawPatchText: string;
}): ControlledEditOperationKind {
  const candidate = classifyBoundedApplyPatchCandidate(input);
  if (candidate.status !== "candidate") {
    return candidate.rejectionReason === "unsupportedBroadShape"
      ? "broad-refactor-preview"
      : "unsupported-operation";
  }
  if (candidate.operationFamily === "update-only") return "multi-file-target-set";
  if (candidate.operationFamily === "mixed") return "multi-file-target-set";
  if (candidate.operationFamily === "delete-only") return "delete-file-preview";
  if (candidate.operationFamily === "move-only") return "move-or-rename-preview";
  const kind = candidate.normalizedOperations[0]?.kind;
  if (kind === "create") return "create-file";
  if (kind === "delete") return "delete-file-preview";
  if (kind === "move") return "move-or-rename-preview";
  if (kind === "update") return "update-existing-file";
  return "unsupported-operation";
}
