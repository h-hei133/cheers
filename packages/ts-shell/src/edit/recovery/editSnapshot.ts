import path from "node:path";
import { assertProfileStorage } from '../../core/paths/profile/context.js';
import { snapshotRoot } from './root.js';
import {
  hashContent,
  type RecoveryAuthorityCaptureBatchResult,
  type RecoveryAuthorityStoreConfig,
} from "./recoveryAuthorityStore.js";

/**
 * What a snapshot receipt needs from whatever wrote to the workspace.
 *
 * Stated structurally rather than importing the writer's route type: the route
 * lives in the edit lane, and a receipt is only ever after its target path and
 * the recovery capture it produced.
 */
export interface EditSnapshotWorkspaceRouteFacts {
  readonly targetPath?: string;
  readonly recoveryAuthorityCapture?: RecoveryAuthorityCaptureBatchResult;
}

export type EditSnapshotStorageStatus =
  | "project-local"
  | "disabled"
  | "failed";

export type EditSnapshotReceiptStatus =
  | "snapshot-created"
  | "snapshot-not-needed-no-write"
  | "snapshot-failed-no-mutation";

export interface EditSnapshotStorageOptions {
  readonly mode?: "project-local" | "disabled";
  readonly ledgerRoot?: string;
  readonly authorityId?: string;
}

export interface EditSnapshotReceipt {
  readonly status: EditSnapshotReceiptStatus;
  readonly snapshotId?: string;
  readonly targetPath?: string;
  readonly workspaceRootHash?: string;
  readonly preWriteContentHash?: string;
  readonly preWriteSizeBytes?: number;
  readonly preWriteFreshness: "final-stale-read-passed" | "not-applicable";
  readonly storageStatus: EditSnapshotStorageStatus;
  readonly redactionStatus: "raw-content-excluded";
  readonly createdAt?: string;
  readonly cleanupClass: "route-owned-retained" | "not-needed" | "no-residue";
  readonly recoveryAuthorityId?: string;
  readonly recoveryRecordId?: string;
  readonly blocker?: string;
  readonly evidence: readonly string[];
}

export function buildEditSnapshotStoreConfig(input: {
  readonly workspaceRoot: string;
  readonly targetPath: string;
  readonly storage?: EditSnapshotStorageOptions;
}): RecoveryAuthorityStoreConfig {
  if (input.storage?.mode === "disabled") {
    return { mode: "disabled" };
  }
  const ledgerRoot = input.storage?.ledgerRoot ?? snapshotRoot(input.workspaceRoot);
  assertProfileStorage(ledgerRoot);
  return {
    mode: "non-default",
    ledgerRoot,
    authorityId:
      input.storage?.authorityId ?? defaultAuthorityId(input.workspaceRoot, input.targetPath),
  };
}

export function projectEditSnapshotReceipt(input: {
  readonly workspaceRoot?: string;
  readonly targetPath?: string;
  readonly capture?: RecoveryAuthorityCaptureBatchResult;
}): EditSnapshotReceipt {
  const capture = input.capture;
  if (!capture || capture.status === "disabled") {
    return {
      status: "snapshot-not-needed-no-write",
      ...(input.targetPath ? { targetPath: input.targetPath } : {}),
      preWriteFreshness: "not-applicable",
      storageStatus: "disabled",
      redactionStatus: "raw-content-excluded",
      cleanupClass: "no-residue",
      evidence: [
        ...(capture?.evidence ?? []),
        "edit-snapshot:not-needed-no-write",
        "edit-snapshot:no-raw-content",
      ],
    };
  }

  if (capture.status === "blocked") {
    return {
      status: "snapshot-failed-no-mutation",
      ...(input.targetPath ? { targetPath: input.targetPath } : {}),
      ...(input.workspaceRoot ? { workspaceRootHash: safeHash(input.workspaceRoot) } : {}),
      preWriteFreshness: "not-applicable",
      storageStatus: "failed",
      redactionStatus: "raw-content-excluded",
      cleanupClass: "no-residue",
      blocker: capture.blockedReason,
      evidence: [
        ...capture.evidence,
        "edit-snapshot:failed-no-mutation",
        `edit-snapshot:blocker:${capture.blockedReason}`,
        "edit-snapshot:no-raw-content",
      ],
    };
  }

  const record = capture.records[0];
  if (!record) {
    return {
      status: "snapshot-failed-no-mutation",
      ...(input.targetPath ? { targetPath: input.targetPath } : {}),
      ...(input.workspaceRoot ? { workspaceRootHash: safeHash(input.workspaceRoot) } : {}),
      preWriteFreshness: "not-applicable",
      storageStatus: "failed",
      redactionStatus: "raw-content-excluded",
      cleanupClass: "no-residue",
      blocker: "missing-record",
      evidence: [
        ...capture.evidence,
        "edit-snapshot:failed-no-mutation",
        "edit-snapshot:blocker:missing-record",
        "edit-snapshot:no-raw-content",
      ],
    };
  }

  return {
    status: "snapshot-created",
    snapshotId: `${record.authorityId}:${record.recordId}`,
    targetPath: record.workspaceRelativePath,
    ...(input.workspaceRoot ? { workspaceRootHash: safeHash(input.workspaceRoot) } : {}),
    ...(record.beforeContentHash
      ? { preWriteContentHash: record.beforeContentHash }
      : {}),
    ...(record.beforeContentSizeBytes !== undefined
      ? { preWriteSizeBytes: record.beforeContentSizeBytes }
      : {}),
    preWriteFreshness: "final-stale-read-passed",
    storageStatus: "project-local",
    redactionStatus: "raw-content-excluded",
    createdAt: record.createdAt,
    cleanupClass: "route-owned-retained",
    recoveryAuthorityId: record.authorityId,
    recoveryRecordId: record.recordId,
    evidence: [
      ...capture.evidence,
      "edit-snapshot:created-pre-write",
      "edit-snapshot:storage:project-local",
      "edit-snapshot:final-stale-read-passed",
      "edit-snapshot:no-raw-content",
      "edit-snapshot:retention:route-owned",
    ],
  };
}

export function projectEditSnapshotReceiptForWorkspaceRoute(input: {
  readonly workspaceRoot?: string;
  readonly targetPath?: string;
  readonly workspaceRoute?: EditSnapshotWorkspaceRouteFacts;
}): EditSnapshotReceipt {
  return projectEditSnapshotReceipt({
    workspaceRoot: input.workspaceRoot,
    targetPath: input.targetPath ?? input.workspaceRoute?.targetPath,
    capture: input.workspaceRoute?.recoveryAuthorityCapture,
  });
}

export function editSnapshotEvidence(
  receipt: EditSnapshotReceipt,
): readonly string[] {
  return [
    `edit-snapshot-status:${receipt.status}`,
    `edit-snapshot-storage:${receipt.storageStatus}`,
    `edit-snapshot-redaction:${receipt.redactionStatus}`,
    `edit-snapshot-cleanup:${receipt.cleanupClass}`,
    ...(receipt.snapshotId ? ["edit-snapshot-receipt:present"] : []),
    ...(receipt.recoveryAuthorityId
      ? ["edit-snapshot-recovery-authority:present"]
      : []),
    ...receipt.evidence,
  ];
}

function defaultAuthorityId(workspaceRoot: string, targetPath: string): string {
  return `fenced-edit-${hashContent(`${path.resolve(workspaceRoot)}\0${targetPath}\0${Date.now()}\0${Math.random()}`).slice(0, 16)}`;
}

function safeHash(value: string): string {
  return hashContent(path.resolve(value)).slice(0, 16);
}
