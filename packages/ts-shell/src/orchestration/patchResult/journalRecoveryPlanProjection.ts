import {
  journalFailureSurfaceBoundaryFacts,
  routeScopedEditJournalRecoveryBlockers,
  type RouteScopedEditJournalRecoveryBlocker,
} from "./journalMetadataBoundary.js";
import {
  projectJournalFailureState,
  type JournalFailureStateProjection,
} from "./journalFailureStateProjection.js";
import {
  projectRouteScopedEditJournal,
  type RouteScopedEditJournal,
} from "./routeScopedEditJournal.js";

export interface JournalRecoveryPlanProjection {
  readonly source: "route-scoped-edit-journal-recovery-plan";
  readonly mode: "plan-only";
  readonly authority: "metadata-only";
  readonly recoveryExecuted: false;
  readonly rollbackAtomicityClaim: false;
  readonly recoveryCandidateFiles: readonly string[];
  readonly unrecoveredFiles: readonly string[];
  readonly failedBeforeApplyFiles: readonly string[];
  readonly appliedButUnverifiedFiles: readonly string[];
  readonly appliedAndVerifiedBeforeLaterFailureFiles: readonly string[];
  readonly unknownApplicationStateFiles: readonly string[];
  readonly blockers: readonly RouteScopedEditJournalRecoveryBlocker[];
  readonly evidence: readonly string[];
}

export function projectJournalRecoveryPlan(
  journal: RouteScopedEditJournal,
): JournalRecoveryPlanProjection {
  const journalProjection = projectRouteScopedEditJournal(journal);
  const failureState = projectJournalFailureState(journal);

  return {
    source: "route-scoped-edit-journal-recovery-plan",
    mode: "plan-only",
    authority: journalFailureSurfaceBoundaryFacts.writeCapability,
    recoveryExecuted: journalFailureSurfaceBoundaryFacts.recoveryExecuted,
    rollbackAtomicityClaim:
      journalFailureSurfaceBoundaryFacts.rollbackAtomicityClaim,
    recoveryCandidateFiles: [...journalProjection.recoveryCandidateFiles],
    unrecoveredFiles: [...journalProjection.unrecoveredFiles],
    failedBeforeApplyFiles: [...failureState.failedBeforeApplyFiles],
    appliedButUnverifiedFiles: [...failureState.appliedButUnverifiedFiles],
    appliedAndVerifiedBeforeLaterFailureFiles: [
      ...failureState.appliedAndVerifiedBeforeLaterFailureFiles,
    ],
    unknownApplicationStateFiles: [
      ...failureState.unknownApplicationStateFiles,
    ],
    blockers: [...routeScopedEditJournalRecoveryBlockers],
    evidence: [
      "route-scoped-edit-journal-recovery-plan:plan-only",
      "route-scoped-edit-journal-recovery-plan:no-recovery-execution",
      "route-scoped-edit-journal-recovery-plan:no-rollback",
      "route-scoped-edit-journal-recovery-plan:no-snapshot",
      ...failureState.evidence,
      ...journalFailureSurfaceBoundaryFacts.evidence,
    ],
  };
}

export type { JournalFailureStateProjection };
