import {
  hashContent,
  readRecoveryAuthorityRecord,
} from "./patchRecovery/recoveryAuthorityStore.js";
import { applyExplicitSingleFileRollback } from "./editRollback.js";
import type {
  EditRecoveryPlan,
  EditRecoveryPlanTarget,
} from "./editRecoveryPlan.js";
import type { WorkspaceWriteTargetAuthority } from "../edit/authority/workspace.js";
import {
  buildEditRecoveryOutcome,
  outcomeForRestoreBlocker,
  stoppedOutcomeForBlocker,
  type EditRecoveryOutcome,
} from "./editRecoveryOutcome.js";

export type EditRecoveryApplyStatus =
  | "rollback-success"
  | "rollback-stopped"
  | "rollback-partial-failure"
  | "rollback-failed";

export interface EditRecoveryApplyFileResult {
  readonly snapshotId: string;
  readonly targetPath: string;
  readonly status: "restored" | "stopped" | "failed" | "not-run";
  readonly reason?: string;
  readonly verification: "passed" | "failed" | "not-run";
  readonly evidence: readonly string[];
}

export interface EditRecoveryApplyRoute {
  readonly source: "edit-recovery-apply-route";
  readonly status: EditRecoveryApplyStatus;
  readonly plan: EditRecoveryPlan;
  readonly outcome: EditRecoveryOutcome;
  readonly restoredFiles: readonly string[];
  readonly failedFiles: readonly { path: string; reason: string }[];
  readonly fileResults: readonly EditRecoveryApplyFileResult[];
  readonly terminalClassification: "success" | "stopped" | "error";
  readonly postRollbackVerification: "passed" | "failed" | "not-run";
  readonly nextAction: string;
  readonly evidence: readonly string[];
}

