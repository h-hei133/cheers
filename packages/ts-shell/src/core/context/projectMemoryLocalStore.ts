import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type {
  ProjectMemoryListResult,
  ProjectMemoryRecord,
  ProjectMemoryRecordId,
  ProjectMemoryStore,
  ProjectMemoryStoreHealth,
  ProjectMemoryStoreRef,
  ProjectMemoryWriteRequest,
  ProjectMemoryWriteResult,
} from "./projectMemoryStoreContract.js";
import { projectMemoryStoreRefIsWritable } from "./projectMemoryStoreContract.js";

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
    async list() {
      return readRecords(ref);
    },
    async get(id) {
      return (await readRecords(ref)).records.find((record) => record.id === id);
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
    return blocked("project-memory-local-store:explicit-store-required", "Explicit local memory store root is required.");
  }
  const recordsFile = recordsFileFor(ref);
  if (recordHasForbiddenContent(request.record)) {
    return blocked("project-memory-local-store:forbidden-content", "Memory record contains raw content, hidden reasoning, or secret-looking material.");
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

function readRecords(ref: ProjectMemoryStoreRef): ProjectMemoryListResult {
  return {
    records: readRecordsSync(ref),
    evidence: [
      "project-memory-local-store:list",
      "project-memory-local-store:no-retrieval-injection",
    ],
  };
}

function readRecordsSync(ref: ProjectMemoryStoreRef): ProjectMemoryRecord[] {
  if (!projectMemoryStoreRefIsWritable(ref)) {
    return [];
  }
  const recordsFile = recordsFileFor(ref);
  if (!fs.existsSync(recordsFile)) {
    return [];
  }
  return fs
    .readFileSync(recordsFile, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ProjectMemoryRecord);
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
    recordCount: readRecordsSync(ref).length,
    storeRoot: ref.root,
    recordsFile,
    detail: "Explicit local JSONL memory store is configured.",
    evidence: [
      "project-memory-local-store:health",
      "project-memory-local-store:explicit-local",
    ],
  };
}

function recordsFileFor(ref: ProjectMemoryStoreRef): string {
  if (!ref.root) {
    throw new Error("Project memory local store root is required.");
  }
  return ref.recordsFile ?? path.join(ref.root, "project-memory.jsonl");
}

function blocked(evidence: string, blocker: string): ProjectMemoryWriteResult {
  return {
    written: false,
    skipped: false,
    blocker,
    evidence: [evidence, "project-memory-local-store:write-blocked"],
  };
}

function recordHasForbiddenContent(record: ProjectMemoryRecord): boolean {
  const values = [
    record.memoryText,
    ...record.evidence,
    ...record.routeReferences,
    ...record.redactions,
    record.structuredFact?.subject ?? "",
    record.structuredFact?.predicate ?? "",
    record.structuredFact?.object ?? "",
  ];
  return values.some((value) => containsRawContent(value) || containsSecret(value) || containsHiddenReasoning(value));
}

function containsRawContent(value: string): boolean {
  return /\bRAW_[A-Z0-9_]+\b/.test(value) || /\braw (file|recovery|content)\b/i.test(value);
}

function containsSecret(value: string): boolean {
  return (
    /\b(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/.test(value) ||
    /\b(provider credential|provider config|authorization|api key|token)\b/i.test(value)
  );
}

function containsHiddenReasoning(value: string): boolean {
  return /\b(hidden reasoning|chain[- ]?of[- ]?thought)\b/i.test(value);
}
