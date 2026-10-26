import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { writeTextFileAtomic } from "../session/store/sessionFileStore.js";
import { withMemoryStoreLock } from "./store/transaction.js";
import { captureMemoryOwner, assertMemoryOwner } from './store/owner.js';
import type {
  ProjectMemoryListResult,
  ProjectMemoryLifecycleTombstone,
  ProjectMemoryDeleteRequest,
  ProjectMemoryDeleteResult,
  ProjectMemoryInvalidateRequest,
  ProjectMemoryInvalidateResult,
  ProjectMemoryListOptions,
  ProjectMemoryRecord,
  ProjectMemoryRecordId,
  ProjectMemoryStore,
  ProjectMemoryStoreHealth,
  ProjectMemoryStoreRef,
  ProjectMemoryReadOptions,
  ProjectMemoryWriteRequest,
  ProjectMemoryWriteResult,
} from "./projectMemoryStoreContract.js";
import { projectMemoryStoreRefIsWritable } from "./projectMemoryStoreContract.js";
import {
  recordHasForbiddenContent,
  sanitizeLifecycleReason,
} from "./memoryValidation.js";
import {
  entryTargetsRecord,
  foldProjectMemoryEntries,
  isMemoryRecord,
  readEntriesSync,
  readEntries,
  recordsFileFor,
} from "./memoryPersistence.js";

export interface CreateProjectMemoryLocalStoreOptions {
  readonly ref: ProjectMemoryStoreRef;
  readonly now?: () => string;
}

export function createProjectMemoryLocalStore(
  options: CreateProjectMemoryLocalStoreOptions,
): ProjectMemoryStore {
  const ref = captureMemoryOwner(normalizeRef(options.ref));
  return {
    ref,
    async write(request) {
      assertMemoryOwner(ref);
      return writeRecord(ref, request);
    },
    async list(listOptions) {
      assertMemoryOwner(ref);
      const result = await readRecords(ref, listOptions); assertMemoryOwner(ref); return result;
    },
    async get(id, readOptions) {
      assertMemoryOwner(ref);
      const result = await readRecords(ref, { includeInvalidated: true, readOptions }); assertMemoryOwner(ref);
      return result.records.find((record) => record.id === id);
    },
    async invalidate(request) {
      assertMemoryOwner(ref);
      return invalidateRecord(ref, request);
    },
    async delete(request) {
      assertMemoryOwner(ref);
      return deleteRecord(ref, request);
    },
    async health(readOptions) {
      assertMemoryOwner(ref);
      const result = await storeHealth(ref, readOptions); assertMemoryOwner(ref); return result;
    },
  };
}

export function projectMemoryRecordId(input: {
  readonly candidateId: string;
  readonly approvedAt: string;
  readonly memoryText: string;
}): ProjectMemoryRecordId {
  const digest = createHash("sha256")
    .update([input.candidateId, input.approvedAt, input.memoryText].join("\n"))
    .digest("hex")
    .slice(0, 24);
  return `pmr:${digest}`;
}

function normalizeRef(ref: ProjectMemoryStoreRef): ProjectMemoryStoreRef {
  if (!ref.root) {
    return ref;
  }
  const root = path.resolve(ref.root);
  return {
    ...ref,
    root,
    recordsFile: ref.recordsFile
      ? path.resolve(ref.recordsFile)
      : path.join(root, "project-memory.jsonl"),
  };
}

