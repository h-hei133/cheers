import type {
  SingleFileApplyPatchOptInDryRunRouteAccepted,
  SingleFileApplyPatchOptInDryRunRouteResult,
} from "../../edit/patch/apply/optIn.js";
import type { SingleFileApplyPatchRequestedUserDecision } from "../../edit/authority/approval/permission.js";

export type SingleFileApplyPatchPermissionUxRealRouteStatus =
  | "pending"
  | "denied"
  | "blocked";

export type SingleFileApplyPatchPermissionUxRealRouteBlocker =
  | "route-not-ready"
  | "base-evidence-missing"
  | "stale-read-precondition-missing"
  | "permission-ux-blocked";

export interface SingleFileApplyPatchPermissionUxRealRouteSeamOptions {
  readonly routeResult: SingleFileApplyPatchOptInDryRunRouteResult;
  readonly requestedUserDecision?: SingleFileApplyPatchRequestedUserDecision;
}

export interface SingleFileApplyPatchPermissionUxRealRouteSeam {
  readonly source: "single-file-apply-patch-permission-ux-real-route-seam";
  readonly providerFacing: true;
  readonly runtimeFacing: true;
  readonly consumesSafeRouteProjection: true;
  readonly permissionStatus: SingleFileApplyPatchPermissionUxRealRouteStatus;
  readonly requestedUserDecision?: SingleFileApplyPatchRequestedUserDecision;
  readonly blocker?: SingleFileApplyPatchPermissionUxRealRouteBlocker;
  readonly targetPath?: string;
  readonly previewSummary?: readonly string[];
  readonly baseEvidenceDigestBound: boolean;
  readonly staleReadPreconditionBound: boolean;
  readonly approvalReady: false;
  readonly approvalTokenPrepared: boolean;
  readonly approvalDoesNotAuthorizeWrite: true;
  readonly willWrite: false;
  readonly changedFiles: readonly [];
  readonly writeIntents: readonly [];
  readonly noWriterInvoked: true;
  readonly noAppliedPatchRecord: true;
  readonly doesNotClaimMutationSuccess: true;
  readonly doesNotClaimWriteSuccess: true;
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
    readonly noRawProviderMetadata: true;
    readonly noRawApprovalMetadata: true;
    readonly noRawBaseContent: true;
    readonly noRawWriterBoundary: true;
  };
  readonly evidence: readonly string[];
}

export function buildSingleFileApplyPatchPermissionUxRealRouteSeam(
  options: SingleFileApplyPatchPermissionUxRealRouteSeamOptions,
): SingleFileApplyPatchPermissionUxRealRouteSeam {
  if (options.routeResult.status === "rejected") {
    return blocked({
      blocker: "route-not-ready",
      requestedUserDecision: options.requestedUserDecision,
      nextAction:
        "Keep default production apply_patch rejected; request permission only after an explicit opt-in dry-run route produces a safe preview.",
      evidence: [
        "single-file-apply-patch-permission-ux-real-route-seam:route-rejected",
      ],
    });
  }

  const route = options.routeResult;
  const permissionUx = route.permissionUx;
  const blocker = routeBlocker(route);
  if (blocker) {
    return blocked({
      blocker,
      route,
      requestedUserDecision:
        options.requestedUserDecision ?? permissionUx.requestedUserDecision,
      nextAction: permissionUx.nextAction,
      evidence: [
        `single-file-apply-patch-permission-ux-real-route-seam:blocker:${blocker}`,
      ],
    });
  }

  const requestedUserDecision =
    options.requestedUserDecision ?? permissionUx.requestedUserDecision;
  const permissionStatus =
    requestedUserDecision === "denied" ||
    permissionUx.permissionDecision === "denied"
      ? "denied"
      : "pending";
  const nextAction =
    permissionStatus === "denied"
      ? "Do not write. Surface the denial and allow a fresh dry-run preview if the user changes their mind."
      : permissionUx.nextAction;

  return baseSeam({
    route,
    permissionStatus,
    requestedUserDecision,
    nextAction,
    evidence: [
      "single-file-apply-patch-permission-ux-real-route-seam:safe-route-projection",
      `single-file-apply-patch-permission-ux-real-route-seam:permission:${permissionStatus}`,
    ],
  });
}

function routeBlocker(
  route: SingleFileApplyPatchOptInDryRunRouteAccepted,
): SingleFileApplyPatchPermissionUxRealRouteBlocker | undefined {
  if (!route.permissionUx.baseEvidenceDigestBound) {
    return "base-evidence-missing";
  }
  if (!route.permissionUx.staleReadPreconditionRequired) {
    return "stale-read-precondition-missing";
  }
  if (route.permissionUx.permissionDecision === "denied") {
    return undefined;
  }
  if (route.permissionUx.permissionDecision === "blocked") {
    return "permission-ux-blocked";
  }
  if (route.status === "blocked") {
    return "permission-ux-blocked";
  }
  return undefined;
}

function blocked(input: {
  readonly blocker: SingleFileApplyPatchPermissionUxRealRouteBlocker;
  readonly route?: SingleFileApplyPatchOptInDryRunRouteAccepted;
  readonly requestedUserDecision?: SingleFileApplyPatchRequestedUserDecision;
  readonly nextAction: string;
  readonly evidence: readonly string[];
}): SingleFileApplyPatchPermissionUxRealRouteSeam {
  return baseSeam({
    route: input.route,
    permissionStatus: "blocked",
    requestedUserDecision: input.requestedUserDecision,
    blocker: input.blocker,
    nextAction: input.nextAction,
    evidence: input.evidence,
  });
}

