import {
  buildCurrentJournalDurableAuthority,
  type JournalDurableAuthorityDescriptor,
} from "../authority/durable.js";
import {
  projectOriginalContentAuthority,
  type OriginalContentAuthorityProjection,
} from "../authority/original.js";
import type { JournalRecoveryPlanProjection } from "./plan.js";
import type { RouteScopedEditJournal } from "../model.js";

export interface JournalRecoveryReadinessProjection {
  readonly recoveryPlanMode: "plan-only";
  readonly authorityKind: JournalDurableAuthorityDescriptor["authorityKind"];
  readonly authorityAvailability: JournalDurableAuthorityDescriptor["availability"];
  readonly persistence: JournalDurableAuthorityDescriptor["persistence"];
  readonly canRecover: boolean;
  readonly canRollback: false;
  readonly canRestoreOriginalContent: boolean;
  readonly canAttemptExplicitRestore: boolean;
  readonly canRecoverAutomatically: false;
  readonly canRollbackAtomically: false;
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
  readonly originalContentAuthority?: OriginalContentAuthorityProjection;
}): JournalRecoveryReadinessProjection {
  const durableAuthority =
    input.durableAuthority ?? buildCurrentJournalDurableAuthority();
  const originalContentAuthority =
    input.originalContentAuthority ??
    projectOriginalContentAuthority({
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
    canRecover: durableAuthority.canRecover,
    canRollback: false,
    canRestoreOriginalContent: durableAuthority.canRestoreOriginalContent,
    canAttemptExplicitRestore:
      originalContentAuthority.restoreEligibility.canAttemptExplicitRestore,
    canRecoverAutomatically: false,
    canRollbackAtomically: false,
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
