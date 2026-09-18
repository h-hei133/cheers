import {
  listRecoveryAuthorityRecords,
  type RecoveryAuthorityRecordIndexEntry,
} from "./recoveryAuthorityIndex.js";
import { restoreRecoveryAuthorityRecord } from "./restorePrimitive.js";
import {
  previewRecoveryAuthorityRestore,
  type RestorePreviewBlockedFile,
  type RestorePreviewFile,
  type RestorePreviewResult,
} from "./restorePreview.js";

export type RestoreExecutionMode = "preview" | "execute";

export interface RestoreExecutionBridgeResult {
  readonly mode: RestoreExecutionMode;
  readonly executed: boolean;
  readonly restoredFiles: readonly string[];
  readonly blockedFiles: readonly RestorePreviewBlockedFile[];
  readonly inspectedFiles: readonly string[];
  readonly skippedFiles: readonly RestorePreviewFile[];
  readonly missingRecords: readonly string[];
  readonly rollbackAtomicityClaim: false;
  readonly automaticRecovery: false;
  readonly evidence: readonly string[];
}

export async function runExplicitRestoreBridge(input: {
  readonly mode: RestoreExecutionMode;
  readonly ledgerRoot: string;
  readonly authorityId: string;
  readonly workspaceRoot: string;
  readonly recordSelection: readonly string[] | "all";
}): Promise<RestoreExecutionBridgeResult> {
  const selectedRecordIds =
    input.recordSelection === "all"
      ? await allRecordIds(input)
      : [...input.recordSelection];
  const preview = await previewRecoveryAuthorityRestore({
    ledgerRoot: input.ledgerRoot,
    authorityId: input.authorityId,
    workspaceRoot: input.workspaceRoot,
    recordIds: selectedRecordIds,
  });

  if (input.mode === "preview") {
    return fromPreview(input.mode, preview, {
      executed: false,
      restoredFiles: [],
      evidence: [
        "restore-execution-bridge:preview-only",
        "restore-execution-bridge:no-write",
      ],
    });
  }

  const restoredFiles: string[] = [];
  const blockedFiles: RestorePreviewBlockedFile[] = [...preview.blockedFiles];
  const skippedFiles: RestorePreviewFile[] = [];

  for (const file of reverseCaptureOrder(preview.restorableFiles)) {
    const result = await restoreRecoveryAuthorityRecord({
      ledgerRoot: input.ledgerRoot,
      authorityId: input.authorityId,
      recordId: file.recordId,
      workspaceRoot: input.workspaceRoot,
      workspaceRelativePath: file.workspaceRelativePath,
    });
    if (result.restored === true) {
      restoredFiles.push(...result.restoredFiles);
      continue;
    }
    if (!("blockedReason" in result)) {
      continue;
    }
    blockedFiles.push({
      ...file,
      blockedReason: result.blockedReason,
    });
    skippedFiles.push(file);
  }

  return {
    mode: "execute",
    executed: restoredFiles.length > 0,
    restoredFiles,
    blockedFiles,
    inspectedFiles: [...new Set([...preview.inspectedFiles])],
    skippedFiles,
    missingRecords: [...preview.missingRecords],
    rollbackAtomicityClaim: false,
    automaticRecovery: false,
    evidence: [
      ...preview.evidence,
      "restore-execution-bridge:explicit-execute",
      "restore-execution-bridge:preview-first",
      "restore-execution-bridge:guarded-primitive-called",
      "restore-execution-bridge:non-atomic-set-restore",
      "restore-execution-bridge:no-automatic-recovery",
      "restore-execution-bridge:no-rollback",
    ],
  };
}

async function allRecordIds(input: {
  readonly ledgerRoot: string;
  readonly authorityId: string;
}): Promise<readonly string[]> {
  const index = await listRecoveryAuthorityRecords({
    ledgerRoot: input.ledgerRoot,
    authorityId: input.authorityId,
  });
  if (index.status === "blocked") {
    return [];
  }
  return index.records.map((record) => record.recordId);
}

function fromPreview(
  mode: RestoreExecutionMode,
  preview: RestorePreviewResult,
  options: {
    readonly executed: boolean;
    readonly restoredFiles: readonly string[];
    readonly evidence: readonly string[];
  },
): RestoreExecutionBridgeResult {
  return {
    mode,
    executed: options.executed,
    restoredFiles: [...options.restoredFiles],
    blockedFiles: [...preview.blockedFiles],
    inspectedFiles: [...preview.inspectedFiles],
    skippedFiles: [...preview.restorableFiles],
    missingRecords: [...preview.missingRecords],
    rollbackAtomicityClaim: false,
    automaticRecovery: false,
    evidence: [
      ...preview.evidence,
      ...options.evidence,
      "restore-execution-bridge:no-automatic-recovery",
      "restore-execution-bridge:no-rollback",
    ],
  };
}

function reverseCaptureOrder(
  files: readonly RestorePreviewFile[],
): readonly RestorePreviewFile[] {
  return [...files].sort((left, right) => {
    const byCreatedAt = right.createdAt.localeCompare(left.createdAt);
    if (byCreatedAt !== 0) {
      return byCreatedAt;
    }
    return right.recordId.localeCompare(left.recordId);
  });
}

export type { RecoveryAuthorityRecordIndexEntry };
