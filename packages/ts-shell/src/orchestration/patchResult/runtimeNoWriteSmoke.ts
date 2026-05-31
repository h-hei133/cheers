import type { NoWriteRuntimeRoute } from "../../edit/write/status/noWrite.js";

export type RuntimeNoWriteSmokeStatus = "ready" | "blocked";

export type RuntimeNoWriteSmokeFailure =
  | "explicit-opt-in-missing"
  | "synthetic-runtime-not-validated"
  | "runtime-route-failure"
  | "redaction-failure"
  | "fixture-mutated"
  | "repository-mutated"
  | "unexpected-write"
  | "unexpected-success-claim";

export interface RuntimeNoWriteSmokeOptions {
  readonly explicitOptIn: boolean;
  readonly syntheticRuntimeValidated: boolean;
  readonly route: NoWriteRuntimeRoute;
  readonly redactionCheck: {
    readonly ok: boolean;
    readonly leaks: readonly string[];
  };
  readonly isolatedFixture: true;
  readonly privateAgentsRealRead: false;
  readonly providerConfigPrinted: false;
  readonly fixtureUnchanged: boolean;
  readonly repositoryClean: boolean;
}

export interface RuntimeNoWriteSmokeContract {
  readonly source: "single-file-apply-patch-runtime-no-write-smoke";
  readonly status: RuntimeNoWriteSmokeStatus;
  readonly explicitOptIn: boolean;
  readonly syntheticRuntimeValidated: boolean;
  readonly isolatedFixture: true;
  readonly privateAgentsRealRead: false;
  readonly providerConfigPrinted: false;
  readonly providerFacingRoute: "single-file-apply-patch-no-write-runtime-route";
  readonly routeStatus: NoWriteRuntimeRoute["routeStatus"];
  readonly displayStatus: NoWriteRuntimeRoute["displayStatus"];
  readonly terminalClassification: "stopped";
  readonly willWrite: false;
  readonly changedFiles: readonly [];
  readonly writeIntents: readonly [];
  readonly noWriterInvoked: true;
  readonly noAppliedPatchRecord: true;
  readonly terminalNoSuccessClaim: true;
  readonly fixtureUnchanged: boolean;
  readonly repositoryClean: boolean;
  readonly redaction: {
    readonly ok: boolean;
    readonly leaks: readonly string[];
  };
  readonly failure?: RuntimeNoWriteSmokeFailure;
  readonly failureAttribution: readonly RuntimeNoWriteSmokeFailure[];
  readonly nextAction: string;
  readonly doNext: string;
  readonly evidence: readonly string[];
}

export function buildRuntimeNoWriteSmokeContract(
  options: RuntimeNoWriteSmokeOptions,
): RuntimeNoWriteSmokeContract {
  const failures = smokeFailures(options);
  const failure = failures[0];
  const status = failure ? "blocked" : "ready";
  const nextAction = nextActionForFailure(failure);

  return {
    source: "single-file-apply-patch-runtime-no-write-smoke",
    status,
    explicitOptIn: options.explicitOptIn,
    syntheticRuntimeValidated: options.syntheticRuntimeValidated,
    isolatedFixture: options.isolatedFixture,
    privateAgentsRealRead: options.privateAgentsRealRead,
    providerConfigPrinted: options.providerConfigPrinted,
    providerFacingRoute: "single-file-apply-patch-no-write-runtime-route",
    routeStatus: options.route.routeStatus,
    displayStatus: options.route.displayStatus,
    terminalClassification: "stopped",
    willWrite: false,
    changedFiles: [],
    writeIntents: [],
    noWriterInvoked: true,
    noAppliedPatchRecord: true,
    terminalNoSuccessClaim: true,
    fixtureUnchanged: options.fixtureUnchanged,
    repositoryClean: options.repositoryClean,
    redaction: {
      ok: options.redactionCheck.ok,
      leaks: options.redactionCheck.leaks,
    },
    ...(failure ? { failure } : {}),
    failureAttribution: failures,
    nextAction,
    doNext: nextAction,
    evidence: [
      "apply-patch-runtime-no-write-smoke:contract",
      `apply-patch-runtime-no-write-smoke:status:${status}`,
      "apply-patch-runtime-no-write-smoke:explicit-opt-in-required",
      "apply-patch-runtime-no-write-smoke:isolated-fixture",
      "apply-patch-runtime-no-write-smoke:redaction-check-required",
      "apply-patch-runtime-no-write-smoke:private-agents-real-not-read",
      "apply-patch-runtime-no-write-smoke:provider-config-not-printed",
      "apply-patch-runtime-no-write-smoke:will-write-false",
      "apply-patch-runtime-no-write-smoke:changed-files-empty",
      "apply-patch-runtime-no-write-smoke:write-intents-empty",
      "apply-patch-runtime-no-write-smoke:no-writer-invoked",
      "apply-patch-runtime-no-write-smoke:no-applied-patch-record",
      "apply-patch-runtime-no-write-smoke:no-success-claim",
      ...failures.map(
        (item) => `apply-patch-runtime-no-write-smoke:failure:${item}`,
      ),
    ],
  };
}

function smokeFailures(
  options: RuntimeNoWriteSmokeOptions,
): RuntimeNoWriteSmokeFailure[] {
  const failures: RuntimeNoWriteSmokeFailure[] = [];
  if (!options.explicitOptIn) {
    failures.push("explicit-opt-in-missing");
  }
  if (!options.syntheticRuntimeValidated) {
    failures.push("synthetic-runtime-not-validated");
  }
  if (
    !["permission-pending", "blocked", "denied"].includes(options.route.displayStatus)
  ) {
    failures.push("runtime-route-failure");
  }
  if (!options.redactionCheck.ok || options.redactionCheck.leaks.length > 0) {
    failures.push("redaction-failure");
  }
  if (!options.fixtureUnchanged) {
    failures.push("fixture-mutated");
  }
  if (!options.repositoryClean) {
    failures.push("repository-mutated");
  }
  if (
    options.route.willWrite !== false ||
    options.route.changedFiles.length !== 0 ||
    options.route.writeIntents.length !== 0 ||
    options.route.noWriterInvoked !== true ||
    options.route.noAppliedPatchRecord !== true
  ) {
    failures.push("unexpected-write");
  }
  if (
    options.route.terminalClassification !== "stopped" ||
    options.route.doesNotClaimMutationSuccess !== true ||
    options.route.doesNotClaimWriteSuccess !== true
  ) {
    failures.push("unexpected-success-claim");
  }
  return failures;
}

function nextActionForFailure(
  failure: RuntimeNoWriteSmokeFailure | undefined,
): string {
  switch (failure) {
    case "explicit-opt-in-missing":
      return "Do not run the real-provider runtime no-write smoke without explicit opt-in.";
    case "synthetic-runtime-not-validated":
      return "Run and pass the synthetic runtime no-write integration first.";
    case "runtime-route-failure":
      return "Fix the runtime no-write route before recording a real-provider smoke pass.";
    case "redaction-failure":
      return "Stop and fix redaction before surfacing or recording provider output.";
    case "fixture-mutated":
      return "Stop: runtime no-write smoke mutated the isolated fixture.";
    case "repository-mutated":
      return "Stop: runtime no-write smoke mutated the repository.";
    case "unexpected-write":
      return "Stop immediately: no-write runtime smoke exposed writer reachability.";
    case "unexpected-success-claim":
      return "Stop and fix terminal/result classification so no-write output cannot claim success.";
    case undefined:
      return "Record the real-provider runtime no-write smoke result; production apply_patch remains rejected outside explicit opt-in.";
  }
}
