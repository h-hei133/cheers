import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
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
  readEntriesSync,
  recordsFileFor,
} from "./memoryPersistence.js";

export interface CreateProjectMemoryLocalStoreOptions {
  readonly ref: ProjectMemoryStoreRef;
  readonly now?: () => string;
}

export function createProjectMemoryLocalStore(
  options: CreateProjectMemoryLocalStoreOptions,
): ProjectMemoryStore {
  const ref = normalizeRef(options.ref);
  return {
    ref,
    async write(request) {
      return writeRecord(ref, request);
    },
    async list(listOptions) {
      return readRecords(ref, listOptions);
    },
    async get(id) {
      return (await readRecords(ref, { includeInvalidated: true })).records.find(
        (record) => record.id === id,
      );
    },
    async invalidate(request) {
      return invalidateRecord(ref, request);
    },
    async delete(request) {
      return deleteRecord(ref, request);
    },
    async health() {
      return storeHealth(ref);
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
  const recordsFile = recordsFileFor(ref);
  if (recordHasForbiddenContent(request.record)) {
    return blocked(
      "project-memory-local-store:forbidden-content",
      "Memory record contains raw content, hidden reasoning, or secret-looking material.",
    );
  }
  fs.mkdirSync(path.dirname(recordsFile), { recursive: true });
  const records = readRecordsSync(ref);
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
  fs.appendFileSync(recordsFile, `${JSON.stringify(request.record)}\n`, "utf8");
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
  const recordsFile = recordsFileFor(ref);
  const existing = readRecordsSync(ref, { includeInvalidated: true }).find(
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
  fs.mkdirSync(path.dirname(recordsFile), { recursive: true });
  fs.appendFileSync(recordsFile, `${JSON.stringify(tombstone)}\n`, "utf8");
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
  const recordsFile = recordsFileFor(ref);
  const entries = readEntriesSync(ref);
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
  fs.mkdirSync(path.dirname(recordsFile), { recursive: true });
  const payload = [...retained, tombstone]
    .map((entry) => JSON.stringify(entry))
    .join("\n");
  fs.writeFileSync(recordsFile, `${payload}\n`, "utf8");
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
}

function readRecords(
  ref: ProjectMemoryStoreRef,
  options: ProjectMemoryListOptions = {},
): ProjectMemoryListResult {
  return {
    records: readRecordsSync(ref, options),
    evidence: [
      "project-memory-local-store:list",
      options.includeInvalidated
        ? "project-memory-local-store:include-invalidated-explicit"
        : "project-memory-local-store:exclude-invalidated-default",
      "project-memory-local-store:no-retrieval-injection",
    ],
  };
}

function readRecordsSync(
  ref: ProjectMemoryStoreRef,
  options: ProjectMemoryListOptions = {},
): ProjectMemoryRecord[] {
  return foldProjectMemoryEntries(readEntriesSync(ref), options);
}

function storeHealth(ref: ProjectMemoryStoreRef): ProjectMemoryStoreHealth {
  if (!projectMemoryStoreRefIsWritable(ref)) {
    return {
      mode: ref.mode,
      ok: ref.mode === "disabled",
      writable: false,
      detail: "No explicit local memory store root configured.",
      evidence: [
        "project-memory-local-store:disabled",
        "project-memory-local-store:no-default-path",
      ],
    };
  }
  const recordsFile = recordsFileFor(ref);
  return {
    mode: ref.mode,
    ok: true,
    writable: true,
    recordCount: readRecordsSync(ref, { includeInvalidated: true }).length,
    storeRoot: ref.root,
    recordsFile,
    detail: "Explicit local JSONL memory store is configured.",
    evidence: [
      "project-memory-local-store:health",
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
