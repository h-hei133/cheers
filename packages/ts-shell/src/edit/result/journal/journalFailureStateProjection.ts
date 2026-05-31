import type {
  RouteScopedEditJournal,
  RouteScopedEditJournalOperation,
} from "../../../orchestration/patchResult/routeScopedEditJournal.js";

export type JournalFailureApplicationState =
  | "failed-before-apply"
  | "applied-but-unverified"
  | "applied-and-verified-before-later-failure"
  | "unknown-application-state";

export interface JournalFailureStateProjection {
  readonly failedBeforeApplyFiles: readonly string[];
  readonly appliedButUnverifiedFiles: readonly string[];
  readonly appliedAndVerifiedBeforeLaterFailureFiles: readonly string[];
  readonly unknownApplicationStateFiles: readonly string[];
  readonly evidence: readonly string[];
}

export function projectJournalFailureState(
  journal: RouteScopedEditJournal,
): JournalFailureStateProjection {
  const failedBeforeApplyFiles: string[] = [];
  const appliedButUnverifiedFiles: string[] = [];
  const unknownApplicationStateFiles: string[] = [];
  const firstFailureIndex = journal.operations.findIndex(
    (operation) => operation.failed,
  );
  const appliedAndVerifiedBeforeLaterFailureFiles =
    firstFailureIndex > 0
      ? journal.operations
          .slice(0, firstFailureIndex)
          .filter((operation) => operation.applied && operation.verified)
          .map((operation) => operation.targetPath)
      : [];

  for (const operation of journal.operations) {
    if (!operation.failed) {
      continue;
    }

    switch (classifyFailedOperation(operation)) {
      case "failed-before-apply":
        failedBeforeApplyFiles.push(operation.targetPath);
        break;
      case "applied-but-unverified":
        appliedButUnverifiedFiles.push(operation.targetPath);
        break;
      case "unknown-application-state":
        unknownApplicationStateFiles.push(operation.targetPath);
        break;
      case "applied-and-verified-before-later-failure":
        break;
    }
  }

  return {
    failedBeforeApplyFiles: unique(failedBeforeApplyFiles),
    appliedButUnverifiedFiles: unique(appliedButUnverifiedFiles),
    appliedAndVerifiedBeforeLaterFailureFiles: unique(
      appliedAndVerifiedBeforeLaterFailureFiles,
    ),
    unknownApplicationStateFiles: unique(unknownApplicationStateFiles),
    evidence: [
      "route-scoped-edit-journal-failure-state:projection-only",
      "route-scoped-edit-journal-failure-state:no-file-read",
      "route-scoped-edit-journal-failure-state:no-writer",
    ],
  };
}

function classifyFailedOperation(
  operation: RouteScopedEditJournalOperation,
): JournalFailureApplicationState {
  if (operation.failureClass === "post-write-verification") {
    return "applied-but-unverified";
  }

  if (
    operation.failureClass === "preflight" ||
    operation.failureClass === "write-application"
  ) {
    return "failed-before-apply";
  }

  if (!operation.applied && !operation.verified) {
    return "failed-before-apply";
  }

  return "unknown-application-state";
}

function unique(items: readonly string[]): readonly string[] {
  return [...new Set(items)];
}
