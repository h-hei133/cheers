import { journalFailureSurfaceBoundaryFacts } from "../metadata/boundary.js";
import {
  projectJournalRecoveryPlan,
  type JournalRecoveryPlanProjection,
} from "../recovery/plan.js";
import {
  projectRouteScopedEditJournal,
  type RouteScopedEditJournal,
  type RouteScopedEditJournalFailureClass,
  type RouteScopedEditJournalOperationKind,
} from "../../../../orchestration/patchResult/routeScopedEditJournal.js";

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

export function projectJournalFailureSurface(
  journal: RouteScopedEditJournal,
): JournalFailureSurfaceProjection {
  const projection = projectRouteScopedEditJournal(journal);

  return {
    source: "route-scoped-edit-journal",
    routeId: projection.routeId,
    operationCount: projection.operationCount,
    operationKinds: [...projection.operationKinds],
    plannedFiles: [...projection.plannedFiles],
    changedFiles: [...projection.changedFiles],
    failedFiles: projection.failedFiles.map((failure) => ({ ...failure })),
    verifiedFiles: [...projection.verifiedFiles],
    unrecoveredFiles: [...projection.unrecoveredFiles],
    recoveryCandidateFiles: [...projection.recoveryCandidateFiles],
    writerStarted: projection.writerStarted,
    hasPartialApply: projection.hasPartialApply,
    hasUnrecoveredApply: projection.hasUnrecoveredApply,
    rollbackAtomicityClaim:
      journalFailureSurfaceBoundaryFacts.rollbackAtomicityClaim,
    recoveryExecuted: journalFailureSurfaceBoundaryFacts.recoveryExecuted,
    writeCapability: journalFailureSurfaceBoundaryFacts.writeCapability,
    recoveryPlan: projectJournalRecoveryPlan(journal),
    evidence: [
      ...projection.evidence,
      ...journalFailureSurfaceBoundaryFacts.evidence,
    ],
  };
}
