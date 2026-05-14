export const routeScopedEditJournalBoundaryEvidence = [
  "route-scoped-edit-journal:metadata-only",
  "route-scoped-edit-journal:no-runtime-writer",
  "route-scoped-edit-journal:no-rollback-atomicity-claim",
] as const;

export const journalFailureSurfaceBoundaryEvidence = [
  "route-scoped-edit-journal-result:failure-surface-only",
  "route-scoped-edit-journal-result:recovery-not-executed",
] as const;

export const routeScopedEditJournalBoundaryFacts = {
  rollbackAtomicityClaim: false,
  writeCapability: "metadata-only",
  evidence: routeScopedEditJournalBoundaryEvidence,
} as const;

export const journalFailureSurfaceBoundaryFacts = {
  rollbackAtomicityClaim: false,
  recoveryExecuted: false,
  writeCapability: "metadata-only",
  evidence: journalFailureSurfaceBoundaryEvidence,
} as const;
