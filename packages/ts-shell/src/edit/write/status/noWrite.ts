import { buildSingleFileApplyPatchOptInDryRunRoute } from "../../patch/apply/optIn.js";
import {
  buildPerFilePatchPlan,
  type PerFilePatchPlan,
} from "../../patch/plan/perFile.js";
import {
  buildSingleFileApplyPatchPermissionUxRealRouteSeam,
  type SingleFileApplyPatchPermissionUxRealRouteStatus,
} from "../../../orchestration/patchResult/singleFileApplyPatchPermissionUxRealRouteSeam.js";
import type { SingleFileApplyPatchRequestedUserDecision } from "../../authority/approval/permission.js";

export type NoWriteRuntimeSource =
  | "synthetic"
  | "real-provider-smoke"
  | "production-adjacent";

export type NoWriteRuntimeRouteStatus =
  | "rejected"
  | "permission-pending"
  | "blocked"
  | "denied";

export interface NoWriteRuntimeRouteInput {
  readonly workspaceRoot: string;
  readonly rawPatchText: string;
  readonly readFile: (absolutePath: string) => string | undefined;
  readonly explicitRuntimeOptIn?: boolean;
  readonly requestedUserDecision?: SingleFileApplyPatchRequestedUserDecision;
  readonly runtimeSource: NoWriteRuntimeSource;
}

export interface NoWriteRuntimeRoute {
  readonly source: "single-file-apply-patch-no-write-runtime-route";
  readonly runtimeSource: NoWriteRuntimeSource;
  readonly status: NoWriteRuntimeRouteStatus;
  readonly routeStatus: "rejected" | "dry-run-ready" | "blocked" | "permission-pending";
  readonly displayStatus: NoWriteRuntimeRouteStatus;
  readonly permissionStatus?: SingleFileApplyPatchPermissionUxRealRouteStatus;
  readonly explicitRuntimeOptIn: boolean;
  readonly consumesSafeRouteProjection: true;
  readonly targetPath?: string;
  readonly previewSummary?: readonly string[];
  readonly perFilePatchPlan?: PerFilePatchPlan;
  readonly terminalClassification: "stopped";
  readonly willWrite: false;
  readonly changedFiles: readonly [];
  readonly writeIntents: readonly [];
  readonly noWriterInvoked: true;
  readonly noAppliedPatchRecord: true;
  readonly doesNotClaimMutationSuccess: true;
  readonly doesNotClaimWriteSuccess: true;
  readonly doesNotChangeDefaultProductionRejection: true;
  readonly approvalDoesNotAuthorizeWrite: true;
  readonly rawProviderMetadataAccepted: false;
  readonly rawApprovalMetadataAccepted: false;
  readonly rawBaseContentAccepted: false;
  readonly rawWriterBoundaryAccepted: false;
  readonly displayLines: readonly string[];
  readonly nextAction: string;
  readonly doNext: string;
  readonly safetyProof: {
    readonly noWriteAuthorization: true;
    readonly noApprovalAsWriteAuthorization: true;
    readonly noChangedFiles: true;
    readonly noWriteIntents: true;
    readonly noWriterInvocation: true;
    readonly noAppliedPatch: true;
    readonly noSuccessClaim: true;
    readonly defaultProductionRejectionUnchanged: true;
    readonly safeProjectionOnly: true;
  };
  readonly evidence: readonly string[];
}

export function buildNoWriteRuntimeRoute(
  input: NoWriteRuntimeRouteInput,
): NoWriteRuntimeRoute {
  const route = buildSingleFileApplyPatchOptInDryRunRoute({
    workspaceRoot: input.workspaceRoot,
    rawPatchText: input.rawPatchText,
    readFile: input.readFile,
    dryRun: true,
    explicitOptIn: input.explicitRuntimeOptIn === true,
    ...(input.requestedUserDecision
      ? { requestedUserDecision: input.requestedUserDecision }
      : {}),
  });

  if (route.status === "rejected") {
    const nextAction =
      "Keep default production apply_patch and unified diff inputs rejected unless an explicit no-write runtime opt-in is present.";
    return baseRoute({
      runtimeSource: input.runtimeSource,
      status: "rejected",
      routeStatus: "rejected",
      displayStatus: "rejected",
      explicitRuntimeOptIn: false,
      displayLines: [
        "Runtime apply_patch route rejected before preview; no file was modified.",
        "Changed: none",
        `Next: ${nextAction}`,
      ],
      nextAction,
      evidence: [
        "apply-patch-no-write-runtime-route:explicit-opt-in-missing",
        "apply-patch-no-write-runtime-route:default-production-rejection-unchanged",
      ],
    });
  }

  const perFilePatchPlan = buildPerFilePatchPlan({
    workspaceRoot: input.workspaceRoot,
    rawPatchText: input.rawPatchText,
    readFile: input.readFile,
  });
  const permissionSeam = buildSingleFileApplyPatchPermissionUxRealRouteSeam({
    routeResult: route,
    ...(input.requestedUserDecision
      ? { requestedUserDecision: input.requestedUserDecision }
      : {}),
  });
  const status = displayStatusFromPermission(permissionSeam.permissionStatus);

  return baseRoute({
    runtimeSource: input.runtimeSource,
    status,
    routeStatus: route.status,
    displayStatus: status,
    permissionStatus: permissionSeam.permissionStatus,
    explicitRuntimeOptIn: true,
    targetPath: permissionSeam.targetPath,
    previewSummary: permissionSeam.previewSummary,
    perFilePatchPlan,
    displayLines: permissionSeam.displayLines,
    nextAction: permissionSeam.nextAction,
    evidence: [
      "apply-patch-no-write-runtime-route:explicit-runtime-opt-in",
      `apply-patch-no-write-runtime-route:route:${route.status}`,
      `apply-patch-no-write-runtime-route:permission:${permissionSeam.permissionStatus}`,
      "apply-patch-no-write-runtime-route:safe-permission-projection",
    ],
  });
}

