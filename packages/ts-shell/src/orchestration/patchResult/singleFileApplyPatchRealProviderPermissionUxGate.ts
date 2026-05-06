import type { SingleFileApplyPatchOptInDryRunRouteResult } from "./singleFileApplyPatchOptInDryRunRoute.js";
import type { SingleFileApplyPatchPermissionUxRealRouteSeam } from "./singleFileApplyPatchPermissionUxRealRouteSeam.js";

export type SingleFileApplyPatchRealProviderPermissionUxGateStatus =
  | "ready"
  | "blocked";

export type SingleFileApplyPatchRealProviderPermissionUxGateFailure =
  | "explicit-opt-in-missing"
  | "synthetic-permission-ux-not-validated"
  | "route-failure"
  | "permission-ux-failure"
  | "redaction-failure"
  | "unexpected-write"
  | "unexpected-success-claim";

export interface SingleFileApplyPatchRealProviderPermissionUxGateOptions {
  readonly explicitOptIn: boolean;
  readonly syntheticPermissionUxValidated: boolean;
  readonly pendingRouteResult: SingleFileApplyPatchOptInDryRunRouteResult;
  readonly pendingSeam: SingleFileApplyPatchPermissionUxRealRouteSeam;
  readonly deniedSeam: SingleFileApplyPatchPermissionUxRealRouteSeam;
  readonly blockedSeam: SingleFileApplyPatchPermissionUxRealRouteSeam;
  readonly redactionCheck: {
    readonly ok: boolean;
    readonly leaks: readonly string[];
  };
  readonly isolatedFixture: true;
  readonly noWriteMode: true;
  readonly privateAgentsRealRead: false;
  readonly providerConfigPrinted: false;
}

export interface SingleFileApplyPatchRealProviderPermissionUxGateContract {
  readonly source: "single-file-apply-patch-real-provider-permission-ux-no-write-gate";
  readonly status: SingleFileApplyPatchRealProviderPermissionUxGateStatus;
  readonly explicitOptIn: boolean;
  readonly syntheticPermissionUxValidated: boolean;
  readonly isolatedFixture: true;
  readonly noWriteMode: true;
  readonly privateAgentsRealRead: false;
  readonly providerConfigPrinted: false;
  readonly providerFacingRoute: "single-file-apply-patch-permission-ux";
  readonly realProviderExecution: "requires-explicit-runtime-opt-in";
  readonly permissionStatuses: {
    readonly pending: SingleFileApplyPatchPermissionUxRealRouteSeam["permissionStatus"];
    readonly denied: SingleFileApplyPatchPermissionUxRealRouteSeam["permissionStatus"];
    readonly blocked: SingleFileApplyPatchPermissionUxRealRouteSeam["permissionStatus"];
  };
  readonly willWrite: false;
  readonly changedFiles: readonly [];
  readonly writeIntents: readonly [];
  readonly noWriterInvoked: true;
  readonly noAppliedPatchRecord: true;
  readonly doesNotClaimMutationSuccess: true;
  readonly doesNotClaimWriteSuccess: true;
  readonly redaction: {
    readonly ok: boolean;
    readonly leaks: readonly string[];
  };
  readonly failure?: SingleFileApplyPatchRealProviderPermissionUxGateFailure;
  readonly failureAttribution: readonly SingleFileApplyPatchRealProviderPermissionUxGateFailure[];
  readonly nextAction: string;
  readonly doNext: string;
  readonly evidence: readonly string[];
}

export function buildSingleFileApplyPatchRealProviderPermissionUxGateContract(
  options: SingleFileApplyPatchRealProviderPermissionUxGateOptions,
): SingleFileApplyPatchRealProviderPermissionUxGateContract {
  const failures = gateFailures(options);
  const failure = failures[0];
  const status = failure ? "blocked" : "ready";
  const nextAction = gateNextAction(failure);

  return {
    source: "single-file-apply-patch-real-provider-permission-ux-no-write-gate",
    status,
    explicitOptIn: options.explicitOptIn,
    syntheticPermissionUxValidated: options.syntheticPermissionUxValidated,
    isolatedFixture: options.isolatedFixture,
    noWriteMode: options.noWriteMode,
    privateAgentsRealRead: options.privateAgentsRealRead,
    providerConfigPrinted: options.providerConfigPrinted,
    providerFacingRoute: "single-file-apply-patch-permission-ux",
    realProviderExecution: "requires-explicit-runtime-opt-in",
    permissionStatuses: {
      pending: options.pendingSeam.permissionStatus,
      denied: options.deniedSeam.permissionStatus,
      blocked: options.blockedSeam.permissionStatus,
    },
    willWrite: false,
    changedFiles: [],
    writeIntents: [],
    noWriterInvoked: true,
    noAppliedPatchRecord: true,
    doesNotClaimMutationSuccess: true,
    doesNotClaimWriteSuccess: true,
    redaction: {
      ok: options.redactionCheck.ok,
      leaks: options.redactionCheck.leaks,
    },
    ...(failure ? { failure } : {}),
    failureAttribution: failures,
    nextAction,
    doNext: nextAction,
    evidence: [
      "single-file-apply-patch-real-provider-permission-ux-gate:contract",
      `single-file-apply-patch-real-provider-permission-ux-gate:status:${status}`,
      "single-file-apply-patch-real-provider-permission-ux-gate:explicit-opt-in-required",
      "single-file-apply-patch-real-provider-permission-ux-gate:isolated-fixture",
      "single-file-apply-patch-real-provider-permission-ux-gate:no-write",
      "single-file-apply-patch-real-provider-permission-ux-gate:redaction-check-required",
      "single-file-apply-patch-real-provider-permission-ux-gate:changed-files-empty",
      "single-file-apply-patch-real-provider-permission-ux-gate:write-intents-empty",
      "single-file-apply-patch-real-provider-permission-ux-gate:no-writer-invoked",
      "single-file-apply-patch-real-provider-permission-ux-gate:no-applied-patch-record",
      "single-file-apply-patch-real-provider-permission-ux-gate:no-mutation-success",
      "single-file-apply-patch-real-provider-permission-ux-gate:no-write-success",
      ...failures.map(
        (item) =>
          `single-file-apply-patch-real-provider-permission-ux-gate:failure:${item}`,
      ),
    ],
  };
}

