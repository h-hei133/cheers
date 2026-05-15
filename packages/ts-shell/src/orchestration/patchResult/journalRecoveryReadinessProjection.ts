import {
  buildCurrentJournalDurableAuthority,
  type JournalDurableAuthorityDescriptor,
} from "./journalDurableAuthority.js";
import {
  projectOriginalContentAuthority,
  type OriginalContentAuthorityProjection,
} from "./journalOriginalContentAuthority.js";
import type { JournalRecoveryPlanProjection } from "./journalRecoveryPlanProjection.js";
import type { RouteScopedEditJournal } from "./routeScopedEditJournal.js";

export interface JournalRecoveryReadinessProjection {
  readonly recoveryPlanMode: "plan-only";
  readonly authorityKind: JournalDurableAuthorityDescriptor["authorityKind"];
  readonly authorityAvailability: JournalDurableAuthorityDescriptor["availability"];
  readonly persistence: JournalDurableAuthorityDescriptor["persistence"];
  readonly canRecover: false;
  readonly canRollback: false;
  readonly canRestoreOriginalContent: false;
  readonly requiresDurableAuthority: boolean;
  readonly originalContentRequirements: OriginalContentAuthorityProjection["requirements"];
  readonly restoreEligibility: OriginalContentAuthorityProjection["restoreEligibility"];
  readonly blockers: readonly string[];
  readonly evidence: readonly string[];
}

export function projectJournalRecoveryReadiness(input: {
  readonly journal: RouteScopedEditJournal;
  readonly recoveryPlan: Pick<
    JournalRecoveryPlanProjection,
    "mode" | "blockers" | "evidence"
  >;
  readonly durableAuthority?: JournalDurableAuthorityDescriptor;
}): JournalRecoveryReadinessProjection {
  const durableAuthority =
    input.durableAuthority ?? buildCurrentJournalDurableAuthority();
  const originalContentAuthority = projectOriginalContentAuthority({
    journal: input.journal,
  });
  const blockers = unique([
    ...input.recoveryPlan.blockers,
    ...durableAuthority.blockers,
    ...originalContentAuthority.restoreEligibility.blockers,
  ]);

  return {
    recoveryPlanMode: input.recoveryPlan.mode,
    authorityKind: durableAuthority.authorityKind,
    authorityAvailability: durableAuthority.availability,
    persistence: durableAuthority.persistence,
    canRecover: false,
    canRollback: false,
    canRestoreOriginalContent: false,
    requiresDurableAuthority: true,
    originalContentRequirements: [
      ...originalContentAuthority.requirements,
    ],
    restoreEligibility: originalContentAuthority.restoreEligibility,
    blockers,
    evidence: [
      "journal-recovery-readiness:projection-only",
      "journal-recovery-readiness:no-file-io",
      "journal-recovery-readiness:no-persistence",
      "journal-recovery-readiness:no-recovery-execution",
      "journal-recovery-readiness:no-rollback",
      ...durableAuthority.evidence,
      ...originalContentAuthority.evidence,
      ...input.recoveryPlan.evidence,
    ],
  };
}

function unique(items: readonly string[]): readonly string[] {
  return [...new Set(items)];
}
