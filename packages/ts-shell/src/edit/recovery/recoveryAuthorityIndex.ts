import fs from "node:fs/promises";
import path from "node:path";
import {
  normalizeWorkspaceRelativePath,
  hashContent,
  readRecoveryAuthorityRecord,
  type RecoveryAuthorityStoredRecord,
} from "./recoveryAuthorityStore.js";

export type RecoveryAuthorityIndexBlockedReason =
  | "ledger-root-required"
  | "authority-id-required"
  | "invalid-id"
  | "namespace-not-found"
  | "record-not-found"
  | "file-system-error";

export interface RecoveryAuthorityRecordIndexEntry {
  /** Identity of every stored metadata field; original file content stays private. */
  readonly recordDigest: string;
  readonly recordId: string;
  readonly authorityId: string;
  readonly workspaceRelativePath: string;
  readonly operationKind: RecoveryAuthorityStoredRecord["operationKind"];
  readonly beforeState: RecoveryAuthorityStoredRecord["beforeState"];
  readonly expectedCurrentState: RecoveryAuthorityStoredRecord["expectedCurrentState"];
  readonly beforeContentHash?: string;
  readonly beforeContentSizeBytes?: number;
  readonly hasContentBlob: boolean;
  readonly createdAt: string;
  readonly schemaVersion: RecoveryAuthorityStoredRecord["schemaVersion"];
}

export type RecoveryAuthorityNamespaceIndexResult =
  | {
      readonly status: "listed";
      readonly authorityIds: readonly string[];
      readonly evidence: readonly string[];
    }
  | {
      readonly status: "blocked";
      readonly blockedReason: RecoveryAuthorityIndexBlockedReason;
      readonly authorityIds: readonly [];
      readonly evidence: readonly string[];
    };

export type RecoveryAuthorityRecordIndexResult =
  | {
      readonly status: "listed";
      readonly authorityId: string;
      readonly records: readonly RecoveryAuthorityRecordIndexEntry[];
      readonly missingRecords: readonly string[];
      readonly evidence: readonly string[];
    }
  | {
      readonly status: "blocked";
      readonly blockedReason: RecoveryAuthorityIndexBlockedReason;
      readonly authorityId?: string;
      readonly records: readonly [];
      readonly missingRecords: readonly string[];
      readonly evidence: readonly string[];
    };

const idPattern = /^[A-Za-z0-9._-]+$/;

export async function listRecoveryAuthorityNamespaces(input: {
  readonly ledgerRoot?: string;
}): Promise<RecoveryAuthorityNamespaceIndexResult> {
  if (!input.ledgerRoot) {
    return blockedNamespaces("ledger-root-required");
  }

  try {
    const entries = await fs.readdir(path.resolve(input.ledgerRoot), {
      withFileTypes: true,
    });
    return {
      status: "listed",
      authorityIds: entries
        .filter((entry) => entry.isDirectory() && idPattern.test(entry.name))
        .map((entry) => entry.name)
        .sort(),
      evidence: [
        "recovery-authority-index:explicit-ledger-root",
        "recovery-authority-index:namespaces-listed",
        "recovery-authority-index:no-workspace-read",
        "recovery-authority-index:no-raw-content",
      ],
    };
  } catch (error) {
    return blockedNamespaces(indexReadFailure(error));
  }
}

