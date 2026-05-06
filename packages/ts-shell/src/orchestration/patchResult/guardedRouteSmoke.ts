import type { ProductionRoute } from "./productionRoute.js";

export type GuardedRouteSmokeStatus = "ready" | "blocked";

export type GuardedRouteSmokeFailure =
  | "explicit-opt-in-missing"
  | "synthetic-production-route-not-validated"
  | "production-route-failure"
  | "redaction-failure"
  | "repository-mutated"
  | "unexpected-write-target"
  | "unexpected-production-repository-write"
  | "unexpected-success-claim";

export interface GuardedRouteSmokeOptions {
  readonly explicitOptIn: boolean;
  readonly syntheticProductionRouteValidated: boolean;
  readonly productionRoute: ProductionRoute;
  readonly redactionCheck: {
    readonly ok: boolean;
    readonly leaks: readonly string[];
  };
  readonly isolatedWorkspace: true;
  readonly privateAgentsRealRead: false;
  readonly providerConfigPrinted: false;
  readonly repositoryClean: boolean;
  readonly workspaceChangedFiles: readonly string[];
  readonly expectedChangedFiles: readonly [string];
  readonly protectedFilesUnchanged: boolean;
}

export interface GuardedRouteSmokeContract {
  readonly source: "single-file-apply-patch-real-provider-guarded-route-smoke";
  readonly status: GuardedRouteSmokeStatus;
  readonly explicitOptIn: boolean;
  readonly syntheticProductionRouteValidated: boolean;
  readonly isolatedWorkspace: true;
  readonly privateAgentsRealRead: false;
  readonly providerConfigPrinted: false;
  readonly providerFacingRoute: "single-file-apply-patch-production-route";
  readonly realProviderExecution: "requires-explicit-runtime-opt-in";
  readonly repositoryClean: boolean;
  readonly routeStatus: ProductionRoute["status"];
  readonly routeGateStatus: ProductionRoute["routeGate"]["status"];
  readonly changedFiles: readonly string[];
  readonly writeIntents: readonly string[];
  readonly productionWriterInvoked: boolean;
  readonly productionWriterTarget: "isolated-workspace" | "none";
  readonly realRepositoryWrite: false;
  readonly appliedPatchRecord: false;
  readonly terminalClassification: "success" | "stopped";
  readonly terminalSuccessAllowed: boolean;
  readonly mutationSuccessClaimAllowed: boolean;
  readonly protectedFilesUnchanged: boolean;
  readonly redaction: {
    readonly ok: boolean;
    readonly leaks: readonly string[];
  };
  readonly failure?: GuardedRouteSmokeFailure;
  readonly failureAttribution: readonly GuardedRouteSmokeFailure[];
  readonly nextAction: string;
  readonly doNext: string;
  readonly evidence: readonly string[];
}

export function buildGuardedRouteSmokeContract(
  options: GuardedRouteSmokeOptions,
): GuardedRouteSmokeContract {
  const failures = smokeFailures(options);
  const failure = failures[0];
  const status: GuardedRouteSmokeStatus = failure ? "blocked" : "ready";
  const nextAction = nextActionForFailure(failure);

  return {
    source: "single-file-apply-patch-real-provider-guarded-route-smoke",
    status,
    explicitOptIn: options.explicitOptIn,
    syntheticProductionRouteValidated:
      options.syntheticProductionRouteValidated,
    isolatedWorkspace: options.isolatedWorkspace,
    privateAgentsRealRead: options.privateAgentsRealRead,
    providerConfigPrinted: options.providerConfigPrinted,
    providerFacingRoute: "single-file-apply-patch-production-route",
    realProviderExecution: "requires-explicit-runtime-opt-in",
    repositoryClean: options.repositoryClean,
    routeStatus: options.productionRoute.status,
    routeGateStatus: options.productionRoute.routeGate.status,
    changedFiles: options.productionRoute.changedFiles,
    writeIntents: options.productionRoute.writeIntents,
    productionWriterInvoked: options.productionRoute.productionWriterInvoked,
    productionWriterTarget: options.productionRoute.productionWriterTarget,
    realRepositoryWrite: false,
    appliedPatchRecord: false,
    terminalClassification: options.productionRoute.terminalClassification,
    terminalSuccessAllowed: options.productionRoute.terminalSuccessAllowed,
    mutationSuccessClaimAllowed:
      options.productionRoute.status === "written" &&
      options.productionRoute.mutationSuccessClaimAllowed === true,
    protectedFilesUnchanged: options.protectedFilesUnchanged,
    redaction: {
      ok: options.redactionCheck.ok,
      leaks: options.redactionCheck.leaks,
    },
    ...(failure ? { failure } : {}),
    failureAttribution: failures,
    nextAction,
    doNext: nextAction,
    evidence: [
      "apply-patch-guarded-route-smoke:contract",
      `apply-patch-guarded-route-smoke:status:${status}`,
      "apply-patch-guarded-route-smoke:explicit-opt-in-required",
      "apply-patch-guarded-route-smoke:isolated-workspace",
      "apply-patch-guarded-route-smoke:redaction-check-required",
      "apply-patch-guarded-route-smoke:private-agents-real-not-read",
      "apply-patch-guarded-route-smoke:provider-config-not-printed",
      "apply-patch-guarded-route-smoke:production-writer-isolated-workspace-only",
      "apply-patch-guarded-route-smoke:real-repository-write-false",
      "apply-patch-guarded-route-smoke:no-applied-patch-record",
      "apply-patch-guarded-route-smoke:success-only-after-verified-write",
      ...failures.map(
        (item) => `apply-patch-guarded-route-smoke:failure:${item}`,
      ),
    ],
  };
}

