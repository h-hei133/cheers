import type { RouteScopedEditJournalRecoveryBlocker } from "../metadata/boundary.js";
import type { JournalDurableAuthorityDescriptor } from "../authority/durable.js";
import type { JournalFailureStateProjection } from "../failure/state.js";
import type { OriginalContentAuthorityProjection } from "../authority/original.js";
import type { JournalRecoveryReadinessProjection } from "./readiness.js";

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
  readonly durableAuthority: JournalDurableAuthorityDescriptor;
  readonly originalContentAuthority: OriginalContentAuthorityProjection;
  readonly recoveryReadiness: JournalRecoveryReadinessProjection;
  readonly evidence: readonly string[];
}

export type { JournalFailureStateProjection };
