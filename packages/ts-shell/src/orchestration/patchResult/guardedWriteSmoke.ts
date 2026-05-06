import type { ProductionWriteLane } from "./productionWriteLane.js";

export type GuardedWriteSmokeStatus = "ready" | "blocked";

export type GuardedWriteSmokeFailure =
  | "explicit-opt-in-missing"
  | "synthetic-production-lane-not-validated"
  | "write-lane-failure"
  | "redaction-failure"
  | "repository-mutated"
  | "unexpected-write-target"
  | "unexpected-production-repository-write"
  | "unexpected-success-claim";

export interface GuardedWriteSmokeOptions {
  readonly explicitOptIn: boolean;
  readonly syntheticProductionLaneValidated: boolean;
  readonly writeLane: ProductionWriteLane;
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

export interface GuardedWriteSmokeContract {
  readonly source: "single-file-apply-patch-real-provider-guarded-write-smoke";
  readonly status: GuardedWriteSmokeStatus;
  readonly explicitOptIn: boolean;
  readonly syntheticProductionLaneValidated: boolean;
  readonly isolatedWorkspace: true;
  readonly privateAgentsRealRead: false;
  readonly providerConfigPrinted: false;
  readonly providerFacingRoute: "single-file-apply-patch-production-write-lane";
  readonly realProviderExecution: "requires-explicit-runtime-opt-in";
  readonly repositoryClean: boolean;
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
  readonly failure?: GuardedWriteSmokeFailure;
  readonly failureAttribution: readonly GuardedWriteSmokeFailure[];
  readonly nextAction: string;
  readonly doNext: string;
  readonly evidence: readonly string[];
}

export function buildGuardedWriteSmokeContract(
  options: GuardedWriteSmokeOptions,
): GuardedWriteSmokeContract {
  const failures = smokeFailures(options);
  const failure = failures[0];
  const status: GuardedWriteSmokeStatus = failure ? "blocked" : "ready";
  const nextAction = nextActionForFailure(failure);

  return {
    source: "single-file-apply-patch-real-provider-guarded-write-smoke",
    status,
    explicitOptIn: options.explicitOptIn,
    syntheticProductionLaneValidated:
      options.syntheticProductionLaneValidated,
    isolatedWorkspace: options.isolatedWorkspace,
    privateAgentsRealRead: options.privateAgentsRealRead,
    providerConfigPrinted: options.providerConfigPrinted,
    providerFacingRoute: "single-file-apply-patch-production-write-lane",
    realProviderExecution: "requires-explicit-runtime-opt-in",
    repositoryClean: options.repositoryClean,
    changedFiles: options.writeLane.changedFiles,
    writeIntents: options.writeLane.writeIntents,
    productionWriterInvoked: options.writeLane.productionWriterInvoked,
    productionWriterTarget: options.writeLane.productionWriterTarget,
    realRepositoryWrite: false,
    appliedPatchRecord: false,
    terminalClassification: options.writeLane.terminalClassification,
    terminalSuccessAllowed: options.writeLane.terminalSuccessAllowed,
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
      "apply-patch-guarded-write-smoke:contract",
      `apply-patch-guarded-write-smoke:status:${status}`,
      "apply-patch-guarded-write-smoke:explicit-opt-in-required",
      "apply-patch-guarded-write-smoke:isolated-workspace",
      "apply-patch-guarded-write-smoke:redaction-check-required",
      "apply-patch-guarded-write-smoke:private-agents-real-not-read",
      "apply-patch-guarded-write-smoke:provider-config-not-printed",
      "apply-patch-guarded-write-smoke:production-writer-isolated-workspace-only",
      "apply-patch-guarded-write-smoke:real-repository-write-false",
      "apply-patch-guarded-write-smoke:no-applied-patch-record",
      "apply-patch-guarded-write-smoke:success-only-after-verified-write",
      ...failures.map(
        (item) => `apply-patch-guarded-write-smoke:failure:${item}`,
      ),
    ],
  };
}

function smokeFailures(
  options: GuardedWriteSmokeOptions,
): GuardedWriteSmokeFailure[] {
  const failures: GuardedWriteSmokeFailure[] = [];
  if (!options.explicitOptIn) {
    failures.push("explicit-opt-in-missing");
  }
  if (!options.syntheticProductionLaneValidated) {
    failures.push("synthetic-production-lane-not-validated");
  }
  if (options.writeLane.status !== "written") {
    failures.push("write-lane-failure");
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
    options.writeLane.realRepositoryWrite !== false ||
    (options.writeLane.status === "written" &&
      options.writeLane.productionWriterTarget !== "isolated-workspace")
  ) {
    failures.push("unexpected-production-repository-write");
  }
  if (claimsSuccessWithoutVerifiedWrite(options.writeLane)) {
    failures.push("unexpected-success-claim");
  }
  return failures;
}

function expectedWorkspaceWrite(options: GuardedWriteSmokeOptions): boolean {
  const expected = [...options.expectedChangedFiles].sort();
  const laneChanged = [...options.writeLane.changedFiles].sort();
  const laneIntents = [...options.writeLane.writeIntents].sort();
  const workspaceChanged = [...options.workspaceChangedFiles].sort();
  return (
    options.protectedFilesUnchanged &&
    sameList(laneChanged, expected) &&
    sameList(laneIntents, expected) &&
    sameList(workspaceChanged, expected) &&
    options.writeLane.productionWriterInvoked === true
  );
}

function claimsSuccessWithoutVerifiedWrite(
  writeLane: ProductionWriteLane,
): boolean {
  if (writeLane.status !== "written") {
    return false;
  }
  return (
    writeLane.terminalClassification !== "success" ||
    writeLane.terminalSuccessAllowed !== true ||
    writeLane.mutationSuccessClaimAllowed !== true ||
    writeLane.verificationStatus !== "passed"
  );
}

function sameList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function nextActionForFailure(
  failure: GuardedWriteSmokeFailure | undefined,
): string {
  switch (failure) {
    case "explicit-opt-in-missing":
      return "Do not run the real-provider guarded write smoke without explicit opt-in.";
    case "synthetic-production-lane-not-validated":
      return "Run and pass the synthetic guarded production write lane first.";
    case "write-lane-failure":
      return "Fix the guarded production write lane before recording a real-provider smoke pass.";
    case "redaction-failure":
      return "Stop and fix redaction before surfacing or recording provider output.";
    case "repository-mutated":
      return "Stop: the guarded write smoke changed the repository.";
    case "unexpected-write-target":
      return "Stop: the guarded write smoke changed files outside the approved isolated workspace target.";
    case "unexpected-production-repository-write":
      return "Stop immediately: the guarded writer reached a non-isolated repository target.";
    case "unexpected-success-claim":
      return "Stop and fix terminal/result classification so success is allowed only after verified write.";
    case undefined:
      return "Record the guarded write smoke result; default production apply_patch remains rejected outside the explicit lane.";
  }
}