function baseRoute(input: {
  readonly runtimeSource: NoWriteRuntimeSource;
  readonly status: NoWriteRuntimeRouteStatus;
  readonly routeStatus: NoWriteRuntimeRoute["routeStatus"];
  readonly displayStatus: NoWriteRuntimeRouteStatus;
  readonly permissionStatus?: SingleFileApplyPatchPermissionUxRealRouteStatus;
  readonly explicitRuntimeOptIn: boolean;
  readonly targetPath?: string;
  readonly previewSummary?: readonly string[];
  readonly perFilePatchPlan?: PerFilePatchPlan;
  readonly displayLines: readonly string[];
  readonly nextAction: string;
  readonly evidence: readonly string[];
}): NoWriteRuntimeRoute {
  return {
    source: "single-file-apply-patch-no-write-runtime-route",
    runtimeSource: input.runtimeSource,
    status: input.status,
    routeStatus: input.routeStatus,
    displayStatus: input.displayStatus,
    ...(input.permissionStatus ? { permissionStatus: input.permissionStatus } : {}),
    explicitRuntimeOptIn: input.explicitRuntimeOptIn,
    consumesSafeRouteProjection: true,
    ...(input.targetPath ? { targetPath: input.targetPath } : {}),
    ...(input.previewSummary ? { previewSummary: input.previewSummary } : {}),
    ...(input.perFilePatchPlan ? { perFilePatchPlan: input.perFilePatchPlan } : {}),
    terminalClassification: "stopped",
    willWrite: false,
    changedFiles: [],
    writeIntents: [],
    noWriterInvoked: true,
    noAppliedPatchRecord: true,
    doesNotClaimMutationSuccess: true,
    doesNotClaimWriteSuccess: true,
    doesNotChangeDefaultProductionRejection: true,
    approvalDoesNotAuthorizeWrite: true,
    rawProviderMetadataAccepted: false,
    rawApprovalMetadataAccepted: false,
    rawBaseContentAccepted: false,
    rawWriterBoundaryAccepted: false,
    displayLines: input.displayLines,
    nextAction: input.nextAction,
    doNext: input.nextAction,
    safetyProof: {
      noWriteAuthorization: true,
      noApprovalAsWriteAuthorization: true,
      noChangedFiles: true,
      noWriteIntents: true,
      noWriterInvocation: true,
      noAppliedPatch: true,
      noSuccessClaim: true,
      defaultProductionRejectionUnchanged: true,
      safeProjectionOnly: true,
    },
    evidence: [
      ...input.evidence,
      "apply-patch-no-write-runtime-route:will-write-false",
      "apply-patch-no-write-runtime-route:changed-files-empty",
      "apply-patch-no-write-runtime-route:write-intents-empty",
      "apply-patch-no-write-runtime-route:no-writer-invoked",
      "apply-patch-no-write-runtime-route:no-applied-patch-record",
      "apply-patch-no-write-runtime-route:no-success-claim",
      "apply-patch-no-write-runtime-route:raw-provider-metadata-rejected",
      "apply-patch-no-write-runtime-route:raw-approval-metadata-rejected",
      "apply-patch-no-write-runtime-route:raw-base-content-rejected",
      "apply-patch-no-write-runtime-route:raw-writer-boundary-rejected",
    ],
  };
}

function displayStatusFromPermission(
  status: SingleFileApplyPatchPermissionUxRealRouteStatus,
): NoWriteRuntimeRouteStatus {
  switch (status) {
    case "pending":
      return "permission-pending";
    case "denied":
      return "denied";
    case "blocked":
      return "blocked";
  }
}
