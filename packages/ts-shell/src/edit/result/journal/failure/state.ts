

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