function gateFailures(
  options: SingleFileApplyPatchRealProviderPermissionUxGateOptions,
): SingleFileApplyPatchRealProviderPermissionUxGateFailure[] {
  const failures: SingleFileApplyPatchRealProviderPermissionUxGateFailure[] = [];
  if (!options.explicitOptIn) {
    failures.push("explicit-opt-in-missing");
  }
  if (!options.syntheticPermissionUxValidated) {
    failures.push("synthetic-permission-ux-not-validated");
  }
  if (options.pendingRouteResult.status === "rejected") {
    failures.push("route-failure");
  }
  if (!permissionStatusesValid(options)) {
    failures.push("permission-ux-failure");
  }
  if (!options.redactionCheck.ok || options.redactionCheck.leaks.length > 0) {
    failures.push("redaction-failure");
  }
  if (routeWrites(options.pendingRouteResult) || seamsWrite(options)) {
    failures.push("unexpected-write");
  }
  if (routeClaimsSuccess(options.pendingRouteResult) || seamsClaimSuccess(options)) {
    failures.push("unexpected-success-claim");
  }
  return failures;
}

function permissionStatusesValid(
  options: SingleFileApplyPatchRealProviderPermissionUxGateOptions,
): boolean {
  return (
    options.pendingSeam.permissionStatus === "pending" &&
    options.deniedSeam.permissionStatus === "denied" &&
    options.blockedSeam.permissionStatus === "blocked"
  );
}

function routeWrites(
  routeResult: SingleFileApplyPatchOptInDryRunRouteResult,
): boolean {
  return (
    routeResult.willWrite !== false ||
    routeResult.changedFiles.length > 0 ||
    routeResult.writeIntents.length > 0 ||
    routeResult.noWriterInvoked !== true ||
    routeResult.noAppliedPatchRecord !== true
  );
}

function seamsWrite(
  options: SingleFileApplyPatchRealProviderPermissionUxGateOptions,
): boolean {
  return [options.pendingSeam, options.deniedSeam, options.blockedSeam].some(
    (seam) =>
      seam.willWrite !== false ||
      seam.changedFiles.length > 0 ||
      seam.writeIntents.length > 0 ||
      seam.noWriterInvoked !== true ||
      seam.noAppliedPatchRecord !== true,
  );
}

function routeClaimsSuccess(
  routeResult: SingleFileApplyPatchOptInDryRunRouteResult,
): boolean {
  if (routeResult.doesNotClaimMutationSuccess !== true) {
    return true;
  }
  if (routeResult.status === "rejected") {
    return false;
  }
  return (
    routeResult.doesNotClaimWriteSuccess !== true ||
    (routeResult.resultMapperSeam.terminalClassification as string) ===
      "success" ||
    routeResult.resultMapperSeam.patchesApplied ||
    routeResult.resultMapperSeam.taskSatisfied ||
    routeResult.sessionRuntimeSeam.mutationSuccessDisplayed ||
    routeResult.sessionRuntimeSeam.writeSuccessDisplayed ||
    routeResult.sessionRuntimeSeam.appliedPatchDisplayed
  );
}

function seamsClaimSuccess(
  options: SingleFileApplyPatchRealProviderPermissionUxGateOptions,
): boolean {
  return [options.pendingSeam, options.deniedSeam, options.blockedSeam].some(
    (seam) =>
      seam.doesNotClaimMutationSuccess !== true ||
      seam.doesNotClaimWriteSuccess !== true,
  );
}

function gateNextAction(
  failure: SingleFileApplyPatchRealProviderPermissionUxGateFailure | undefined,
): string {
  switch (failure) {
    case "explicit-opt-in-missing":
      return "Do not run the real provider permission UX gate without explicit opt-in.";
    case "synthetic-permission-ux-not-validated":
      return "Run and pass synthetic permission UX integration before the real provider gate.";
    case "route-failure":
      return "Fix the opt-in apply_patch dry-run route before involving provider-facing permission UX.";
    case "permission-ux-failure":
      return "Fix permission UX projection so pending, denied, and blocked stay distinct and no-write.";
    case "redaction-failure":
      return "Stop and fix redaction before recording provider-facing permission UX output.";
    case "unexpected-write":
      return "Stop immediately: the permission UX gate observed write-like state.";
    case "unexpected-success-claim":
      return "Stop and fix result/session surfaces so permission UX is not reported as write success.";
    case undefined:
      return "Real provider permission UX no-write gate may run only after synthetic validation, with explicit opt-in, isolated fixture, redaction, and repository cleanliness checks.";
  }
}