export async function runEditRecoveryApplyRoute(input: {
  readonly plan: EditRecoveryPlan;
  readonly ledgerRoot: string;
  readonly workspaceRoot: string;
  readonly explicitRollbackConfirmation: boolean;
  readonly confirmedSnapshotIds: readonly string[];
  readonly validateWriteTarget: (
    relativePath: string,
  ) => WorkspaceWriteTargetAuthority;
  readonly readVerifiedFile: (relativePath: string) => string | undefined;
  readonly maxFiles?: number;
}): Promise<EditRecoveryApplyRoute> {
  if (input.plan.status === "blocked") {
    return stoppedRoute({
      plan: input.plan,
      state: stoppedOutcomeForBlocker(input.plan.blocker),
      reason: input.plan.reason,
      evidence: input.plan.evidence,
    });
  }

  if (!input.explicitRollbackConfirmation) {
    return stoppedRoute({
      plan: input.plan,
      state: "edit-rollback-stopped-confirmation-required",
      reason: "Explicit rollback apply requires direct rollback confirmation.",
      evidence: input.plan.evidence,
    });
  }

  if (input.confirmedSnapshotIds.length === 0) {
    return stoppedRoute({
      plan: input.plan,
      state: "edit-rollback-stopped-missing-snapshot",
      reason: "Explicit rollback apply requires at least one confirmed snapshot id.",
      evidence: input.plan.evidence,
    });
  }

  const maxFiles = input.maxFiles ?? input.plan.maxFiles;
  if (input.confirmedSnapshotIds.length > maxFiles) {
    return stoppedRoute({
      plan: input.plan,
      state: "edit-rollback-stopped-not-supported",
      reason: `Explicit rollback subset has ${input.confirmedSnapshotIds.length} files; max is ${maxFiles}.`,
      evidence: input.plan.evidence,
    });
  }

  const confirmed = new Set(input.confirmedSnapshotIds);
  const selectedTargets = input.plan.targets.filter((target) =>
    confirmed.has(target.snapshotId),
  );
  if (selectedTargets.length !== input.confirmedSnapshotIds.length) {
    return stoppedRoute({
      plan: input.plan,
      state: "edit-rollback-stopped-missing-snapshot",
      reason: "One or more confirmed snapshot ids are not present in the recovery plan.",
      evidence: input.plan.evidence,
    });
  }

  const restoredFiles: string[] = [];
  const failedFiles: Array<{ path: string; reason: string }> = [];
  const fileResults: EditRecoveryApplyFileResult[] = [];

  for (const target of selectedTargets) {
    const result = await applyOneTarget({
      target,
      ledgerRoot: input.ledgerRoot,
      workspaceRoot: input.workspaceRoot,
      validateWriteTarget: input.validateWriteTarget,
      readVerifiedFile: input.readVerifiedFile,
    });
    fileResults.push(result);
    if (result.status === "restored") {
      restoredFiles.push(result.targetPath);
      continue;
    }
    failedFiles.push({
      path: result.targetPath,
      reason: result.reason ?? "Rollback target failed.",
    });
    break;
  }

  const skippedTargets = selectedTargets.slice(fileResults.length);
  for (const target of skippedTargets) {
    failedFiles.push({
      path: target.targetPath,
      reason: "Not run after earlier rollback failure.",
    });
    fileResults.push({
      snapshotId: target.snapshotId,
      targetPath: target.targetPath,
      status: "not-run",
      reason: "Not run after earlier rollback failure.",
      verification: "not-run",
      evidence: [
        `edit-recovery-apply:file:${target.targetPath}:not-run`,
        "edit-recovery-apply:rollback:not-run",
      ],
    });
  }

  const status = classifyApplyStatus({ restoredFiles, failedFiles, fileResults });
  const outcome = buildEditRecoveryOutcome({
    state:
      status === "rollback-success"
        ? "edit-rollback-success"
        : status === "rollback-partial-failure"
          ? "edit-rollback-partial-failure"
          : status === "rollback-failed"
            ? "edit-rollback-failed"
            : stoppedOutcomeForBlocker(fileResults[0]?.reason),
    mutationRan: restoredFiles.length > 0,
    rollbackApplied: restoredFiles.length > 0,
  });
  return {
    source: "edit-recovery-apply-route",
    status,
    plan: input.plan,
    outcome,
    restoredFiles,
    failedFiles,
    fileResults,
    terminalClassification: outcome.terminalClassification,
    postRollbackVerification:
      status === "rollback-success"
        ? "passed"
        : restoredFiles.length > 0
          ? "failed"
          : "not-run",
    nextAction:
      status === "rollback-success"
        ? "Explicit rollback apply completed."
        : restoredFiles.length > 0
          ? "Inspect restored and failed files before retrying rollback."
          : "Fix rollback blockers before retrying explicit rollback apply.",
    evidence: [
      ...input.plan.evidence,
      ...outcome.evidence,
      `edit-recovery-apply:restored-count:${restoredFiles.length}`,
      `edit-recovery-apply:failed-count:${failedFiles.length}`,
      "edit-recovery-apply:explicit-confirmation",
      "edit-recovery-apply:no-automatic-rollback",
      "edit-recovery-apply:no-atomic-rollback",
      "edit-recovery-apply:raw-content-excluded",
      ...fileResults.flatMap((result) => result.evidence),
    ],
  };
}

