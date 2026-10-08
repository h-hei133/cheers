import path from "node:path";
import { prepareRecoveryRestore, type RestorePrimitiveBlockedReason } from "./restorePrimitive.js";
import { inspectWorkspaceFile, matchesFileState } from "../authority/state.js";
import {
  normalizeWorkspaceRelativePath,
} from "./recoveryAuthorityStore.js";
import {
  listRecoveryAuthorityRecords,
  type RecoveryAuthorityRecordIndexEntry,
} from "./recoveryAuthorityIndex.js";

export type RestorePreviewBlockedReason = RestorePrimitiveBlockedReason;

export interface RestorePreviewFile {
  readonly recordId: string;
  readonly workspaceRelativePath: string;
  readonly operationKind: RecoveryAuthorityRecordIndexEntry["operationKind"];
  readonly beforeState: RecoveryAuthorityRecordIndexEntry["beforeState"];
  readonly expectedCurrentState: RecoveryAuthorityRecordIndexEntry["expectedCurrentState"];
  readonly createdAt: string;
}

export interface RestorePreviewBlockedFile extends RestorePreviewFile {
  readonly blockedReason: RestorePreviewBlockedReason;
}

export interface RestorePreviewResult {
  readonly canAttemptExplicitRestore: boolean;
  readonly cannotRestoreReasons: readonly string[];
  readonly restorableFiles: readonly RestorePreviewFile[];
  readonly blockedFiles: readonly RestorePreviewBlockedFile[];
  readonly inspectedFiles: readonly string[];
  readonly missingRecords: readonly string[];
  readonly currentContentMismatches: readonly string[];
  readonly pathBoundaryFailures: readonly string[];
  readonly evidence: readonly string[];
}

export async function previewRecoveryAuthorityRestore(input: {
  readonly ledgerRoot: string;
  readonly authorityId: string;
  readonly workspaceRoot: string;
  readonly recordIds: readonly string[];
  readonly assertFileAccess?: (absolutePath: string) => void;
}): Promise<RestorePreviewResult> {
  const index = await listRecoveryAuthorityRecords({
    ledgerRoot: input.ledgerRoot,
    authorityId: input.authorityId,
    recordIds: input.recordIds,
  });

  if (index.status === "blocked") {
    return {
      canAttemptExplicitRestore: false,
      cannotRestoreReasons: [index.blockedReason],
      restorableFiles: [],
      blockedFiles: [],
      inspectedFiles: [],
      missingRecords: [...input.recordIds],
      currentContentMismatches: [],
      pathBoundaryFailures: [],
      evidence: [
        ...index.evidence,
        "restore-preview:blocked-before-workspace-inspection",
        "restore-preview:no-restore-execution",
        "restore-preview:no-rollback",
      ],
    };
  }

  const restorableFiles: RestorePreviewFile[] = [];
  const blockedFiles: RestorePreviewBlockedFile[] = [];
  const inspectedFiles: string[] = [];
  const currentContentMismatches: string[] = [];
  const pathBoundaryFailures: string[] = [];

  for (const record of index.records) {
    const previewFile = toPreviewFile(record);
    const relativePath = normalizeWorkspaceRelativePath(
      record.workspaceRelativePath,
    );
    if (!relativePath) {
      blockedFiles.push({
        ...previewFile,
        blockedReason: "invalid-workspace-relative-path",
      });
      pathBoundaryFailures.push(record.workspaceRelativePath);
      continue;
    }

    const absolutePath = path.resolve(input.workspaceRoot, relativePath);
    if (!pathStaysInsideWorkspace(input.workspaceRoot, absolutePath)) {
      blockedFiles.push({
        ...previewFile,
        blockedReason: "workspace-boundary",
      });
      pathBoundaryFailures.push(relativePath);
      continue;
    }

    inspectedFiles.push(relativePath);
    if (record.beforeState === "exists" && !record.hasContentBlob) {
      blockedFiles.push({
        ...previewFile,
        blockedReason: "original-content-missing",
      });
      continue;
    }

    try {
      const prepared = await prepareRecoveryRestore({ ...input, recordId: record.recordId, workspaceRelativePath: relativePath });
      const current = inspectWorkspaceFile(input.workspaceRoot, relativePath, input.assertFileAccess);
      if (!matchesFileState(current, prepared.expected)) {
        blockedFiles.push({ ...previewFile, blockedReason: current.state !== prepared.expected.state ? 'current-state-mismatch' : 'current-content-hash-mismatch' });
        currentContentMismatches.push(relativePath);
        continue;
      }
    } catch (error) {
      const reason = error instanceof Error && 'reason' in error ? error.reason as RestorePrimitiveBlockedReason : 'file-system-error';
      blockedFiles.push({ ...previewFile, blockedReason: reason });
      continue;
    }

    restorableFiles.push(previewFile);
  }

  const cannotRestoreReasons = [
    ...new Set([
      ...blockedFiles.map((file) => file.blockedReason),
      ...(index.missingRecords.length > 0 ? ["record-not-found"] : []),
    ]),
  ];

  return {
    canAttemptExplicitRestore: restorableFiles.length > 0,
    cannotRestoreReasons,
    restorableFiles,
    blockedFiles,
    inspectedFiles,
    missingRecords: [...index.missingRecords],
    currentContentMismatches,
    pathBoundaryFailures,
    evidence: [
      ...index.evidence,
      "restore-preview:explicit-call",
      "restore-preview:current-content-guard-inspected",
      "restore-preview:no-write",
      "restore-preview:no-restore-execution",
      "restore-preview:no-automatic-recovery",
      "restore-preview:no-rollback",
    ],
  };
}

function toPreviewFile(
  record: RecoveryAuthorityRecordIndexEntry,
): RestorePreviewFile {
  return {
    recordId: record.recordId,
    workspaceRelativePath: record.workspaceRelativePath,
    operationKind: record.operationKind,
    beforeState: record.beforeState,
    expectedCurrentState: record.expectedCurrentState,
    createdAt: record.createdAt,
  };
}

function pathStaysInsideWorkspace(
  workspaceRoot: string,
  candidatePath: string,
): boolean {
  const root = path.resolve(workspaceRoot);
  const resolved = path.resolve(candidatePath);
  const relative = path.relative(root, resolved);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}
