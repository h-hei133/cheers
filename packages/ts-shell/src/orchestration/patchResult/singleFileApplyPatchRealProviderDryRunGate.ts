import type { SingleFileApplyPatchOptInDryRunRouteResult } from "./singleFileApplyPatchOptInDryRunRoute.js";

export type SingleFileApplyPatchRealProviderDryRunGateStatus =
  | "ready"
  | "blocked";

export type SingleFileApplyPatchRealProviderDryRunGateFailure =
  | "explicit-opt-in-missing"
  | "synthetic-route-not-validated"
  | "route-failure"
  | "redaction-failure"
  | "unexpected-write"
  | "unexpected-success-claim";

export interface SingleFileApplyPatchRealProviderDryRunGateOptions {
  readonly explicitOptIn: boolean;
  readonly syntheticRouteValidated: boolean;
  readonly routeResult: SingleFileApplyPatchOptInDryRunRouteResult;
  readonly redactionCheck: {
    readonly ok: boolean;
    readonly leaks: readonly string[];
  };
  readonly isolatedFixture: true;
  readonly noWriteMode: true;
  readonly privateAgentsRealRead: false;
  readonly providerConfigPrinted: false;
}

export interface SingleFileApplyPatchRealProviderDryRunGateContract {
  readonly source: "single-file-apply-patch-real-provider-non-mutating-dry-run-gate";
  readonly status: SingleFileApplyPatchRealProviderDryRunGateStatus;
  readonly explicitOptIn: boolean;
  readonly syntheticRouteValidated: boolean;
  readonly isolatedFixture: true;
  readonly noWriteMode: true;
  readonly privateAgentsRealRead: false;
  readonly providerConfigPrinted: false;
  readonly providerFacingRoute: "single-file-apply-patch-opt-in-dry-run";
  readonly realProviderExecution: "requires-explicit-runtime-opt-in";
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
  readonly failure?: SingleFileApplyPatchRealProviderDryRunGateFailure;
  readonly failureAttribution: readonly SingleFileApplyPatchRealProviderDryRunGateFailure[];
  readonly nextAction: string;
  readonly doNext: string;
  readonly evidence: readonly string[];
}

export function buildSingleFileApplyPatchRealProviderDryRunGateContract(
  options: SingleFileApplyPatchRealProviderDryRunGateOptions,
): SingleFileApplyPatchRealProviderDryRunGateContract {
  const failures = gateFailures(options);
  const failure = failures[0];
  const status = failure ? "blocked" : "ready";
  const nextAction = gateNextAction(failure);

  return {
    source: "single-file-apply-patch-real-provider-non-mutating-dry-run-gate",
    status,
    explicitOptIn: options.explicitOptIn,
    syntheticRouteValidated: options.syntheticRouteValidated,
    isolatedFixture: options.isolatedFixture,
    noWriteMode: options.noWriteMode,
    privateAgentsRealRead: options.privateAgentsRealRead,
    providerConfigPrinted: options.providerConfigPrinted,
    providerFacingRoute: "single-file-apply-patch-opt-in-dry-run",
    realProviderExecution: "requires-explicit-runtime-opt-in",
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
      "single-file-apply-patch-real-provider-gate:contract",
      `single-file-apply-patch-real-provider-gate:status:${status}`,
      "single-file-apply-patch-real-provider-gate:explicit-opt-in-required",
      "single-file-apply-patch-real-provider-gate:isolated-fixture",
      "single-file-apply-patch-real-provider-gate:no-write",
      "single-file-apply-patch-real-provider-gate:private-agents-real-not-read",
      "single-file-apply-patch-real-provider-gate:provider-config-not-printed",
      "single-file-apply-patch-real-provider-gate:redaction-check-required",
      "single-file-apply-patch-real-provider-gate:changed-files-empty",
      "single-file-apply-patch-real-provider-gate:write-intents-empty",
      "single-file-apply-patch-real-provider-gate:no-writer-invoked",
      "single-file-apply-patch-real-provider-gate:no-applied-patch-record",
      "single-file-apply-patch-real-provider-gate:no-mutation-success",
      "single-file-apply-patch-real-provider-gate:no-write-success",
      ...failures.map(
        (item) => `single-file-apply-patch-real-provider-gate:failure:${item}`,
      ),
    ],
  };
}

function gateFailures(
  options: SingleFileApplyPatchRealProviderDryRunGateOptions,
): SingleFileApplyPatchRealProviderDryRunGateFailure[] {
  const failures: SingleFileApplyPatchRealProviderDryRunGateFailure[] = [];
  if (!options.explicitOptIn) {
    failures.push("explicit-opt-in-missing");
  }
  if (!options.syntheticRouteValidated) {
    failures.push("synthetic-route-not-validated");
  }
  if (options.routeResult.status === "rejected") {
    failures.push("route-failure");
  }
  if (!options.redactionCheck.ok || options.redactionCheck.leaks.length > 0) {
    failures.push("redaction-failure");
  }
  if (routeWrites(options.routeResult)) {
    failures.push("unexpected-write");
  }
  if (routeClaimsSuccess(options.routeResult)) {
    failures.push("unexpected-success-claim");
  }
  return failures;
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

function gateNextAction(
  failure: SingleFileApplyPatchRealProviderDryRunGateFailure | undefined,
): string {
  switch (failure) {
    case "explicit-opt-in-missing":
      return "Do not run the real provider gate until the operator explicitly opts in to the non-mutating dry-run fixture.";
    case "synthetic-route-not-validated":
      return "Run and pass the synthetic opt-in dry-run integration before any real provider dry-run gate.";
    case "route-failure":
      return "Fix the opt-in dry-run route before involving a real provider.";
    case "redaction-failure":
      return "Stop and fix redaction before recording or exposing real provider dry-run output.";
    case "unexpected-write":
      return "Stop immediately: the gate observed write-like state in a route that must stay no-write.";
    case "unexpected-success-claim":
      return "Stop and fix the result/session surface so preview is not reported as mutation success.";
    case undefined:
      return "Real provider non-mutating dry-run gate may be run only with explicit opt-in, isolated fixture, no-write mode, redaction check, and before/after repository cleanliness checks.";
  }
}