function baseSeam(input: {
  readonly route?: SingleFileApplyPatchOptInDryRunRouteAccepted;
  readonly permissionStatus: SingleFileApplyPatchPermissionUxRealRouteStatus;
  readonly requestedUserDecision?: SingleFileApplyPatchRequestedUserDecision;
  readonly blocker?: SingleFileApplyPatchPermissionUxRealRouteBlocker;
  readonly nextAction: string;
  readonly evidence: readonly string[];
}): SingleFileApplyPatchPermissionUxRealRouteSeam {
  const permissionUx = input.route?.permissionUx;
  const targetPath = permissionUx?.baseEvidence?.targetPath ?? undefined;
  const previewSummary = previewSummaryFromRoute(input.route);
  const baseEvidenceDigestBound = permissionUx?.baseEvidenceDigestBound ?? false;
  const staleReadPreconditionBound =
    permissionUx?.staleReadPreconditionRequired ?? false;
  const approvalTokenPrepared =
    input.permissionStatus === "pending" &&
    permissionUx?.approvalTokenPrepared === true;

  return {
    source: "single-file-apply-patch-permission-ux-real-route-seam",
    providerFacing: true,
    runtimeFacing: true,
    consumesSafeRouteProjection: true,
    permissionStatus: input.permissionStatus,
    ...(input.requestedUserDecision
      ? { requestedUserDecision: input.requestedUserDecision }
      : {}),
    ...(input.blocker ? { blocker: input.blocker } : {}),
    ...(targetPath ? { targetPath } : {}),
    ...(previewSummary ? { previewSummary } : {}),
    baseEvidenceDigestBound,
    staleReadPreconditionBound,
    approvalReady: false,
    approvalTokenPrepared,
    approvalDoesNotAuthorizeWrite: true,
    willWrite: false,
    changedFiles: [],
    writeIntents: [],
    noWriterInvoked: true,
    noAppliedPatchRecord: true,
    doesNotClaimMutationSuccess: true,
    doesNotClaimWriteSuccess: true,
    rawProviderMetadataAccepted: false,
    rawApprovalMetadataAccepted: false,
    rawBaseContentAccepted: false,
    rawWriterBoundaryAccepted: false,
    displayLines: displayLines({
      permissionStatus: input.permissionStatus,
      targetPath,
      previewSummary,
      nextAction: input.nextAction,
    }),
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
      noRawProviderMetadata: true,
      noRawApprovalMetadata: true,
      noRawBaseContent: true,
      noRawWriterBoundary: true,
    },
    evidence: [
      ...input.evidence,
      "single-file-apply-patch-permission-ux-real-route-seam:will-write-false",
      "single-file-apply-patch-permission-ux-real-route-seam:changed-files-empty",
      "single-file-apply-patch-permission-ux-real-route-seam:write-intents-empty",
      "single-file-apply-patch-permission-ux-real-route-seam:no-writer-invoked",
      "single-file-apply-patch-permission-ux-real-route-seam:no-applied-patch-record",
      "single-file-apply-patch-permission-ux-real-route-seam:no-success-claim",
      "single-file-apply-patch-permission-ux-real-route-seam:no-approval-as-write-authorization",
      "single-file-apply-patch-permission-ux-real-route-seam:no-raw-provider-metadata",
      "single-file-apply-patch-permission-ux-real-route-seam:no-raw-approval-metadata",
      "single-file-apply-patch-permission-ux-real-route-seam:no-raw-base-content",
      "single-file-apply-patch-permission-ux-real-route-seam:no-raw-writer-boundary",
      ...(baseEvidenceDigestBound
        ? [
            "single-file-apply-patch-permission-ux-real-route-seam:base-evidence-digest-bound",
          ]
        : [
            "single-file-apply-patch-permission-ux-real-route-seam:base-evidence-missing",
          ]),
      ...(staleReadPreconditionBound
        ? [
            "single-file-apply-patch-permission-ux-real-route-seam:stale-read-precondition-bound",
          ]
        : [
            "single-file-apply-patch-permission-ux-real-route-seam:stale-read-precondition-missing",
          ]),
    ],
  };
}

function previewSummaryFromRoute(
  route: SingleFileApplyPatchOptInDryRunRouteAccepted | undefined,
): readonly string[] | undefined {
  const metadata = route?.dryRun.approval.metadata;
  if (metadata && "previewSummary" in metadata) {
    return metadata.previewSummary;
  }
  return undefined;
}

function displayLines(input: {
  readonly permissionStatus: SingleFileApplyPatchPermissionUxRealRouteStatus;
  readonly targetPath?: string;
  readonly previewSummary?: readonly string[];
  readonly nextAction: string;
}): readonly string[] {
  return [
    statusLine(input.permissionStatus),
    `Target: ${input.targetPath ?? "unknown"}`,
    `Preview: ${input.previewSummary?.join("; ") ?? "unavailable"}`,
    "Changed: none",
    `Next: ${input.nextAction}`,
  ];
}

function statusLine(
  status: SingleFileApplyPatchPermissionUxRealRouteStatus,
): string {
  switch (status) {
    case "pending":
      return "Waiting for explicit edit permission; no file was modified.";
    case "denied":
      return "Permission denied; no file was modified.";
    case "blocked":
      return "Permission path blocked before any write; no file was modified.";
  }
}
