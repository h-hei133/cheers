import fs from "node:fs/promises";
import path from "node:path";
import { hashContent } from '../authority/content.js';
import { commitWorkspaceFile } from '../authority/commit.js';
import { inspectWorkspaceFile } from '../authority/state.js';
import { prepareLedgerDirectory, readLedgerText, safeRecoveryId, validRecoveryRecord } from './record.js';
export { hashContent } from '../authority/content.js';
import type {
  OriginalContentAuthorityRecord,
  OriginalContentPersistence,
} from "../result/journal/authority/original.js";
import type { RouteScopedEditJournalOperationKind } from "../result/journal/model.js";

export type RecoveryAuthorityStoreMode = "disabled" | "non-default";
export type RecoveryAuthorityBeforeState = "exists" | "absent";
export type RecoveryAuthorityExpectedCurrentState =
  | "exists"
  | "absent"
  | "unknown";

export interface RecoveryAuthorityStoreConfig {
  readonly mode: RecoveryAuthorityStoreMode;
  readonly ledgerRoot?: string;
  readonly authorityId?: string;
}

export interface CaptureRecoveryAuthorityRecordInput
  extends RecoveryAuthorityStoreConfig {
  readonly recordId: string;
  readonly workspaceRelativePath: string;
  readonly operationKind: RouteScopedEditJournalOperationKind;
  readonly beforeState: RecoveryAuthorityBeforeState;
  readonly beforeContent?: string;
  readonly beforeMode?: number;
  readonly expectedCurrentState: RecoveryAuthorityExpectedCurrentState;
  readonly expectedCurrentContent?: string;
  readonly expectedCurrentMode?: number;
  readonly createdAt?: string;
  readonly operation?: RecoveryOperationBinding;
}

export interface RecoveryOperationBinding {
  readonly operationId: string;
  readonly sessionId: string;
  readonly workspaceRoot: string;
  readonly workspaceIdentity: string;
}

export type CaptureRecoveryAuthorityRecordEntry = Omit<
  CaptureRecoveryAuthorityRecordInput,
  keyof RecoveryAuthorityStoreConfig
>;

export interface RecoveryAuthorityStoredRecord {
  readonly operation?: RecoveryOperationBinding;
  readonly schemaVersion: 1;
  readonly authorityId: string;
  readonly recordId: string;
  readonly workspaceRelativePath: string;
  readonly operationKind: RouteScopedEditJournalOperationKind;
  readonly beforeState: RecoveryAuthorityBeforeState;
  readonly beforeContentHash?: string;
  readonly beforeContentSizeBytes?: number;
  readonly beforeMode?: number;
  readonly beforeContentRef?: string;
  readonly expectedCurrentState: RecoveryAuthorityExpectedCurrentState;
  readonly expectedCurrentContentHash?: string;
  readonly expectedCurrentMode?: number;
  readonly capturedAtPhase: "pre-write";
  readonly persistence: "non-default";
  readonly createdAt: string;
  readonly evidence: readonly string[];
}

export type RecoveryAuthorityCaptureResult =
  | {
      readonly status: "disabled";
      readonly blockedReason: "disabled";
      readonly records: readonly [];
      readonly evidence: readonly string[];
    }
  | {
      readonly status: "blocked";
      readonly blockedReason:
        | "ledger-root-required"
        | "authority-id-required"
        | "invalid-id"
        | "invalid-workspace-relative-path"
        | "before-content-required"
        | "content-too-large"
        | "file-system-error";
      readonly records: readonly [];
      readonly message: string;
      readonly evidence: readonly string[];
    }
  | {
      readonly status: "captured";
      readonly records: readonly [RecoveryAuthorityStoredRecord];
      readonly evidence: readonly string[];
    };

export type RecoveryAuthorityCaptureBatchResult =
  | {
      readonly status: "disabled";
      readonly blockedReason: "disabled";
      readonly records: readonly [];
      readonly evidence: readonly string[];
    }
  | {
      readonly status: "blocked";
      readonly blockedReason: Extract<
        RecoveryAuthorityCaptureResult,
        { status: "blocked" }
      >["blockedReason"];
      readonly records: readonly [];
      readonly message: string;
      readonly evidence: readonly string[];
    }
  | {
      readonly status: "captured";
      readonly records: readonly RecoveryAuthorityStoredRecord[];
      readonly evidence: readonly string[];
    };

