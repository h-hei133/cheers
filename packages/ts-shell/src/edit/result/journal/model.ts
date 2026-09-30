

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
