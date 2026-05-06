import type { GuardedWriteGate } from "./guardedWriteGate.js";

export type RouteWiringGateStatus = "ready" | "blocked";

export type RouteWiringGateBlocker =
  | "explicit-route-opt-in-missing"
  | "guarded-gate-not-ready"
  | "unsupported-operation"
  | "default-rejection-regression"
  | "safe-result-session-projection-missing";

export interface RouteWiringGateOptions {
  readonly explicitRouteOptIn: boolean;
  readonly guardedGate: GuardedWriteGate;
  readonly singleFileUpdateOnly: boolean;
  readonly defaultProductionRejectionUnchanged: boolean;
  readonly safeResultSessionProjection: boolean;
  readonly promptText?: string;
}

export interface RouteWiringGate {
  readonly source: "single-file-apply-patch-route-wiring-gate";
  readonly status: RouteWiringGateStatus;
  readonly explicitRouteOptIn: boolean;
  readonly guardedGateStatus: GuardedWriteGate["status"];
  readonly guardedGateBlocker?: GuardedWriteGate["blocker"];
  readonly blocker?: RouteWiringGateBlocker;
  readonly targetPath?: string;
  readonly singleFileUpdateOnly: boolean;
  readonly defaultProductionRejectionUnchanged: boolean;
  readonly safeResultSessionProjection: boolean;
  readonly approvedForWriteRequired: true;
  readonly finalStaleReadRequiredAfterApproval: true;
  readonly writerBoundaryRequired: true;
  readonly promptApprovalIgnored: true;
  readonly approvalMetadataDoesNotAuthorizeWrite: true;
  readonly dryRunDoesNotAuthorizeWrite: true;
  readonly willWrite: false;
  readonly changedFiles: readonly [];
  readonly writeIntents: readonly [];
  readonly noWriterInvoked: true;
  readonly noAppliedPatchRecord: true;
  readonly doesNotClaimMutationSuccess: true;
  readonly doesNotClaimWriteSuccess: true;
  readonly nextAction: string;
  readonly doNext: string;
  readonly evidence: readonly string[];
}

export function buildRouteWiringGate(
  options: RouteWiringGateOptions,
): RouteWiringGate {
  const blocker = gateBlocker(options);
  const status: RouteWiringGateStatus = blocker ? "blocked" : "ready";
  const nextAction = nextActionForBlocker(blocker);

  return {
    source: "single-file-apply-patch-route-wiring-gate",
    status,
    explicitRouteOptIn: options.explicitRouteOptIn,
    guardedGateStatus: options.guardedGate.status,
    ...(options.guardedGate.blocker
      ? { guardedGateBlocker: options.guardedGate.blocker }
      : {}),
    ...(blocker ? { blocker } : {}),
    ...(options.guardedGate.targetPath
      ? { targetPath: options.guardedGate.targetPath }
      : {}),
    singleFileUpdateOnly: options.singleFileUpdateOnly,
    defaultProductionRejectionUnchanged:
      options.defaultProductionRejectionUnchanged,
    safeResultSessionProjection: options.safeResultSessionProjection,
    approvedForWriteRequired: true,
    finalStaleReadRequiredAfterApproval: true,
    writerBoundaryRequired: true,
    promptApprovalIgnored: true,
    approvalMetadataDoesNotAuthorizeWrite: true,
    dryRunDoesNotAuthorizeWrite: true,
    willWrite: false,
    changedFiles: [],
    writeIntents: [],
    noWriterInvoked: true,
    noAppliedPatchRecord: true,
    doesNotClaimMutationSuccess: true,
    doesNotClaimWriteSuccess: true,
    nextAction,
    doNext: nextAction,
    evidence: [
      "apply-patch-route-wiring-gate:contract",
      `apply-patch-route-wiring-gate:status:${status}`,
      `apply-patch-route-wiring-gate:guarded-gate:${options.guardedGate.status}`,
      "apply-patch-route-wiring-gate:explicit-route-opt-in-required",
      "apply-patch-route-wiring-gate:approved-for-write-required",
      "apply-patch-route-wiring-gate:final-stale-read-required-after-approval",
      "apply-patch-route-wiring-gate:writer-boundary-required",
      "apply-patch-route-wiring-gate:no-prompt-keyword-approval",
      "apply-patch-route-wiring-gate:approval-metadata-not-write-authorization",
      "apply-patch-route-wiring-gate:dry-run-not-write-authorization",
      "apply-patch-route-wiring-gate:will-write-false",
      "apply-patch-route-wiring-gate:changed-files-empty",
      "apply-patch-route-wiring-gate:write-intents-empty",
      "apply-patch-route-wiring-gate:no-writer-invoked",
      "apply-patch-route-wiring-gate:no-applied-patch-record",
      "apply-patch-route-wiring-gate:no-success-claim",
      ...(options.promptText
        ? ["apply-patch-route-wiring-gate:prompt-text-ignored"]
        : []),
      ...(options.singleFileUpdateOnly
        ? ["apply-patch-route-wiring-gate:single-file-update-only"]
        : ["apply-patch-route-wiring-gate:unsupported-operation"]),
      ...(options.defaultProductionRejectionUnchanged
        ? ["apply-patch-route-wiring-gate:default-production-rejection-unchanged"]
        : ["apply-patch-route-wiring-gate:default-rejection-regression"]),
      ...(options.safeResultSessionProjection
        ? ["apply-patch-route-wiring-gate:safe-result-session-projection"]
        : ["apply-patch-route-wiring-gate:safe-result-session-projection-missing"]),
      ...(blocker
        ? [`apply-patch-route-wiring-gate:blocker:${blocker}`]
        : []),
    ],
  };
}

function gateBlocker(
  options: RouteWiringGateOptions,
): RouteWiringGateBlocker | undefined {
  if (!options.explicitRouteOptIn) {
    return "explicit-route-opt-in-missing";
  }
  if (options.guardedGate.status !== "ready") {
    return "guarded-gate-not-ready";
  }
  if (!options.singleFileUpdateOnly) {
    return "unsupported-operation";
  }
  if (!options.defaultProductionRejectionUnchanged) {
    return "default-rejection-regression";
  }
  if (!options.safeResultSessionProjection) {
    return "safe-result-session-projection-missing";
  }
  return undefined;
}

function nextActionForBlocker(
  blocker: RouteWiringGateBlocker | undefined,
): string {
  switch (blocker) {
    case "explicit-route-opt-in-missing":
      return "Keep default production apply_patch rejected unless the guarded production route is explicitly opted in.";
    case "guarded-gate-not-ready":
      return "Do not route to the writer. Resolve guarded write gate blockers first.";
    case "unsupported-operation":
      return "Reject the patch. The guarded production route only accepts one Update File operation.";
    case "default-rejection-regression":
      return "Stop. Restore default production apply_patch and unified diff rejection before any route wiring.";
    case "safe-result-session-projection-missing":
      return "Stop. Wire only safe result/session projections before surfacing guarded route output.";
    case undefined:
      return "Route may enter the guarded production lane; run final stale-read immediately before the writer.";
  }
}
