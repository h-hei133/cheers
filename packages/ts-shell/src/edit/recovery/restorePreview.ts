import fs from "node:fs/promises";
import path from "node:path";
import {
  hashContent,
  normalizeWorkspaceRelativePath,
  readRecoveryAuthorityRecord,
} from "./recoveryAuthorityStore.js";
import {
  listRecoveryAuthorityRecords,
  type RecoveryAuthorityRecordIndexEntry,
} from "./recoveryAuthorityIndex.js";

export type RestorePreviewBlockedReason =
  | "record-not-found"
  | "invalid-workspace-relative-path"
  | "record-path-mismatch"
  | "workspace-boundary"
  | "original-content-missing"
  | "current-state-mismatch"
  | "current-content-hash-mismatch"
  | "file-system-error";

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

    const stored = await readRecoveryAuthorityRecord({
      ledgerRoot: input.ledgerRoot,
      authorityId: input.authorityId,
      recordId: record.recordId,
    });
    const expectedCurrentContentHash = stored?.expectedCurrentContentHash;
    const current = await inspectCurrentContent(absolutePath);
    if (
      (record.expectedCurrentState === "exists" &&
        current.state !== "exists") ||
      (record.expectedCurrentState === "absent" && current.state !== "absent")
    ) {
      blockedFiles.push({
        ...previewFile,
        blockedReason: "current-state-mismatch",
      });
      currentContentMismatches.push(relativePath);
      continue;
    }
    if (
      current.state === "exists" &&
      expectedCurrentContentHash &&
      hashContent(current.content) !== expectedCurrentContentHash
    ) {
      blockedFiles.push({
        ...previewFile,
        blockedReason: "current-content-hash-mismatch",
      });
      currentContentMismatches.push(relativePath);
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

async function inspectCurrentContent(
  absolutePath: string,
): Promise<
  | { readonly state: "exists"; readonly content: string }
  | { readonly state: "absent" }
> {
  try {
    const stat = await fs.stat(absolutePath);
    if (!stat.isFile()) {
      return { state: "absent" };
    }
    return {
      state: "exists",
      content: await fs.readFile(absolutePath, "utf8"),
    };
  } catch {
    return { state: "absent" };
  }
}

function pathStaysInsideWorkspace(
  workspaceRoot: string,
  candidatePath: string,
): boolean {
  const root = path.resolve(workspaceRoot);
  const resolved = path.resolve(candidatePath);
  const relative = path.relative(root, resolved);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
