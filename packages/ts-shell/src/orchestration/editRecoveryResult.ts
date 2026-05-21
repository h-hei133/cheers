import type { RecoverySurfaceSummary } from "./patchRecovery/recoverySurfaceProjection.js";
import type { EditSnapshotReceipt } from "./editSnapshot.js";

export type EditRecoverySnapshotState =
  | "snapshot-created"
  | "snapshot-not-needed-no-write"
  | "snapshot-failed-no-mutation";

export type EditRollbackReadiness =
  | "rollback-available"
  | "rollback-not-needed-success"
  | "rollback-not-run"
  | "rollback-not-supported"
  | "rollback-blocked-stale-target"
  | "rollback-failed";

export interface EditRecoveryResult {
  readonly snapshotState: EditRecoverySnapshotState;
  readonly rollbackReadiness: EditRollbackReadiness;
  readonly rollbackPlanProjected: boolean;
  readonly automaticRollback: false;
  readonly terminalSummary: string;
  readonly continuationSummary: string;
  readonly verifierMarker: string;
  readonly evidence: readonly string[];
}

export function projectEditRecoveryResult(input: {
  readonly routeStatus: "written" | "blocked";
  readonly terminalClassification: "success" | "stopped" | "error";
  readonly snapshotReceipt: EditSnapshotReceipt;
  readonly recoverySurface?: RecoverySurfaceSummary;
}): EditRecoveryResult {
  const rollbackReadiness = classifyRollbackReadiness(input);
  const target = input.snapshotReceipt.targetPath ?? "(edit target)";
  return {
    snapshotState: input.snapshotReceipt.status,
    rollbackReadiness,
    rollbackPlanProjected:
      rollbackReadiness === "rollback-available" ||
      Boolean(input.recoverySurface?.explicitRestoreAvailable),
    automaticRollback: false,
    terminalSummary: terminalSummary({
      target,
      snapshotState: input.snapshotReceipt.status,
      rollbackReadiness,
    }),
    continuationSummary: continuationSummary({
      target,
      snapshotState: input.snapshotReceipt.status,
      rollbackReadiness,
    }),
    verifierMarker: `edit-recovery:${rollbackReadiness}`,
    evidence: [
      `edit-recovery-snapshot:${input.snapshotReceipt.status}`,
      `edit-recovery-rollback:${rollbackReadiness}`,
      "edit-recovery:automatic-rollback:false",
      input.recoverySurface?.explicitRestoreAvailable
        ? "edit-recovery:explicit-restore-available"
        : "edit-recovery:explicit-restore-unavailable",
      input.recoverySurface?.atomicRollbackAvailable
        ? "edit-recovery:unexpected-atomic-rollback"
        : "edit-recovery:no-atomic-rollback",
      "edit-recovery:no-raw-content",
    ],
  };
}

function classifyRollbackReadiness(input: {
  readonly routeStatus: "written" | "blocked";
  readonly terminalClassification: "success" | "stopped" | "error";
  readonly snapshotReceipt: EditSnapshotReceipt;
  readonly recoverySurface?: RecoverySurfaceSummary;
}): EditRollbackReadiness {
  if (input.snapshotReceipt.status === "snapshot-failed-no-mutation") {
    return "rollback-not-supported";
  }
  if (input.snapshotReceipt.status === "snapshot-not-needed-no-write") {
    return "rollback-not-run";
  }
  if (input.routeStatus === "written") {
    return "rollback-not-needed-success";
  }
  if (
    input.terminalClassification === "error" &&
    input.recoverySurface?.explicitRestoreAvailable
  ) {
    return "rollback-available";
  }
  return "rollback-not-run";
}

function terminalSummary(input: {
  readonly target: string;
  readonly snapshotState: EditRecoverySnapshotState;
  readonly rollbackReadiness: EditRollbackReadiness;
}): string {
  if (input.snapshotState === "snapshot-created") {
    return `Snapshot: pre-write receipt captured for ${input.target}; rollback readiness=${input.rollbackReadiness}; automatic rollback=no.`;
  }
  if (input.snapshotState === "snapshot-failed-no-mutation") {
    return `Snapshot: capture failed before mutation; rollback readiness=${input.rollbackReadiness}; automatic rollback=no.`;
  }
  return `Snapshot: not created because no writer ran; rollback readiness=${input.rollbackReadiness}; automatic rollback=no.`;
}

function continuationSummary(input: {
  readonly target: string;
  readonly snapshotState: EditRecoverySnapshotState;
  readonly rollbackReadiness: EditRollbackReadiness;
}): string {
  return `edit recovery target=${input.target}; snapshot=${input.snapshotState}; rollback=${input.rollbackReadiness}; automatic-rollback=false; raw-content-excluded=true`;
}