export interface RecoveryAuthorityCleanupResult {
  readonly cleaned: boolean;
  readonly recordId?: string;
  readonly evidence: readonly string[];
}

const schemaVersion = 1;

export async function captureRecoveryAuthorityRecord(
  input: CaptureRecoveryAuthorityRecordInput,
): Promise<RecoveryAuthorityCaptureResult> {
  if (input.mode === "disabled") {
    return {
      status: "disabled",
      blockedReason: "disabled",
      records: [],
      evidence: [
        "recovery-authority-store:disabled",
        "recovery-authority-store:no-file-io",
      ],
    };
  }

  const config = validateNonDefaultConfig(input);
  if (config.ok === false) {
    return config.failure;
  }

  const relativePath = normalizeWorkspaceRelativePath(
    input.workspaceRelativePath,
  );
  if (!relativePath) {
    return blocked(
      "invalid-workspace-relative-path",
      "Recovery authority records require a workspace-relative path inside the workspace.",
    );
  }

  if (input.beforeState === "exists" && input.beforeContent === undefined) {
    return blocked(
      "before-content-required",
      "Recovery authority cannot restore an existing file without pre-write original content.",
    );
  }
  if (input.beforeContent !== undefined && Buffer.byteLength(input.beforeContent, 'utf8') > 64 * 1024 * 1024) {
    return blocked('content-too-large', 'Recovery snapshots support at most 64 MiB of UTF-8 text. Nothing was written.');
  }

  const beforeContentHash =
    input.beforeContent === undefined
      ? undefined
      : hashContent(input.beforeContent);
  const expectedCurrentContentHash =
    input.expectedCurrentContent === undefined
      ? undefined
      : hashContent(input.expectedCurrentContent);
  const beforeContentSizeBytes =
    input.beforeContent === undefined
      ? undefined
      : Buffer.byteLength(input.beforeContent, "utf8");
  const beforeContentRef =
    beforeContentHash === undefined
      ? undefined
      : `blobs/${beforeContentHash}.content`;

  const record: RecoveryAuthorityStoredRecord = {
    ...(input.operation ? { operation: input.operation } : {}),
    schemaVersion,
    authorityId: config.authorityId,
    recordId: input.recordId,
    workspaceRelativePath: relativePath,
    operationKind: input.operationKind,
    beforeState: input.beforeState,
    ...(input.beforeMode === undefined ? {} : { beforeMode: input.beforeMode }),
    ...(beforeContentHash ? { beforeContentHash } : {}),
    ...(beforeContentSizeBytes !== undefined ? { beforeContentSizeBytes } : {}),
    ...(beforeContentRef ? { beforeContentRef } : {}),
    expectedCurrentState: input.expectedCurrentState,
    ...(input.expectedCurrentMode === undefined ? {} : { expectedCurrentMode: input.expectedCurrentMode }),
    ...(expectedCurrentContentHash ? { expectedCurrentContentHash } : {}),
    capturedAtPhase: "pre-write",
    persistence: "non-default",
    createdAt: input.createdAt ?? new Date().toISOString(),
    evidence: [
      "recovery-authority-store:captured-pre-write",
      "recovery-authority-store:persistence:non-default",
      "recovery-authority-store:manifest-metadata-only",
    ],
  };

  try {
    const namespaceRoot = authorityNamespaceRoot(
      config.ledgerRoot,
      config.authorityId,
    );
    prepareLedgerDirectory(path.join(namespaceRoot, 'records'));
    prepareLedgerDirectory(path.join(namespaceRoot, 'blobs'));
    if (input.beforeContent !== undefined && beforeContentRef) {
      const relative = `${config.authorityId}/${beforeContentRef}`;
      const existing = inspectWorkspaceFile(config.ledgerRoot, relative);
      if (existing.state === 'exists') {
        if (existing.content !== input.beforeContent) throw new Error('Stored snapshot blob failed its integrity check.');
      } else commitWorkspaceFile({ workspaceRoot: config.ledgerRoot, relativePath: relative, expected: existing, content: input.beforeContent });
    }
    const relative = `${config.authorityId}/records/${input.recordId}.json`;
    const existing = inspectWorkspaceFile(config.ledgerRoot, relative);
    if (existing.state !== 'absent') throw new Error('Snapshot record already exists.');
    commitWorkspaceFile({ workspaceRoot: config.ledgerRoot, relativePath: relative, expected: existing, content: `${JSON.stringify(record, null, 2)}\n` });
  } catch (error) {
    return blocked(
      "file-system-error",
      `Recovery authority capture failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return {
    status: "captured",
    records: [record],
    evidence: [
      "recovery-authority-store:explicit-non-default-ledger",
      "recovery-authority-store:record-written",
      ...record.evidence,
    ],
  };
}

export async function captureRecoveryAuthorityRecords(input: {
  readonly store: RecoveryAuthorityStoreConfig;
  readonly records: readonly CaptureRecoveryAuthorityRecordEntry[];
}): Promise<RecoveryAuthorityCaptureBatchResult> {
  if (input.store.mode === "disabled") {
    return {
      status: "disabled",
      blockedReason: "disabled",
      records: [],
      evidence: [
        "recovery-authority-store:disabled",
        "recovery-authority-store:no-file-io",
      ],
    };
  }

  const captured: RecoveryAuthorityStoredRecord[] = [];
  for (const entry of input.records) {
    const result = await captureRecoveryAuthorityRecord({
      ...input.store,
      ...entry,
    });
    if (result.status === "captured") {
      captured.push(...result.records);
      continue;
    }
    if (result.status === "disabled") {
      return {
        status: "disabled",
        blockedReason: "disabled",
        records: [],
        evidence: [
          ...result.evidence,
          "recovery-authority-store:batch-capture-disabled",
        ],
      };
    }
    for (const record of captured) {
      await cleanupRecoveryAuthorityRecord({
        ledgerRoot: input.store.ledgerRoot ?? "",
        authorityId: input.store.authorityId ?? "",
        recordId: record.recordId,
      });
    }
    return {
      status: "blocked",
      blockedReason: result.blockedReason,
      records: [],
      message: result.message,
      evidence: [
        ...result.evidence,
        "recovery-authority-store:batch-capture-blocked",
        "recovery-authority-store:batch-capture-cleanup-attempted",
      ],
    };
  }

  return {
    status: "captured",
    records: captured,
    evidence: [
      "recovery-authority-store:batch-captured-pre-write",
      "recovery-authority-store:all-records-captured-before-writer",
      ...captured.flatMap((record) => record.evidence),
    ],
  };
}

export async function readRecoveryAuthorityRecord(input: {
  readonly ledgerRoot: string;
  readonly authorityId: string;
  readonly recordId: string;
}): Promise<RecoveryAuthorityStoredRecord | undefined> {
  const config = validateNonDefaultConfig({
    mode: "non-default",
    ledgerRoot: input.ledgerRoot,
    authorityId: input.authorityId,
    recordId: input.recordId,
  });
  if (config.ok === false) {
    return undefined;
  }
  try {
    const raw = await readLedgerText(config.ledgerRoot, `${config.authorityId}/records/${input.recordId}.json`);
    const parsed: unknown = JSON.parse(raw);
    if (!validRecoveryRecord(parsed, config.authorityId, input.recordId)
      || normalizeWorkspaceRelativePath(parsed.workspaceRelativePath) !== parsed.workspaceRelativePath) {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

export async function cleanupRecoveryAuthorityRecord(input: {
  readonly ledgerRoot: string;
  readonly authorityId: string;
  readonly recordId: string;
}): Promise<RecoveryAuthorityCleanupResult> {
  const record = await readRecoveryAuthorityRecord(input);
  if (!record) {
    return {
      cleaned: false,
      recordId: input.recordId,
      evidence: ["recovery-authority-store:cleanup-record-missing"],
    };
  }
  const namespaceRoot = authorityNamespaceRoot(
    input.ledgerRoot,
    input.authorityId,
  );
  await fs.rm(recordPath(input.ledgerRoot, input.authorityId, input.recordId), {
    force: true,
  });
  if (record.beforeContentRef) {
    await fs.rm(path.join(namespaceRoot, record.beforeContentRef), {
      force: true,
    });
  }
  return {
    cleaned: true,
    recordId: input.recordId,
    evidence: [
      "recovery-authority-store:cleanup-record-removed",
      "recovery-authority-store:cleanup-blob-removed",
    ],
  };
}

export async function purgeRecoveryAuthority(input: {
  readonly ledgerRoot: string;
  readonly authorityId: string;
}): Promise<RecoveryAuthorityCleanupResult> {
  const config = validateNonDefaultConfig({
    mode: "non-default",
    ledgerRoot: input.ledgerRoot,
    authorityId: input.authorityId,
    recordId: "purge",
  });
  if (config.ok === false) {
    return {
      cleaned: false,
      evidence: ["recovery-authority-store:purge-invalid-config"],
    };
  }
  await fs.rm(authorityNamespaceRoot(config.ledgerRoot, config.authorityId), {
    recursive: true,
    force: true,
  });
  return {
    cleaned: true,
    evidence: ["recovery-authority-store:purge-namespace-removed"],
  };
}

export function toOriginalContentAuthorityRecord(
  record: RecoveryAuthorityStoredRecord,
): OriginalContentAuthorityRecord {
  const persistence: OriginalContentPersistence = record.persistence;
  return {
    filePath: record.workspaceRelativePath,
    operationKind: record.operationKind,
    ...(record.beforeContentHash
      ? { beforeContentHash: record.beforeContentHash }
      : {}),
    beforeContentAvailable:
      record.beforeState === "exists" && Boolean(record.beforeContentRef),
    expectedCurrentState: record.expectedCurrentState,
    ...(record.expectedCurrentContentHash
      ? { expectedCurrentContentHash: record.expectedCurrentContentHash }
      : {}),
    capturedAtPhase: record.capturedAtPhase,
    persistence,
  };
}

export function normalizeWorkspaceRelativePath(
  workspaceRelativePath: string,
): string | undefined {
  if (
    !workspaceRelativePath ||
    workspaceRelativePath.includes("\0") ||
    path.isAbsolute(workspaceRelativePath)
  ) {
    return undefined;
  }
  const normalized = path.posix.normalize(
    workspaceRelativePath.replaceAll("\\", "/"),
  );
  if (
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    path.isAbsolute(normalized)
  ) {
    return undefined;
  }
  return normalized;
}

function validateNonDefaultConfig(input: {
  readonly mode: RecoveryAuthorityStoreMode;
  readonly ledgerRoot?: string;
  readonly authorityId?: string;
  readonly recordId: string;
}):
  | { readonly ok: true; readonly ledgerRoot: string; readonly authorityId: string }
  | { readonly ok: false; readonly failure: Extract<RecoveryAuthorityCaptureResult, { status: "blocked" }> } {
  if (input.mode !== "non-default") {
    return {
      ok: false,
      failure: blocked("ledger-root-required", "Recovery authority is not in non-default mode."),
    };
  }
  if (!input.ledgerRoot) {
    return {
      ok: false,
      failure: blocked(
        "ledger-root-required",
        "Non-default recovery authority requires an explicit ledgerRoot.",
      ),
    };
  }
  if (!input.authorityId) {
    return {
      ok: false,
      failure: blocked(
        "authority-id-required",
        "Non-default recovery authority requires an explicit authorityId.",
      ),
    };
  }
  if (!safeRecoveryId(input.authorityId) || !safeRecoveryId(input.recordId)) {
    return {
      ok: false,
      failure: blocked(
        "invalid-id",
        "Recovery authority identifiers may only contain letters, numbers, dots, underscores, and hyphens.",
      ),
    };
  }
  return {
    ok: true,
    ledgerRoot: path.resolve(input.ledgerRoot),
    authorityId: input.authorityId,
  };
}

function blocked(
  blockedReason: Extract<RecoveryAuthorityCaptureResult, { status: "blocked" }>["blockedReason"],
  message: string,
): Extract<RecoveryAuthorityCaptureResult, { status: "blocked" }> {
  return {
    status: "blocked",
    blockedReason,
    records: [],
    message,
    evidence: [
      "recovery-authority-store:capture-blocked",
      `recovery-authority-store:blocker:${blockedReason}`,
    ],
  };
}

function authorityNamespaceRoot(
  ledgerRoot: string,
  authorityId: string,
): string {
  return path.join(path.resolve(ledgerRoot), authorityId);
}

function recordPath(
  ledgerRoot: string,
  authorityId: string,
  recordId: string,
): string {
  return path.join(authorityNamespaceRoot(ledgerRoot, authorityId), "records", `${recordId}.json`);
}