async function applyOneTarget(input: {
  readonly target: EditRecoveryPlanTarget;
  readonly ledgerRoot: string;
  readonly workspaceRoot: string;
  readonly validateWriteTarget: (
    relativePath: string,
  ) => WorkspaceWriteTargetAuthority;
  readonly readVerifiedFile: (relativePath: string) => string | undefined;
}): Promise<EditRecoveryApplyFileResult> {
  const authority = input.validateWriteTarget(input.target.targetPath);
  if (authority.ok === false) {
    return {
      snapshotId: input.target.snapshotId,
      targetPath: input.target.targetPath,
      status: "stopped",
      reason: authority.reason,
      verification: "not-run",
      evidence: [
        ...authority.evidence,
        `edit-recovery-apply:file:${input.target.targetPath}:authority-blocked`,
        `edit-recovery-apply:blocker:${authority.reason}`,
        "edit-recovery-apply:final-workspace-authority-blocked",
        "edit-recovery-apply:rollback:not-run",
      ],
    };
  }

  const restored = await applyExplicitSingleFileRollback({
    ledgerRoot: input.ledgerRoot,
    authorityId: input.target.authorityId,
    recordId: input.target.recordId,
    workspaceRoot: input.workspaceRoot,
    targetPath: input.target.targetPath,
  });
  if (restored.restored === false) {
    const state = outcomeForRestoreBlocker(restored.blockedReason);
    return {
      snapshotId: input.target.snapshotId,
      targetPath: input.target.targetPath,
      status: state.startsWith("edit-rollback-stopped") ? "stopped" : "failed",
      reason: restored.blockedReason,
      verification: "not-run",
      evidence: [
        ...restored.evidence,
        `edit-recovery-apply:file:${input.target.targetPath}:blocked`,
        `edit-recovery-apply:blocker:${restored.blockedReason}`,
        "edit-recovery-apply:rollback:not-run",
      ],
    };
  }

  const record = await readRecoveryAuthorityRecord({
    ledgerRoot: input.ledgerRoot,
    authorityId: input.target.authorityId,
    recordId: input.target.recordId,
  });
  const verification = verifyRestoredContent({
    target: input.target,
    beforeContentHash: record?.beforeContentHash,
    beforeState: record?.beforeState,
    readVerifiedFile: input.readVerifiedFile,
  });
  return {
    snapshotId: input.target.snapshotId,
    targetPath: input.target.targetPath,
    status: verification === "passed" ? "restored" : "failed",
    ...(verification === "passed"
      ? {}
      : { reason: "post-rollback-verification-failed" }),
    verification,
    evidence: [
      ...restored.evidence,
      `edit-recovery-apply:file:${input.target.targetPath}:restored`,
      `edit-recovery-apply:verification:${verification}`,
      "edit-recovery-apply:rollback-applied",
      "edit-recovery-apply:raw-content-excluded",
    ],
  };
}

function verifyRestoredContent(input: {
  readonly target: EditRecoveryPlanTarget;
  readonly beforeContentHash?: string;
  readonly beforeState?: "exists" | "absent";
  readonly readVerifiedFile: (relativePath: string) => string | undefined;
}): "passed" | "failed" {
  const current = input.readVerifiedFile(input.target.targetPath);
  if (input.beforeState === "absent") {
    return current === undefined ? "passed" : "failed";
  }
  if (!input.beforeContentHash || current === undefined) {
    return "failed";
  }
  return hashContent(current) === input.beforeContentHash ? "passed" : "failed";
}

function classifyApplyStatus(input: {
  readonly restoredFiles: readonly string[];
  readonly failedFiles: readonly { path: string; reason: string }[];
  readonly fileResults: readonly EditRecoveryApplyFileResult[];
}): EditRecoveryApplyStatus {
  if (input.failedFiles.length === 0) {
    return "rollback-success";
  }
  if (input.restoredFiles.length > 0) {
    return "rollback-partial-failure";
  }
  return input.fileResults.some((result) => result.status === "failed")
    ? "rollback-failed"
    : "rollback-stopped";
}

function stoppedRoute(input: {
  readonly plan: EditRecoveryPlan;
  readonly state: ReturnType<typeof stoppedOutcomeForBlocker>;
  readonly reason: string;
  readonly evidence: readonly string[];
}): EditRecoveryApplyRoute {
  const outcome = buildEditRecoveryOutcome({
    state: input.state,
    mutationRan: false,
    rollbackApplied: false,
  });
  return {
    source: "edit-recovery-apply-route",
    status: "rollback-stopped",
    plan: input.plan,
    outcome,
    restoredFiles: [],
    failedFiles: input.plan.blockedTargets.map((target) => ({
      path: target.targetPath ?? "(rollback target)",
      reason: target.reason,
    })),
    fileResults: [],
    terminalClassification: "stopped",
    postRollbackVerification: "not-run",
    nextAction: input.reason,
    evidence: [
      ...input.evidence,
      ...outcome.evidence,
      "edit-recovery-apply:rollback:not-run",
      "edit-recovery-apply:no-writer-invoked",
      "edit-recovery-apply:raw-content-excluded",
    ],
  };
}
