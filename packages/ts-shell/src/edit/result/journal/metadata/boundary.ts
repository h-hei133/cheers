export type RouteScopedEditJournalRecoveryBlocker =
  | "metadata-only-journal"
  | "no-durable-snapshot"
  | "no-original-content"
  | "no-recovery-executor"
  | "no-atomicity-authority"
  | "no-persistence-authority";
