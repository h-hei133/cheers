import fs from "node:fs";
import path from "node:path";
import type {
  ProjectMemoryLifecycleTombstone,
  ProjectMemoryListOptions,
  ProjectMemoryRecord,
  ProjectMemoryRecordId,
  ProjectMemoryStoreRef,
} from "./projectMemoryStoreContract.js";
import { projectMemoryStoreRefIsWritable } from "./projectMemoryStoreContract.js";
import type {
  ProjectMemoryCandidateKind,
  ProjectMemoryCandidateSource,
  ProjectMemoryRetentionClass,
} from "./projectMemoryCandidate.js";

const RECORD_KINDS: Record<ProjectMemoryCandidateKind, true> = {
  "project-fact": true,
  "project-structure": true,
  "capability-state": true,
  "route-decision": true,
  "user-preference-candidate": true,
  "validation-pattern": true,
  "restore/recovery-boundary": true,
  "blocked-by-design-decision": true,
  "transient-session-fact": true,
  rejected: true,
};
const RETENTION_CLASSES: Record<ProjectMemoryRetentionClass, true> = {
  "project-scoped-candidate": true,
  "session-scoped-only": true,
  "user-memory-candidate": true,
  "never-remember": true,
};
const RECORD_SOURCES: Record<ProjectMemoryCandidateSource, true> = {
  "compact-packet": true,
  "context-projection": true,
  "route-handoff": true,
  "validation-evidence": true,
  "user-stated-preference": true,
  "system-derived": true,
};

export type ProjectMemoryStoreEntry =
  | ProjectMemoryRecord
  | ProjectMemoryLifecycleTombstone;

export function recordsFileFor(ref: ProjectMemoryStoreRef): string {
  if (!ref.root) {
    throw new Error("Project memory local store root is required.");
  }
  return ref.recordsFile ?? path.join(ref.root, "project-memory.jsonl");
}

export interface MemoryRead {
  readonly entries: ProjectMemoryStoreEntry[];
  readonly diagnostics: string[];
  readonly readable: boolean;
  readonly appendPrefix: string;
}

export function readEntriesSync(ref: ProjectMemoryStoreRef): MemoryRead {
  const result: MemoryRead = { entries: [], diagnostics: [], readable: true, appendPrefix: "" };
  if (!projectMemoryStoreRefIsWritable(ref)) {
    return { ...result, readable: false };
  }
  const recordsFile = recordsFileFor(ref);
  let content: string;
  try {
    content = fs.readFileSync(recordsFile, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return result;
    return { ...result, readable: false, diagnostics: ["Memory store could not be read; changes are blocked."] };
  }
  for (const [index, line] of content.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    try {
      const entry: unknown = JSON.parse(line);
      if (!isStoreEntry(entry)) throw new Error("Invalid memory entry");
      result.entries.push(entry);
    } catch {
      result.diagnostics.push(`Memory store line ${index + 1} is invalid; changes are blocked.`);
    }
  }
  return { ...result, appendPrefix: content.length > 0 && !content.endsWith("\n") ? "\n" : "" };
}

/** Validate the fields consumed by folding, retrieval and rendering before admission. */
function isStoreEntry(value: unknown): value is ProjectMemoryStoreEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  if (entry.version !== 1 || typeof entry.createdAt !== "string") return false;
  if (entry.entryKind === "project-memory-lifecycle") {
    return typeof entry.recordId === "string" && entry.sourceCommand === "/memory"
      && (entry.operation === "delete" || entry.operation === "invalidate")
      && (entry.reason === undefined || typeof entry.reason === "string");
  }
  if (entry.entryKind !== undefined) return false;
  if (!["id", "candidateId", "candidateKind", "retentionClass", "approvedAt", "memoryText", "source", "safety"]
    .every((key) => typeof entry[key] === "string")) return false;
  if (entry.approvedBySourceCommand !== "/memory") return false;
  if ((entry.safety !== "safe" && entry.safety !== "needs-review")
    || !Object.hasOwn(RECORD_KINDS, entry.candidateKind as string)
    || !Object.hasOwn(RETENTION_CLASSES, entry.retentionClass as string)
    || !Object.hasOwn(RECORD_SOURCES, entry.source as string)) return false;
  if (!["evidence", "routeReferences", "redactions"].every((key) =>
    Array.isArray(entry[key]) && (entry[key] as unknown[]).every((item) => typeof item === "string"))) return false;
  if (!["sourcePacket", "invalidatedAt", "invalidationReason", "invalidatedBySourceCommand"]
    .every((key) => entry[key] === undefined || typeof entry[key] === "string")) return false;
  if (entry.invalidatedBySourceCommand !== undefined && entry.invalidatedBySourceCommand !== "/memory") return false;
  if (entry.structuredFact !== undefined) {
    if (!entry.structuredFact || typeof entry.structuredFact !== "object" || Array.isArray(entry.structuredFact)) return false;
    const fact = entry.structuredFact as Record<string, unknown>;
    if (!["subject", "predicate", "object"].every((key) => fact[key] === undefined || typeof fact[key] === "string")) return false;
  }
  return true;
}

export function isMemoryRecord(value: unknown): value is ProjectMemoryRecord {
  return isStoreEntry(value) && !isLifecycleTombstone(value);
}

export function foldProjectMemoryEntries(
  entries: readonly ProjectMemoryStoreEntry[],
  options: ProjectMemoryListOptions,
): ProjectMemoryRecord[] {
  const records = new Map<ProjectMemoryRecordId, ProjectMemoryRecord>();
  const deleted = new Set<ProjectMemoryRecordId>();
  for (const entry of entries) {
    if (isLifecycleTombstone(entry)) {
      if (entry.operation === "delete") {
        records.delete(entry.recordId);
        deleted.add(entry.recordId);
        continue;
      }
      if (deleted.has(entry.recordId)) {
        continue;
      }
      const record = records.get(entry.recordId);
      if (record) {
        records.set(entry.recordId, {
          ...record,
          invalidatedAt: entry.createdAt,
          invalidationReason: entry.reason,
          invalidatedBySourceCommand: entry.sourceCommand,
        });
      }
      continue;
    }
    deleted.delete(entry.id);
    records.set(entry.id, entry);
  }
  return Array.from(records.values()).filter(
    (record) => options.includeInvalidated || !record.invalidatedAt,
  );
}

export function isLifecycleTombstone(
  entry: ProjectMemoryStoreEntry,
): entry is ProjectMemoryLifecycleTombstone {
  return (
    (entry as { readonly entryKind?: string }).entryKind ===
    "project-memory-lifecycle"
  );
}

export function entryTargetsRecord(
  entry: ProjectMemoryStoreEntry,
  recordId: ProjectMemoryRecordId,
): boolean {
  return isLifecycleTombstone(entry)
    ? entry.recordId === recordId
    : entry.id === recordId;
}

export function appendLifecycleTombstone(
  ref: ProjectMemoryStoreRef,
  tombstone: ProjectMemoryLifecycleTombstone,
): void {
  fs.appendFileSync(
    recordsFileFor(ref),
    `${JSON.stringify(tombstone)}\n`,
    "utf8",
  );
}
