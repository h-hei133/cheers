import { routeScopedEditJournalBoundaryFacts } from "../../edit/result/journal/journalMetadataBoundary.js";

export type RouteScopedEditJournalOperationKind =
  | "update"
  | "create"
  | "delete"
  | "move";

export type RouteScopedEditJournalFailureClass =
  | "preflight"
  | "write-application"
  | "post-write-verification"
  | "recovery-unavailable"
  | "recovery-failed";

export interface RouteScopedEditJournalOperation {
  readonly operationId: string;
  readonly operationKind: RouteScopedEditJournalOperationKind;
  readonly targetPath: string;
  readonly sourcePath?: string;
  readonly planned?: boolean;
  readonly preflightPassed?: boolean;
  readonly writerStarted?: boolean;
  readonly applied?: boolean;
  readonly verified?: boolean;
  readonly failed?: boolean;
  readonly failureClass?: RouteScopedEditJournalFailureClass;
  readonly failureReason?: string;
  readonly recoveryCandidate?: boolean;
  readonly recovered?: boolean;
  readonly unrecovered?: boolean;
}

export interface RouteScopedEditJournal {
  readonly routeId: string;
  readonly operations: readonly RouteScopedEditJournalOperation[];
}

export interface RouteScopedEditJournalProjection {
  readonly routeId: string;
  readonly operationCount: number;
  readonly operationKinds: readonly RouteScopedEditJournalOperationKind[];
  readonly plannedFiles: readonly string[];
  readonly changedFiles: readonly string[];
  readonly failedFiles: readonly {
    readonly path: string;
    readonly reason: string;
    readonly failureClass: RouteScopedEditJournalFailureClass;
  }[];
  readonly verifiedFiles: readonly string[];
  readonly recoveredFiles: readonly string[];
  readonly unrecoveredFiles: readonly string[];
  readonly recoveryCandidateFiles: readonly string[];
  readonly writerStarted: boolean;
  readonly hasPartialApply: boolean;
  readonly hasUnrecoveredApply: boolean;
  readonly rollbackAtomicityClaim: false;
  readonly writeCapability: "metadata-only";
  readonly evidence: readonly string[];
}

const defaultFailureClass: RouteScopedEditJournalFailureClass =
  "write-application";

export function projectRouteScopedEditJournal(
  journal: RouteScopedEditJournal,
): RouteScopedEditJournalProjection {
  const operationKinds = unique(
    journal.operations.map((operation) => operation.operationKind),
  );
  const plannedFiles = unique(
    journal.operations
      .filter((operation) => operation.planned)
      .map((operation) => operation.targetPath),
  );
  const changedFiles = unique(
    journal.operations
      .filter((operation) => operation.applied && !operation.recovered)
      .map((operation) => operation.targetPath),
  );
  const failedFiles = journal.operations
    .filter((operation) => operation.failed)
    .map((operation) => ({
      path: operation.targetPath,
      reason:
        operation.failureReason ??
        defaultFailureReason(operation.failureClass ?? defaultFailureClass),
      failureClass: operation.failureClass ?? defaultFailureClass,
    }));
  const verifiedFiles = unique(
    journal.operations
      .filter((operation) => operation.verified && !operation.recovered)
      .map((operation) => operation.targetPath),
  );
  const recoveredFiles = unique(
    journal.operations
      .filter((operation) => operation.recovered)
      .map((operation) => operation.targetPath),
  );
  const unrecoveredFiles = unique(
    journal.operations
      .filter((operation) => operation.unrecovered || isUnrecoveredApply(operation))
      .map((operation) => operation.targetPath),
  );
  const recoveryCandidateFiles = unique(
    journal.operations
      .filter((operation) => operation.recoveryCandidate)
      .map((operation) => operation.targetPath),
  );
  const writerStarted = journal.operations.some(
    (operation) => operation.writerStarted,
  );
  const hasPartialApply =
    changedFiles.length > 0 && failedFiles.length > 0;

  return {
    routeId: journal.routeId,
    operationCount: journal.operations.length,
    operationKinds,
    plannedFiles,
    changedFiles,
    failedFiles,
    verifiedFiles,
    recoveredFiles,
    unrecoveredFiles,
    recoveryCandidateFiles,
    writerStarted,
    hasPartialApply,
    hasUnrecoveredApply: unrecoveredFiles.length > 0,
    rollbackAtomicityClaim:
      routeScopedEditJournalBoundaryFacts.rollbackAtomicityClaim,
    writeCapability: routeScopedEditJournalBoundaryFacts.writeCapability,
    evidence: [...routeScopedEditJournalBoundaryFacts.evidence],
  };
}

function isUnrecoveredApply(
  operation: RouteScopedEditJournalOperation,
): boolean {
  return Boolean(
    operation.applied &&
      operation.failed &&
      !operation.recovered &&
      operation.failureClass === "post-write-verification",
  );
}

function defaultFailureReason(
  failureClass: RouteScopedEditJournalFailureClass,
): string {
  switch (failureClass) {
    case "preflight":
      return "operation preflight failed before writer start";
    case "write-application":
      return "writer failed before a verified apply";
    case "post-write-verification":
      return "post-write verification failed after writer apply";
    case "recovery-unavailable":
      return "recovery is not available for this journal prototype";
    case "recovery-failed":
      return "recovery failed and the operation remains unrecovered";
  }
}

function unique<T>(items: readonly T[]): readonly T[] {
  return [...new Set(items)];
}
