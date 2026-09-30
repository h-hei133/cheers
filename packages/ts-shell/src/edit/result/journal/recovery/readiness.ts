import type { JournalDurableAuthorityDescriptor } from "../authority/durable.js";
import type { OriginalContentAuthorityProjection } from "../authority/original.js";

export interface JournalRecoveryReadinessProjection {
  readonly recoveryPlanMode: "readiness-only" | "plan-only" | "manual-review";
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
