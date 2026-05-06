import type { IsolatedWriteLane } from "./isolatedWriteLane.js";

export type RealProviderWriteSmokeStatus = "ready" | "blocked";

export type RealProviderWriteSmokeFailure =
  | "explicit-opt-in-missing"
  | "synthetic-write-lane-not-validated"
  | "write-lane-failure"
  | "redaction-failure"
  | "unexpected-production-write"
  | "unexpected-write-target"
  | "unexpected-success-claim";

export interface RealProviderWriteSmokeOptions {
  readonly explicitOptIn: boolean;
  readonly syntheticWriteLaneValidated: boolean;
  readonly writeLane: IsolatedWriteLane;
  readonly redactionCheck: {
    readonly ok: boolean;
    readonly leaks: readonly string[];
  };
  readonly isolatedFixture: true;
  readonly privateAgentsRealRead: false;
  readonly providerConfigPrinted: false;
  readonly fixtureChangedFiles: readonly string[];
  readonly expectedChangedFiles: readonly [string];
  readonly protectedFilesUnchanged: boolean;
}

export interface RealProviderWriteSmokeContract {
  readonly source: "single-file-apply-patch-real-provider-isolated-write-smoke";
  readonly status: RealProviderWriteSmokeStatus;
  readonly explicitOptIn: boolean;
  readonly syntheticWriteLaneValidated: boolean;
  readonly isolatedFixture: true;
  readonly privateAgentsRealRead: false;
  readonly providerConfigPrinted: false;
  readonly providerFacingRoute: "single-file-apply-patch-isolated-write-lane";
  readonly realProviderExecution: "requires-explicit-runtime-opt-in";
  readonly changedFiles: readonly string[];
  readonly writeIntents: readonly string[];
  readonly fixtureWriterInvoked: boolean;
  readonly productionWriterInvoked: false;
  readonly noProductionWrite: true;
  readonly appliedPatchRecord: false;
  readonly terminalClassification: "success" | "stopped";
  readonly mutationSuccessClaimAllowed: boolean;
  readonly protectedFilesUnchanged: boolean;
  readonly redaction: {
    readonly ok: boolean;
    readonly leaks: readonly string[];
  };
  readonly failure?: RealProviderWriteSmokeFailure;
  readonly failureAttribution: readonly RealProviderWriteSmokeFailure[];
  readonly nextAction: string;
  readonly doNext: string;
  readonly evidence: readonly string[];
}

export function buildRealProviderWriteSmokeContract(
  options: RealProviderWriteSmokeOptions,
): RealProviderWriteSmokeContract {
  const failures = gateFailures(options);
  const failure = failures[0];
  const status = failure ? "blocked" : "ready";
  const nextAction = gateNextAction(failure);

  return {
    source: "single-file-apply-patch-real-provider-isolated-write-smoke",
    status,
    explicitOptIn: options.explicitOptIn,
    syntheticWriteLaneValidated: options.syntheticWriteLaneValidated,
    isolatedFixture: options.isolatedFixture,
    privateAgentsRealRead: options.privateAgentsRealRead,
    providerConfigPrinted: options.providerConfigPrinted,
    providerFacingRoute: "single-file-apply-patch-isolated-write-lane",
    realProviderExecution: "requires-explicit-runtime-opt-in",
    changedFiles: options.writeLane.changedFiles,
    writeIntents: options.writeLane.writeIntents,
    fixtureWriterInvoked: options.writeLane.fixtureWriterInvoked,
    productionWriterInvoked: false,
    noProductionWrite: true,
    appliedPatchRecord: false,
    terminalClassification: options.writeLane.terminalClassification,
    mutationSuccessClaimAllowed:
      options.writeLane.status === "written" &&
      options.writeLane.mutationSuccessClaimAllowed === true,
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
      "apply-patch-real-provider-write-smoke:contract",
      `apply-patch-real-provider-write-smoke:status:${status}`,
      "apply-patch-real-provider-write-smoke:explicit-opt-in-required",
      "apply-patch-real-provider-write-smoke:isolated-fixture",
      "apply-patch-real-provider-write-smoke:redaction-check-required",
      "apply-patch-real-provider-write-smoke:private-agents-real-not-read",
      "apply-patch-real-provider-write-smoke:provider-config-not-printed",
      "apply-patch-real-provider-write-smoke:production-writer-invoked-false",
      "apply-patch-real-provider-write-smoke:no-production-write",
      "apply-patch-real-provider-write-smoke:no-applied-patch-record",
      "apply-patch-real-provider-write-smoke:success-only-after-fixture-write",
      ...failures.map(
        (item) => `apply-patch-real-provider-write-smoke:failure:${item}`,
      ),
    ],
  };
}

