export type TargetSetEditFileVerificationStatus =
  | "passed"
  | "failed"
  | "skipped";

export type TargetSetEditOverallVerificationStatus =
  | "passed"
  | "failed"
  | "blocked"
  | "not-run";

export interface TargetSetEditFileVerification {
  readonly targetPath: string;
  readonly status: TargetSetEditFileVerificationStatus;
  readonly reason: string;
  readonly evidence: readonly string[];
}

export interface TargetSetEditVerificationAggregate {
  readonly overallStatus: TargetSetEditOverallVerificationStatus;
  readonly hardFailure: boolean;
  readonly warning: boolean;
  readonly passedFiles: readonly string[];
  readonly failedFiles: readonly string[];
  readonly skippedFiles: readonly string[];
  readonly perFile: readonly TargetSetEditFileVerification[];
  readonly recoveryRecommendation?: string;
  readonly evidence: readonly string[];
}

export function aggregateTargetSetEditVerification(input: {
  readonly fileResults: readonly {
    readonly targetPath: string;
    readonly status: "written" | "stopped" | "failed" | "not-run";
    readonly changedFiles: readonly string[];
    readonly reason?: string;
    readonly evidence: readonly string[];
  }[];
  readonly changedFiles: readonly string[];
}): TargetSetEditVerificationAggregate {
  const perFile = input.fileResults.map((result): TargetSetEditFileVerification => {
    if (result.status === "written") {
      return {
        targetPath: result.targetPath,
        status: "passed",
        reason: "Post-write verification passed for this target.",
        evidence: [
          `target-set-edit-verification:file:${result.targetPath}:passed`,
        ],
      };
    }
    if (result.status === "not-run" || result.status === "stopped") {
      return {
        targetPath: result.targetPath,
        status: "skipped",
        reason: result.reason ?? "Verification skipped because mutation did not run.",
        evidence: [
          `target-set-edit-verification:file:${result.targetPath}:skipped`,
        ],
      };
    }
    return {
      targetPath: result.targetPath,
      status: "failed",
      reason: result.reason ?? "Verification failed for this target.",
      evidence: [
        `target-set-edit-verification:file:${result.targetPath}:failed`,
      ],
    };
  });

  const passedFiles = perFile
    .filter((file) => file.status === "passed")
    .map((file) => file.targetPath);
  const failedFiles = perFile
    .filter((file) => file.status === "failed")
    .map((file) => file.targetPath);
  const skippedFiles = perFile
    .filter((file) => file.status === "skipped")
    .map((file) => file.targetPath);
  const overallStatus = classifyOverallStatus({
    perFileCount: perFile.length,
    changedFileCount: input.changedFiles.length,
    failedFileCount: failedFiles.length,
    skippedFileCount: skippedFiles.length,
  });
  const recoveryRecommendation =
    input.changedFiles.length > 0 && overallStatus !== "passed"
      ? "Use explicit snapshot-backed recovery apply for changed files only; no automatic rollback was attempted."
      : undefined;

  return {
    overallStatus,
    hardFailure: failedFiles.length > 0,
    warning: skippedFiles.length > 0,
    passedFiles,
    failedFiles,
    skippedFiles,
    perFile,
    ...(recoveryRecommendation ? { recoveryRecommendation } : {}),
    evidence: [
      `target-set-edit-verification:overall:${overallStatus}`,
      `target-set-edit-verification:passed-count:${passedFiles.length}`,
      `target-set-edit-verification:failed-count:${failedFiles.length}`,
      `target-set-edit-verification:skipped-count:${skippedFiles.length}`,
      ...(recoveryRecommendation
        ? ["target-set-edit-verification:recovery-recommended"]
        : []),
      "target-set-edit-verification:raw-content-excluded",
      ...perFile.flatMap((file) => file.evidence),
    ],
  };
}

function classifyOverallStatus(input: {
  readonly perFileCount: number;
  readonly changedFileCount: number;
  readonly failedFileCount: number;
  readonly skippedFileCount: number;
}): TargetSetEditOverallVerificationStatus {
  if (input.perFileCount === 0) {
    return "not-run";
  }
  if (input.failedFileCount > 0) {
    return "failed";
  }
  if (input.skippedFileCount > 0) {
    return input.changedFileCount > 0 ? "failed" : "blocked";
  }
  return "passed";
}
