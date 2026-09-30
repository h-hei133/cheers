import type { JournalRecoveryPlanProjection } from "../recovery/plan.js";
import type { RouteScopedEditJournalFailureClass, RouteScopedEditJournalOperationKind } from "../model.js";

export interface JournalFailureSurfaceProjection {
  readonly source: "route-scoped-edit-journal";
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
  readonly unrecoveredFiles: readonly string[];
  readonly recoveryCandidateFiles: readonly string[];
  readonly writerStarted: boolean;
  readonly hasPartialApply: boolean;
  readonly hasUnrecoveredApply: boolean;
  readonly rollbackAtomicityClaim: false;
  readonly recoveryExecuted: false;
  readonly writeCapability: "metadata-only";
  readonly recoveryPlan: JournalRecoveryPlanProjection;
  readonly evidence: readonly string[];
}