function gateFailures(
  options: RealProviderWriteSmokeOptions,
): RealProviderWriteSmokeFailure[] {
  const failures: RealProviderWriteSmokeFailure[] = [];
  if (!options.explicitOptIn) {
    failures.push("explicit-opt-in-missing");
  }
  if (!options.syntheticWriteLaneValidated) {
    failures.push("synthetic-write-lane-not-validated");
  }
  if (options.writeLane.status !== "written") {
    failures.push("write-lane-failure");
  }
  if (!options.redactionCheck.ok || options.redactionCheck.leaks.length > 0) {
    failures.push("redaction-failure");
  }
  if (
    options.writeLane.productionWriterInvoked !== false ||
    options.writeLane.noProductionWrite !== true
  ) {
    failures.push("unexpected-production-write");
  }
  if (!expectedFixtureWrite(options)) {
    failures.push("unexpected-write-target");
  }
  if (claimsSuccessWithoutVerifiedWrite(options.writeLane)) {
    failures.push("unexpected-success-claim");
  }
  return failures;
}

function expectedFixtureWrite(options: RealProviderWriteSmokeOptions): boolean {
  const expected = [...options.expectedChangedFiles].sort();
  const laneChanged = [...options.writeLane.changedFiles].sort();
  const laneIntents = [...options.writeLane.writeIntents].sort();
  const fixtureChanged = [...options.fixtureChangedFiles].sort();
  return (
    options.protectedFilesUnchanged &&
    sameList(laneChanged, expected) &&
    sameList(laneIntents, expected) &&
    sameList(fixtureChanged, expected) &&
    options.writeLane.fixtureWriterInvoked === true
  );
}

function claimsSuccessWithoutVerifiedWrite(writeLane: IsolatedWriteLane): boolean {
  if (writeLane.status !== "written") {
    return false;
  }
  return (
    writeLane.terminalClassification !== "success" ||
    writeLane.mutationSuccessClaimAllowed !== true ||
    writeLane.verificationStatus !== "passed"
  );
}

function sameList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function gateNextAction(
  failure: RealProviderWriteSmokeFailure | undefined,
): string {
  switch (failure) {
    case "explicit-opt-in-missing":
      return "Do not run the real provider isolated write smoke without explicit opt-in.";
    case "synthetic-write-lane-not-validated":
      return "Run and pass the synthetic isolated write lane before involving the real provider.";
    case "write-lane-failure":
      return "Fix the isolated write lane before recording a real provider write smoke pass.";
    case "redaction-failure":
      return "Stop and fix redaction before exposing or recording provider output.";
    case "unexpected-production-write":
      return "Stop immediately: the smoke observed production writer reachability.";
    case "unexpected-write-target":
      return "Stop immediately: the smoke changed files outside the approved isolated fixture target.";
    case "unexpected-success-claim":
      return "Stop and fix terminal/result classification so success is allowed only after verified fixture write.";
    case undefined:
      return "Record the real provider isolated fixture write smoke result; default production apply_patch remains rejected outside the explicit lane.";
  }
}