function smokeFailures(
  options: GuardedRouteSmokeOptions,
): GuardedRouteSmokeFailure[] {
  const failures: GuardedRouteSmokeFailure[] = [];
  if (!options.explicitOptIn) {
    failures.push("explicit-opt-in-missing");
  }
  if (!options.syntheticProductionRouteValidated) {
    failures.push("synthetic-production-route-not-validated");
  }
  if (options.productionRoute.status !== "written") {
    failures.push("production-route-failure");
  }
  if (!options.redactionCheck.ok || options.redactionCheck.leaks.length > 0) {
    failures.push("redaction-failure");
  }
  if (!options.repositoryClean) {
    failures.push("repository-mutated");
  }
  if (!expectedWorkspaceWrite(options)) {
    failures.push("unexpected-write-target");
  }
  if (
    options.productionRoute.realRepositoryWrite !== false ||
    (options.productionRoute.status === "written" &&
      options.productionRoute.productionWriterTarget !== "isolated-workspace")
  ) {
    failures.push("unexpected-production-repository-write");
  }
  if (claimsSuccessWithoutVerifiedWrite(options.productionRoute)) {
    failures.push("unexpected-success-claim");
  }
  return failures;
}

function expectedWorkspaceWrite(options: GuardedRouteSmokeOptions): boolean {
  const expected = [...options.expectedChangedFiles].sort();
  const routeChanged = [...options.productionRoute.changedFiles].sort();
  const routeIntents = [...options.productionRoute.writeIntents].sort();
  const workspaceChanged = [...options.workspaceChangedFiles].sort();
  return (
    options.protectedFilesUnchanged &&
    sameList(routeChanged, expected) &&
    sameList(routeIntents, expected) &&
    sameList(workspaceChanged, expected) &&
    options.productionRoute.productionWriterInvoked === true
  );
}

function claimsSuccessWithoutVerifiedWrite(
  productionRoute: ProductionRoute,
): boolean {
  if (productionRoute.status !== "written") {
    return false;
  }
  return (
    productionRoute.terminalClassification !== "success" ||
    productionRoute.terminalSuccessAllowed !== true ||
    productionRoute.mutationSuccessClaimAllowed !== true ||
    productionRoute.resultSessionStatus !== "write-success" ||
    productionRoute.writeLane.verificationStatus !== "passed"
  );
}

function sameList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function nextActionForFailure(
  failure: GuardedRouteSmokeFailure | undefined,
): string {
  switch (failure) {
    case "explicit-opt-in-missing":
      return "Do not run the real-provider guarded route smoke without explicit opt-in.";
    case "synthetic-production-route-not-validated":
      return "Run and pass the synthetic guarded production route first.";
    case "production-route-failure":
      return "Fix the guarded production route before recording a real-provider smoke pass.";
    case "redaction-failure":
      return "Stop and fix redaction before surfacing or recording provider output.";
    case "repository-mutated":
      return "Stop: the guarded route smoke changed the repository.";
    case "unexpected-write-target":
      return "Stop: the guarded route smoke changed files outside the approved isolated workspace target.";
    case "unexpected-production-repository-write":
      return "Stop immediately: the guarded route reached a non-isolated repository target.";
    case "unexpected-success-claim":
      return "Stop and fix terminal/result classification so success is allowed only after verified write.";
    case undefined:
      return "Record the guarded route smoke result; default production apply_patch remains rejected outside the explicit route.";
  }
}
