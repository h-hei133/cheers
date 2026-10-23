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
import { previewReadAccess, type RestorePreviewAccess } from './preview/read.js';
import { restoreReadAccess } from './restore/read.js';

export type RestoreExecutionMode = "preview" | "execute";

export interface RestoreExecutionBridgeResult {
  readonly outcome: 'preview' | 'not-executed' | 'restored-verified' | 'partial' | 'unknown';
  readonly unknownFiles: readonly RestorePreviewFile[];
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
  readonly assertFileAccess?: (absolutePath: string) => void;
} & RestorePreviewAccess): Promise<RestoreExecutionBridgeResult> {
  input = { ...input, recordSelection: input.recordSelection === 'all' ? 'all' : [...input.recordSelection] };
  const access = previewReadAccess(input.workspaceRoot, input);
  const assertFileAccess = (absolute: string): void => { access.check(); input.assertFileAccess?.(absolute); access.check(); };
  const selectedRecordIds =
    input.recordSelection === "all"
      ? await allRecordIds(input, access)
      : [...input.recordSelection];
  access.check();
  const preview = await previewRecoveryAuthorityRestore({
    ledgerRoot: input.ledgerRoot,
    authorityId: input.authorityId,
    workspaceRoot: input.workspaceRoot,
    recordIds: selectedRecordIds,
    assertFileAccess,
    signal: input.signal,
    admission: input.admission,
  }, access);
  access.check();

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
  const unknownFiles: RestorePreviewFile[] = [];
  const reads = restoreReadAccess({ workspaceRoot: input.workspaceRoot, abortSignal: input.signal, readAccess: { check: access.check } });

  for (const file of reverseCaptureOrder(preview.restorableFiles)) {
    const result = await restoreRecoveryAuthorityRecord({
      ledgerRoot: input.ledgerRoot,
      authorityId: input.authorityId,
      recordId: file.recordId,
      workspaceRoot: input.workspaceRoot,
      workspaceRelativePath: file.workspaceRelativePath,
      assertFileAccess,
      abortSignal: input.signal,
    }, reads);
    if (result.restored === true) {
      restoredFiles.push(...result.restoredFiles);
      continue;
    }
    if (result.outcome === 'unknown') {
      unknownFiles.push(file);
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
    outcome: unknownFiles.length ? 'unknown' : restoredFiles.length ? (blockedFiles.length || preview.missingRecords.length ? 'partial' : 'restored-verified') : 'not-executed',
    unknownFiles,
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
} & RestorePreviewAccess, access: ReturnType<typeof previewReadAccess>): Promise<readonly string[]> {
  const index = await listRecoveryAuthorityRecords({
    ledgerRoot: input.ledgerRoot,
    authorityId: input.authorityId,
    readAccess: access,
  });
  access.check();
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
    outcome: 'preview',
    unknownFiles: [],
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