export async function listRecoveryAuthorityRecords(input: {
  readonly ledgerRoot?: string;
  readonly authorityId?: string;
  readonly recordIds?: readonly string[];
  readonly signal?: AbortSignal;
}): Promise<RecoveryAuthorityRecordIndexResult> {
  input.signal?.throwIfAborted();
  const config = validateConfig(input);
  if (config.ok === false) {
    return blockedRecords(config.blockedReason, input.authorityId, []);
  }

  const namespaceRoot = path.join(config.ledgerRoot, config.authorityId);
  const recordsRoot = path.join(namespaceRoot, "records");
  let recordIds: readonly string[];
  try {
    if (input.recordIds) {
      recordIds = input.recordIds;
    } else {
      const entries = await fs.readdir(recordsRoot, { withFileTypes: true });
      recordIds = entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .map((entry) => entry.name.slice(0, -".json".length))
        .sort();
    }
  } catch (error) {
    return blockedRecords(indexReadFailure(error), config.authorityId, []);
  }

  if (recordIds.some((recordId) => !idPattern.test(recordId))) {
    return blockedRecords("invalid-id", config.authorityId, []);
  }

  const records: RecoveryAuthorityRecordIndexEntry[] = [];
  const missingRecords: string[] = [];
  for (const recordId of recordIds) {
    input.signal?.throwIfAborted();
    const record = await readRecoveryAuthorityRecord({
      ledgerRoot: config.ledgerRoot,
      authorityId: config.authorityId,
      recordId,
    });
    if (!record) {
      missingRecords.push(recordId);
      continue;
    }
    const normalized = normalizeWorkspaceRelativePath(
      record.workspaceRelativePath,
    );
    if (!normalized) {
      missingRecords.push(recordId);
      continue;
    }
    records.push({
      recordDigest: hashContent(JSON.stringify(record)),
      recordId: record.recordId,
      authorityId: record.authorityId,
      workspaceRelativePath: normalized,
      operationKind: record.operationKind,
      beforeState: record.beforeState,
      expectedCurrentState: record.expectedCurrentState,
      ...(record.beforeContentHash
        ? { beforeContentHash: record.beforeContentHash }
        : {}),
      ...(record.beforeContentSizeBytes !== undefined
        ? { beforeContentSizeBytes: record.beforeContentSizeBytes }
        : {}),
      hasContentBlob: await contentBlobExists(namespaceRoot, record),
      createdAt: record.createdAt,
      schemaVersion: record.schemaVersion,
    });
  }

  input.signal?.throwIfAborted();

  return {
    status: "listed",
    authorityId: config.authorityId,
    records,
    missingRecords,
    evidence: [
      "recovery-authority-index:explicit-ledger-root",
      "recovery-authority-index:records-listed",
      "recovery-authority-index:metadata-only",
      "recovery-authority-index:no-workspace-read",
      "recovery-authority-index:no-raw-content",
    ],
  };
}

function indexReadFailure(error: unknown): RecoveryAuthorityIndexBlockedReason {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
    ? 'namespace-not-found' : 'file-system-error';
}

function validateConfig(input: {
  readonly ledgerRoot?: string;
  readonly authorityId?: string;
}):
  | { readonly ok: true; readonly ledgerRoot: string; readonly authorityId: string }
  | {
      readonly ok: false;
      readonly blockedReason: RecoveryAuthorityIndexBlockedReason;
    } {
  if (!input.ledgerRoot) {
    return { ok: false, blockedReason: "ledger-root-required" };
  }
  if (!input.authorityId) {
    return { ok: false, blockedReason: "authority-id-required" };
  }
  if (!idPattern.test(input.authorityId)) {
    return { ok: false, blockedReason: "invalid-id" };
  }
  return {
    ok: true,
    ledgerRoot: path.resolve(input.ledgerRoot),
    authorityId: input.authorityId,
  };
}

async function contentBlobExists(
  namespaceRoot: string,
  record: RecoveryAuthorityStoredRecord,
): Promise<boolean> {
  if (!record.beforeContentRef) {
    return false;
  }
  try {
    const stat = await fs.stat(path.join(namespaceRoot, record.beforeContentRef));
    return stat.isFile();
  } catch {
    return false;
  }
}

function blockedNamespaces(
  blockedReason: RecoveryAuthorityIndexBlockedReason,
): RecoveryAuthorityNamespaceIndexResult {
  return {
    status: "blocked",
    blockedReason,
    authorityIds: [],
    evidence: [
      "recovery-authority-index:blocked",
      `recovery-authority-index:blocker:${blockedReason}`,
      "recovery-authority-index:no-workspace-read",
    ],
  };
}

function blockedRecords(
  blockedReason: RecoveryAuthorityIndexBlockedReason,
  authorityId: string | undefined,
  missingRecords: readonly string[],
): RecoveryAuthorityRecordIndexResult {
  return {
    status: "blocked",
    blockedReason,
    ...(authorityId ? { authorityId } : {}),
    records: [],
    missingRecords,
    evidence: [
      "recovery-authority-index:blocked",
      `recovery-authority-index:blocker:${blockedReason}`,
      "recovery-authority-index:no-workspace-read",
      "recovery-authority-index:no-raw-content",
    ],
  };
}