function writeRecord(
  ref: ProjectMemoryStoreRef,
  request: ProjectMemoryWriteRequest,
): ProjectMemoryWriteResult {
  if (!projectMemoryStoreRefIsWritable(ref)) {
    return blocked(
      "project-memory-local-store:explicit-store-required",
      "Explicit local memory store root is required.",
    );
  }
  if (!isMemoryRecord(request.record)) {
    return blocked(
      "project-memory-local-store:invalid-record",
      "Memory record does not satisfy the local store contract.",
    );
  }
  if (recordHasForbiddenContent(request.record)) {
    return blocked(
      "project-memory-local-store:forbidden-content",
      "Memory record contains raw content, hidden reasoning, or secret-looking material.",
    );
  }
  try {
    return withMemoryStoreLock(ref, (lockedRef) => {
      const snapshot = readEntriesSync(lockedRef);
      if (snapshot.diagnostics.length) return blocked("project-memory-local-store:damaged", snapshot.diagnostics.join(" "));
      const records = foldProjectMemoryEntries(snapshot.entries, {});
      if (records.some((record) => record.id === request.record.id)) {
        return {
          record: request.record,
          written: false,
          skipped: true,
          blocker: "Record already exists in the explicit local memory store.",
          evidence: [
            "project-memory-local-store:duplicate-skipped",
            "project-memory-local-store:no-auto-load",
          ],
        };
      }
      fs.appendFileSync(recordsFileFor(lockedRef), `${snapshot.appendPrefix}${JSON.stringify(request.record)}\n`, { encoding: "utf8", mode: 0o600 });
      return {
        record: request.record,
        written: true,
        skipped: false,
        evidence: [
          "project-memory-local-store:jsonl-append",
          "project-memory-local-store:explicit-local",
          "project-memory-local-store:no-vector-db",
          "project-memory-local-store:no-auto-load",
          "project-memory-local-store:no-provider-call",
        ],
      };
    });
  } catch (error) {
    return blocked(
      "project-memory-local-store:write-unavailable",
      `Memory store is not writable at ${recordsFileFor(ref)}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function invalidateRecord(
  ref: ProjectMemoryStoreRef,
  request: ProjectMemoryInvalidateRequest,
): ProjectMemoryInvalidateResult {
  if (!projectMemoryStoreRefIsWritable(ref)) {
    return {
      invalidated: false,
      skipped: false,
      blocker: "Explicit local memory store root is required.",
      evidence: [
        "project-memory-local-store:invalidate-blocked",
        "project-memory-local-store:explicit-store-required",
      ],
    };
  }
  try {
    return withMemoryStoreLock(ref, (lockedRef) => {
      const snapshot = readEntriesSync(lockedRef);
      if (snapshot.diagnostics.length) return { invalidated: false, skipped: false, blocker: snapshot.diagnostics.join(" "), evidence: ["project-memory-local-store:damaged"] };
      const existing = foldProjectMemoryEntries(snapshot.entries, { includeInvalidated: true }).find(
        (record) => record.id === request.recordId,
      );
      if (!existing) {
        return {
          invalidated: false,
          skipped: false,
          blocker: `Unknown project memory record id: ${request.recordId}`,
          evidence: [
            "project-memory-local-store:invalidate-missing-record",
            "project-memory-local-store:no-auto-cleanup",
          ],
        };
      }
      if (existing.invalidatedAt) {
        return {
          record: existing,
          invalidated: false,
          skipped: true,
          blocker: "Record is already invalidated.",
          evidence: [
            "project-memory-local-store:already-invalidated",
            "project-memory-local-store:no-auto-cleanup",
          ],
        };
      }
      const tombstone: ProjectMemoryLifecycleTombstone = {
        entryKind: "project-memory-lifecycle",
        version: 1,
        recordId: request.recordId,
        operation: "invalidate",
        createdAt: request.invalidatedAt,
        sourceCommand: request.sourceCommand,
        reason: sanitizeLifecycleReason(request.reason),
      };
      fs.appendFileSync(recordsFileFor(lockedRef), `${snapshot.appendPrefix}${JSON.stringify(tombstone)}\n`, { encoding: "utf8", mode: 0o600 });
      return {
        record: {
          ...existing,
          invalidatedAt: request.invalidatedAt,
          invalidationReason: tombstone.reason,
          invalidatedBySourceCommand: request.sourceCommand,
        },
        invalidated: true,
        skipped: false,
        evidence: [
          "project-memory-local-store:invalidate-append-tombstone",
          "project-memory-local-store:explicit-user-action",
          "project-memory-local-store:no-provider-call",
        ],
      };
    });
  } catch (error) {
    return {
      invalidated: false,
      skipped: false,
      blocker: `Memory store is not writable at ${recordsFileFor(ref)}: ${error instanceof Error ? error.message : String(error)}`,
      evidence: ["project-memory-local-store:invalidate-unavailable"],
    };
  }
}

function deleteRecord(
  ref: ProjectMemoryStoreRef,
  request: ProjectMemoryDeleteRequest,
): ProjectMemoryDeleteResult {
  if (!projectMemoryStoreRefIsWritable(ref)) {
    return {
      recordId: request.recordId,
      deleted: false,
      skipped: false,
      blocker: "Explicit local memory store root is required.",
      evidence: [
        "project-memory-local-store:delete-blocked",
        "project-memory-local-store:explicit-store-required",
      ],
    };
  }
  try {
    return withMemoryStoreLock(ref, (lockedRef) => {
      const snapshot = readEntriesSync(lockedRef);
      if (snapshot.diagnostics.length) return { recordId: request.recordId, deleted: false, skipped: false, blocker: snapshot.diagnostics.join(" "), evidence: ["project-memory-local-store:damaged"] };
      const entries = snapshot.entries;
      const existing = foldProjectMemoryEntries(entries, {
        includeInvalidated: true,
      }).find((record) => record.id === request.recordId);
      if (!existing) {
        return {
          recordId: request.recordId,
          deleted: false,
          skipped: false,
          blocker: `Unknown project memory record id: ${request.recordId}`,
          evidence: [
            "project-memory-local-store:delete-missing-record",
            "project-memory-local-store:no-auto-cleanup",
          ],
        };
      }
      const retained = entries.filter(
        (entry) => !entryTargetsRecord(entry, request.recordId),
      );
      const tombstone: ProjectMemoryLifecycleTombstone = {
        entryKind: "project-memory-lifecycle",
        version: 1,
        recordId: request.recordId,
        operation: "delete",
        createdAt: request.deletedAt,
        sourceCommand: request.sourceCommand,
        reason: sanitizeLifecycleReason(request.reason),
      };
      const payload = [...retained, tombstone].map((entry) => JSON.stringify(entry)).join("\n");
      writeTextFileAtomic(recordsFileFor(lockedRef), `${payload}\n`, 0o600);
      return {
        recordId: request.recordId,
        deleted: true,
        skipped: false,
        deletedAt: request.deletedAt,
        evidence: [
          "project-memory-local-store:delete-rewrite-with-tombstone",
          "project-memory-local-store:record-content-removed",
          "project-memory-local-store:explicit-user-action",
          "project-memory-local-store:no-provider-call",
          "project-memory-local-store:no-auto-cleanup",
        ],
      };
    });
  } catch (error) {
    return {
      recordId: request.recordId,
      deleted: false,
      skipped: false,
      blocker: `Memory store is not writable at ${recordsFileFor(ref)}: ${error instanceof Error ? error.message : String(error)}`,
      evidence: ["project-memory-local-store:delete-unavailable"],
    };
  }
}

async function readRecords(
  ref: ProjectMemoryStoreRef,
  options: ProjectMemoryListOptions = {},
): Promise<ProjectMemoryListResult> {
  const snapshot = await readEntries(ref, options.readOptions);
  return {
    records: foldProjectMemoryEntries(snapshot.entries, options),
    diagnostics: snapshot.diagnostics,
    evidence: [
      "project-memory-local-store:list",
      ...snapshot.diagnostics,
      options.includeInvalidated
        ? "project-memory-local-store:include-invalidated-explicit"
        : "project-memory-local-store:exclude-invalidated-default",
      "project-memory-local-store:no-retrieval-injection",
    ],
  };
}

async function storeHealth(ref: ProjectMemoryStoreRef, readOptions?: ProjectMemoryReadOptions): Promise<ProjectMemoryStoreHealth> {
  if (!projectMemoryStoreRefIsWritable(ref)) {
    return {
      mode: ref.mode,
      ok: ref.mode === "disabled",
      writable: false,
      readable: false,
      detail: "No explicit local memory store root configured.",
      evidence: [
        "project-memory-local-store:disabled",
        "project-memory-local-store:no-default-path",
      ],
    };
  }
  const recordsFile = recordsFileFor(ref);
  const snapshot = await readEntries(ref, readOptions);
  return {
    mode: ref.mode,
    ok: snapshot.readable && snapshot.diagnostics.length === 0,
    writable: snapshot.readable && snapshot.diagnostics.length === 0,
    readable: snapshot.readable,
    diagnostics: snapshot.diagnostics,
    recordCount: foldProjectMemoryEntries(snapshot.entries, { includeInvalidated: true }).length,
    storeRoot: ref.root,
    recordsFile,
    detail: snapshot.diagnostics.join(" ") || "Explicit local JSONL memory store is configured.",
    evidence: [
      "project-memory-local-store:health",
      ...snapshot.diagnostics,
      "project-memory-local-store:explicit-local",
    ],
  };
}

function blocked(evidence: string, blocker: string): ProjectMemoryWriteResult {
  return {
    written: false,
    skipped: false,
    blocker,
    evidence: [evidence, "project-memory-local-store:write-blocked"],
  };
}
