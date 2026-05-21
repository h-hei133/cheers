import {
  previewRecoveryAuthorityRestore,
  type RestorePreviewResult,
} from "./patchRecovery/restorePreview.js";
import {
  restoreRecoveryAuthorityRecord,
  type RestorePrimitiveResult,
} from "./patchRecovery/restorePrimitive.js";

export type EditRollbackPlanStatus =
  | "rollback-plan-ready"
  | "rollback-plan-blocked";

export interface EditRollbackPlan {
  readonly status: EditRollbackPlanStatus;
  readonly snapshotId: string;
  readonly targetPath: string;
  readonly canApplyExplicitRollback: boolean;
  readonly staleTargetState:
    | "current-target-matches-snapshot-expectation"
    | "changed-since-snapshot"
    | "unknown";
  readonly automaticRollback: false;
  readonly atomicRollback: false;
  readonly restoreMode: "dry-run";
  readonly evidence: readonly string[];
}

export async function projectSingleFileRollbackPlan(input: {
  readonly ledgerRoot: string;
  readonly authorityId: string;
  readonly recordId: string;
  readonly workspaceRoot: string;
  readonly targetPath: string;
}): Promise<EditRollbackPlan> {
  const preview = await previewRecoveryAuthorityRestore({
    ledgerRoot: input.ledgerRoot,
    authorityId: input.authorityId,
    workspaceRoot: input.workspaceRoot,
    recordIds: [input.recordId],
  });
  const snapshotId = `${input.authorityId}:${input.recordId}`;
  const targetIsRestorable = preview.restorableFiles.some(
    (file) => file.recordId === input.recordId && file.workspaceRelativePath === input.targetPath,
  );
  return {
    status: targetIsRestorable ? "rollback-plan-ready" : "rollback-plan-blocked",
    snapshotId,
    targetPath: input.targetPath,
    canApplyExplicitRollback: targetIsRestorable,
    staleTargetState: staleTargetState(preview),
    automaticRollback: false,
    atomicRollback: false,
    restoreMode: "dry-run",
    evidence: [
      ...preview.evidence,
      `edit-rollback-plan:${targetIsRestorable ? "ready" : "blocked"}`,
      "edit-rollback-plan:single-file-only",
      "edit-rollback-plan:dry-run",
      "edit-rollback-plan:no-automatic-rollback",
      "edit-rollback-plan:no-atomic-rollback",
      "edit-rollback-plan:no-raw-content",
    ],
  };
}

export async function applyExplicitSingleFileRollback(input: {
  readonly ledgerRoot: string;
  readonly authorityId: string;
  readonly recordId: string;
  readonly workspaceRoot: string;
  readonly targetPath: string;
}): Promise<RestorePrimitiveResult> {
  return restoreRecoveryAuthorityRecord({
    ledgerRoot: input.ledgerRoot,
    authorityId: input.authorityId,
    recordId: input.recordId,
    workspaceRoot: input.workspaceRoot,
    workspaceRelativePath: input.targetPath,
  });
}

function staleTargetState(
  preview: RestorePreviewResult,
): EditRollbackPlan["staleTargetState"] {
  if (preview.currentContentMismatches.length > 0) {
    return "changed-since-snapshot";
  }
  if (preview.canAttemptExplicitRestore) {
    return "current-target-matches-snapshot-expectation";
  }
  return "unknown";
}
