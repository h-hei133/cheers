import type {
  PerFilePatchOperation,
  PerFilePatchPlan,
} from "./perFilePatchPlan.js";
import type {
  RouteScopedEditJournal,
  RouteScopedEditJournalFailureClass,
  RouteScopedEditJournalOperation,
  RouteScopedEditJournalOperationKind,
} from "./routeScopedEditJournal.js";

export function buildJournalForFailureResult(input: {
  readonly routeId: string;
  readonly plan: PerFilePatchPlan;
  readonly changedFiles: readonly string[];
  readonly failedFiles: readonly {
    readonly path: string;
    readonly reason: string;
  }[];
  readonly writerStarted: boolean;
  readonly postWriteVerification: "passed" | "blocked" | "failed" | "not-run";
}): RouteScopedEditJournal {
  const hasFailure = input.failedFiles.length > 0;

  return {
    routeId: input.routeId,
    operations: input.plan.operations
      .map((operation, index) =>
        projectOperation({
          operation,
          index,
          changedFiles: input.changedFiles,
          failedFiles: input.failedFiles,
          writerStarted: input.writerStarted,
          postWriteVerification: input.postWriteVerification,
          hasFailure,
        }),
      )
      .filter((operation): operation is RouteScopedEditJournalOperation =>
        Boolean(operation),
      ),
  };
}

function projectOperation(input: {
  readonly operation: PerFilePatchOperation;
  readonly index: number;
  readonly changedFiles: readonly string[];
  readonly failedFiles: readonly {
    readonly path: string;
    readonly reason: string;
  }[];
  readonly writerStarted: boolean;
  readonly postWriteVerification: "passed" | "blocked" | "failed" | "not-run";
  readonly hasFailure: boolean;
}): RouteScopedEditJournalOperation | undefined {
  const operationKind = toJournalOperationKind(input.operation.operationKind);
  const targetPath = operationTargetPath(input.operation);
  if (!operationKind || !targetPath) {
    return undefined;
  }

  const failedFile = input.failedFiles.find(
    (failure) => failure.path === targetPath,
  );
  const verified = input.changedFiles.includes(targetPath);
  const failureClass = failedFile
    ? failureClassForResult(input)
    : undefined;
  const unrecovered =
    Boolean(failedFile) && input.postWriteVerification === "failed";
  const recoveryCandidate =
    input.writerStarted && input.hasFailure && (verified || unrecovered);

  return {
    operationId: `${input.index + 1}:${operationKind}:${targetPath}`,
    operationKind,
    targetPath,
    ...(input.operation.sourcePath
      ? { sourcePath: input.operation.sourcePath }
      : {}),
    planned: true,
    preflightPassed: input.operation.supportStatus === "supported-write",
    writerStarted: input.writerStarted,
    applied: verified,
    verified,
    ...(failedFile
      ? {
          failed: true,
          failureClass,
          failureReason: failedFile.reason,
        }
      : {}),
    ...(recoveryCandidate ? { recoveryCandidate: true } : {}),
    ...(unrecovered ? { unrecovered: true } : {}),
  };
}

function operationTargetPath(
  operation: PerFilePatchOperation,
): string | undefined {
  return (
    operation.targetPath ??
    operation.plannedFile ??
    operation.changedFile ??
    operation.failedFile?.path
  );
}

function toJournalOperationKind(
  operationKind: PerFilePatchOperation["operationKind"],
): RouteScopedEditJournalOperationKind | undefined {
  switch (operationKind) {
    case "update":
    case "create":
    case "delete":
    case "move":
      return operationKind;
    case "broad":
    case "malformed":
    case "unknown":
      return undefined;
  }
}

function failureClassForResult(input: {
  readonly writerStarted: boolean;
  readonly postWriteVerification: "passed" | "blocked" | "failed" | "not-run";
}): RouteScopedEditJournalFailureClass {
  if (input.postWriteVerification === "failed") {
    return "post-write-verification";
  }
  return input.writerStarted ? "write-application" : "preflight";
}
