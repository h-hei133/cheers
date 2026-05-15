import type {
  RecoveryAuthorityCaptureBatchResult,
  RecoveryAuthorityStoredRecord,
} from "./recoveryAuthorityStore.js";

export type RecoverySurfaceAction =
  | "inspect-authority"
  | "preview-restore"
  | "execute-explicit-restore"
  | "none";

export interface RecoverySurfaceSummary {
  readonly recoveryAvailable: boolean;
  readonly explicitRestoreAvailable: boolean;
  readonly automaticRecoveryAvailable: false;
  readonly atomicRollbackAvailable: false;
  readonly recoveryExecuted: false;
  readonly restorableFiles: readonly string[];
  readonly blockedFiles: readonly {
    readonly path: string;
    readonly reason: string;
  }[];
  readonly recoveryAuthorityId?: string;
  readonly routeId?: string;
  readonly recoveryAction: RecoverySurfaceAction;
  readonly userFacingMessage: string;
  readonly evidence: readonly string[];
}

export function projectRecoverySurfaceSummary(input: {
  readonly routeId?: string;
  readonly recoveryAuthorityCapture?: RecoveryAuthorityCaptureBatchResult;
}): RecoverySurfaceSummary {
  const capture = input.recoveryAuthorityCapture;
  if (!capture || capture.status === "disabled") {
    return unavailable({
      routeId: input.routeId,
      reason: "no-captured-recovery-authority",
      evidence: capture?.evidence ?? [],
    });
  }

  if (capture.status === "blocked") {
    return unavailable({
      routeId: input.routeId,
      reason: capture.blockedReason,
      evidence: capture.evidence,
    });
  }

  const restorableRecords = capture.records.filter(canAttemptExplicitRestore);
  const blockedRecords = capture.records.filter(
    (record) => !canAttemptExplicitRestore(record),
  );
  const authorityId = capture.records[0]?.authorityId;

  return {
    recoveryAvailable: restorableRecords.length > 0,
    explicitRestoreAvailable: restorableRecords.length > 0,
    automaticRecoveryAvailable: false,
    atomicRollbackAvailable: false,
    recoveryExecuted: false,
    restorableFiles: restorableRecords.map(
      (record) => record.workspaceRelativePath,
    ),
    blockedFiles: blockedRecords.map((record) => ({
      path: record.workspaceRelativePath,
      reason:
        record.beforeState === "exists" && !record.beforeContentRef
          ? "original-content-missing"
          : "not-restorable-from-captured-authority",
    })),
    ...(authorityId ? { recoveryAuthorityId: authorityId } : {}),
    ...(input.routeId ? { routeId: input.routeId } : {}),
    recoveryAction:
      restorableRecords.length > 0 ? "preview-restore" : "inspect-authority",
    userFacingMessage:
      restorableRecords.length > 0
        ? "Explicit guarded restore may be available for captured recovery authority. No automatic recovery ran."
        : "Recovery authority was captured, but no file is currently restorable from the captured metadata.",
    evidence: [
      ...capture.evidence,
      "recovery-surface:captured-authority-summary",
      "recovery-surface:explicit-restore-only",
      "recovery-surface:no-automatic-recovery",
      "recovery-surface:no-rollback",
      "recovery-surface:recovery-executed:false",
    ],
  };
}

function unavailable(input: {
  readonly routeId?: string;
  readonly reason: string;
  readonly evidence: readonly string[];
}): RecoverySurfaceSummary {
  return {
    recoveryAvailable: false,
    explicitRestoreAvailable: false,
    automaticRecoveryAvailable: false,
    atomicRollbackAvailable: false,
    recoveryExecuted: false,
    restorableFiles: [],
    blockedFiles: [
      {
        path: "(recovery-authority)",
        reason: input.reason,
      },
    ],
    ...(input.routeId ? { routeId: input.routeId } : {}),
    recoveryAction: "none",
    userFacingMessage:
      "No explicit restore is available because no captured recovery authority is available.",
    evidence: [
      ...input.evidence,
      "recovery-surface:no-captured-authority",
      "recovery-surface:no-automatic-recovery",
      "recovery-surface:no-rollback",
      "recovery-surface:recovery-executed:false",
    ],
  };
}

function canAttemptExplicitRestore(
  record: RecoveryAuthorityStoredRecord,
): boolean {
  return record.beforeState === "absent" || Boolean(record.beforeContentRef);
}
