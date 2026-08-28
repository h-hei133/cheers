import type {
  PatchFailure,
} from "../../../orchestration/patchParsing/types.js";
import type {
  MixedOperationReadinessProjection,
} from "../status/mixedOperation.js";

export type PerFilePatchOperationKind =
  | "update"
  | "create"
  | "delete"
  | "move"
  | "broad"
  | "malformed"
  | "unknown";

export type PerFilePatchSupportStatus =
  | "supported-write"
  | "supported-planning-no-write"
  | "unsupported-no-write"
  | "invalid-model-output";

export type PerFilePatchFailureClass =
  | "none"
  | "parse-failure"
  | "broad-apply-patch"
  | "mixed-operations"
  | "too-many-update-files"
  | "duplicate-target"
  | "unsupported-operation"
  | "verification-failed"
  | "workspace-boundary"
  | "missing-target"
  | "stale-read"
  | "write-application"
  | "post-write-verification"
  | "partial-failure";

export type PerFilePatchVerificationExpectation =
  | "route-owned-write-preflight"
  | "planning-preflight-only"
  | "not-run-unsupported"
  | "not-run-invalid-model-output";

export interface PerFilePatchOperation {
  readonly operationKind: PerFilePatchOperationKind;
  readonly supportStatus: PerFilePatchSupportStatus;
  readonly targetPath?: string;
  readonly sourcePath?: string;
  readonly writeIntent: "eligible" | "none";
  readonly plannedFile?: string;
  readonly changedFile?: string;
  readonly failedFile?: PatchFailure;
  readonly verificationExpectation: PerFilePatchVerificationExpectation;
  readonly userVisibleReason: string;
}

export interface PerFilePatchPlanSummary {
  readonly supportStatus: PerFilePatchSupportStatus;
  readonly failureClass: PerFilePatchFailureClass;
  readonly targetFiles: readonly string[];
  readonly writeIntentFiles: readonly string[];
  readonly plannedFiles: readonly string[];
  readonly changedFiles: readonly [];
  readonly failedFiles: readonly PatchFailure[];
  readonly willWrite: false;
  readonly writerInvoked: false;
  readonly workspaceWriterInvoked: false;
  readonly postWriteVerification: "not-run";
  readonly writerInvocationCondition:
    | "existing-explicit-route-only"
    | "never";
  readonly mixedOperationReadiness?: MixedOperationReadinessProjection;
  readonly userVisibleReason: string;
  readonly nextAction: string;
}

export interface PerFilePatchPlan {
  readonly source: "per-file-patch-plan";
  readonly operations: readonly PerFilePatchOperation[];
  readonly summary: PerFilePatchPlanSummary;
  readonly evidence: readonly string[];
}

export interface PerFilePatchPlanOptions {
  readonly workspaceRoot: string;
  readonly rawPatchText: string;
  readonly readFile: (absolutePath: string) => string | undefined;
  readonly directoryExists?: (absolutePath: string) => boolean;
}
