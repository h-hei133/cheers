import type {
  ProjectMemoryCandidateKind,
  ProjectMemoryCandidateSafety,
  ProjectMemoryCandidateSource,
  ProjectMemoryRetentionClass,
} from "./projectMemoryCandidate.js";

export type ProjectMemoryRecordId = string;
export type ProjectMemoryStoreMode = "disabled" | "explicit-local" | "test-only";

export interface ProjectMemoryStoreRef {
  readonly mode: ProjectMemoryStoreMode;
  readonly root?: string;
  readonly recordsFile?: string;
}

export interface ProjectMemoryRecord {
  readonly id: ProjectMemoryRecordId;
  readonly version: 1;
  readonly createdAt: string;
  readonly candidateId: string;
  readonly candidateKind: ProjectMemoryCandidateKind;
  readonly retentionClass: ProjectMemoryRetentionClass;
  readonly approvedAt: string;
  readonly approvedBySourceCommand: "/memory";
  readonly memoryText: string;
  readonly structuredFact?: {
    readonly subject?: string;
    readonly predicate?: string;
    readonly object?: string;
  };
  readonly evidence: readonly string[];
  readonly source: ProjectMemoryCandidateSource;
  readonly sourcePacket?: string;
  readonly routeReferences: readonly string[];
  readonly safety: Exclude<ProjectMemoryCandidateSafety, "unsafe">;
  readonly redactions: readonly string[];
  readonly invalidatedAt?: string;
  readonly invalidationReason?: string;
}

export interface ProjectMemoryWriteRequest {
  readonly record: ProjectMemoryRecord;
  readonly storeRef: ProjectMemoryStoreRef;
}

export interface ProjectMemoryWriteResult {
  readonly record?: ProjectMemoryRecord;
  readonly written: boolean;
  readonly skipped: boolean;
  readonly blocker?: string;
  readonly evidence: readonly string[];
}

export interface ProjectMemoryListResult {
  readonly records: readonly ProjectMemoryRecord[];
  readonly evidence: readonly string[];
}

export interface ProjectMemoryStoreHealth {
  readonly mode: ProjectMemoryStoreMode;
  readonly ok: boolean;
  readonly writable: boolean;
  readonly recordCount?: number;
  readonly storeRoot?: string;
  readonly recordsFile?: string;
  readonly detail: string;
  readonly evidence: readonly string[];
}

export interface ProjectMemoryStore {
  readonly ref: ProjectMemoryStoreRef;
  write(request: ProjectMemoryWriteRequest): Promise<ProjectMemoryWriteResult>;
  list(): Promise<ProjectMemoryListResult>;
  get(id: ProjectMemoryRecordId): Promise<ProjectMemoryRecord | undefined>;
  health(): Promise<ProjectMemoryStoreHealth>;
}

export function projectMemoryStoreRefIsWritable(
  ref: ProjectMemoryStoreRef,
): boolean {
  return (
    (ref.mode === "explicit-local" || ref.mode === "test-only") &&
    typeof ref.root === "string" &&
    ref.root.trim().length > 0
  );
}
