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

export type ProjectMemoryStoreEntry =
  | ProjectMemoryRecord
  | ProjectMemoryLifecycleTombstone;

export function recordsFileFor(ref: ProjectMemoryStoreRef): string {
  if (!ref.root) {
    throw new Error("Project memory local store root is required.");
  }
  return ref.recordsFile ?? path.join(ref.root, "project-memory.jsonl");
}

export function readEntriesSync(ref: ProjectMemoryStoreRef): ProjectMemoryStoreEntry[] {
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
    .map((line) => JSON.parse(line) as ProjectMemoryStoreEntry);
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
