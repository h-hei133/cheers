import { freezeDeep } from "../../core/values/freeze.js";
import type { ArtifactCorrection } from "../../artifacts/workflow/model.js";
import type { RepairAction } from "../../repair/loop/model.js";
import type { ToolStrategy } from "../../tools/policy/strategy.js";
import type { VerificationSelection } from "../selection/model.js";

export type VerificationExecutionState = "passed" | "partial" | "failed" | "blocked" | "not-run";

export interface VerificationExecutionInput {
  readonly selection: VerificationSelection;
  readonly strategy: ToolStrategy;
  readonly repairAction?: RepairAction;
  readonly artifactCorrection?: ArtifactCorrection;
  readonly contextReady: boolean;
  readonly changedFiles?: readonly string[];
  readonly commandExecutions?: readonly {
    readonly command: string;
    readonly coveredFiles: readonly string[];
    readonly status: "passed" | "failed" | "blocked" | "not-run";
  }[];
}

export interface VerificationExecution {
  readonly state: VerificationExecutionState;
  readonly evidenceInputEligible: boolean;
  readonly resultInputEligible: boolean;
  readonly blockers: readonly string[];
  readonly terminalSuccessClaim: false;
}

export interface ChangedFileVerificationCoverage {
  readonly complete: boolean;
  readonly coveredFiles: readonly string[];
  readonly missingFiles: readonly string[];
}

export interface ChangedFileVerificationCoverageInput {
  readonly changedFiles: readonly string[];
  readonly verificationTargets?: readonly string[];
  readonly verifiedFiles?: readonly string[];
  readonly unverifiedFiles?: readonly string[];
  readonly verificationState: string;
}

export interface VerificationTargetCoverageInput {
  readonly pendingTargets: readonly (readonly string[])[];
  readonly coveredFiles: readonly string[];
  readonly affectedPaths: readonly string[];
}

export interface VerificationTargetCoverage {
  readonly coveredTargets: readonly string[];
  readonly wrongTargetIgnored: boolean;
  readonly settled: boolean;
}

export function executeVerification(input: VerificationExecutionInput): VerificationExecution {
  if (input.strategy.state === "blocked" || !input.contextReady) {
    return result("blocked", ["verification blocked"]);
  }
  const commandCoverageBlockers = commandCoverageBlockersFor(input);
  if (commandCoverageBlockers.length > 0) {
    return result("partial", commandCoverageBlockers);
  }
  if (input.repairAction?.postValidation === "passed") {
    return result("passed", []);
  }
  if (input.repairAction?.postValidation === "partial") {
    return result("partial", ["repair verification incomplete"]);
  }
  if (input.artifactCorrection?.validationState === "validation-passed") {
    return result("passed", []);
  }
  if (input.artifactCorrection?.validationState === "validation-failed") {
    return result("failed", ["artifact validation failed"]);
  }
  if (input.selection.state === "selected-passed") {
    return result("passed", []);
  }
  if (input.selection.state === "selected-failed") {
    return result("failed", ["verification failed"]);
  }
  if (input.selection.state === "insufficient") {
    return result("partial", ["insufficient verification"]);
  }
  if (input.selection.state === "selected-not-run") {
    return result("partial", ["verification rerun required for complete proof"]);
  }
  if ((input.changedFiles?.length ?? 0) > 0 && input.strategy.nextAction === "verify") {
    return result("partial", ["changed files require targeted verification"]);
  }
  if (input.selection.state === "selected-blocked" && input.contextReady) {
    return result("partial", ["verification blocked after context selection"]);
  }
  if (input.selection.state === "not-selected") {
    return result("not-run", ["verification not selected"]);
  }
  return result("blocked", input.selection.blockers);
}

function commandCoverageBlockersFor(input: VerificationExecutionInput): readonly string[] {
  if (!input.commandExecutions || input.commandExecutions.length === 0) {
    return [];
  }
  const passedCoverage = new Set(input.commandExecutions
    .filter((execution) => execution.status === "passed")
    .flatMap((execution) => execution.coveredFiles));
  const requiredTargets = uniquePaths([
    ...(input.changedFiles ?? []),
    ...(input.selection.selectedInputs?.changedFiles ?? []),
  ]);
  return requiredTargets
    .filter((target) => !passedCoverage.has(target))
    .map((target) => `verification command missing changed target: ${target}`);
}

export function classifyVerificationTargetCoverage(
  input: VerificationTargetCoverageInput,
): VerificationTargetCoverage {
  const covered = uniquePaths([
    ...input.coveredFiles,
    ...input.affectedPaths,
  ]);
  const coveredTargets = uniquePaths(input.pendingTargets
    .filter((target) => target.length > 0 && target.every((path) => covered.includes(path)))
    .flat());
  return freezeDeep({
    coveredTargets,
    wrongTargetIgnored: input.pendingTargets.some((target) =>
      target.length > 0 && !target.every((path) => covered.includes(path))
    ),
    settled: coveredTargets.length > 0,
  });
}

export function verifyChangedFileCoverage(
  input: ChangedFileVerificationCoverageInput,
): ChangedFileVerificationCoverage {
  const changedFiles = uniquePaths([
    ...input.changedFiles,
    ...(input.verificationTargets ?? []),
  ]);
  const verified = new Set(uniquePaths(input.verifiedFiles ?? []));
  const unverified = new Set(uniquePaths(input.unverifiedFiles ?? []));
  const coveredFiles = changedFiles.filter((path) => verified.has(path) && !unverified.has(path));
  const missingFiles = changedFiles.filter((path) => !verified.has(path) || unverified.has(path));
  return freezeDeep({
    complete: input.verificationState === "passed" && missingFiles.length === 0,
    coveredFiles,
    missingFiles,
  });
}

function result(
  state: VerificationExecutionState,
  blockers: readonly string[],
): VerificationExecution {
  const passed = state === "passed";
  return freezeDeep({
    state,
    evidenceInputEligible: passed,
    resultInputEligible: passed,
    blockers,
    terminalSuccessClaim: false,
  });
}
function uniquePaths(values: readonly string[]): readonly string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
