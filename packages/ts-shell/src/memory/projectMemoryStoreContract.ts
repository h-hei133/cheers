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
  readonly invalidatedBySourceCommand?: "/memory";
}

export type ProjectMemoryLifecycleOperation = "invalidate" | "delete";

export interface ProjectMemoryLifecycleTombstone {
  readonly entryKind: "project-memory-lifecycle";
  readonly version: 1;
  readonly recordId: ProjectMemoryRecordId;
  readonly operation: ProjectMemoryLifecycleOperation;
  readonly createdAt: string;
  readonly sourceCommand: "/memory";
  readonly reason?: string;
}

export interface ProjectMemoryReadOptions {
  readonly signal?: AbortSignal;
  readonly maxBytes: number;
  /** Actual raw bytes, observed before decoding or folding. */
  readonly onSource?: (target: string, content?: Buffer) => void;
}

export interface ProjectMemoryListOptions {
  readonly includeInvalidated?: boolean;
  readonly readOptions?: ProjectMemoryReadOptions;
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
  readonly diagnostics?: readonly string[];
  readonly evidence: readonly string[];
}

export interface ProjectMemoryInvalidateRequest {
  readonly recordId: ProjectMemoryRecordId;
  readonly invalidatedAt: string;
  readonly sourceCommand: "/memory";
  readonly reason?: string;
}

export interface ProjectMemoryInvalidateResult {
  readonly record?: ProjectMemoryRecord;
  readonly invalidated: boolean;
  readonly skipped: boolean;
  readonly blocker?: string;
  readonly evidence: readonly string[];
}

export interface ProjectMemoryDeleteRequest {
  readonly recordId: ProjectMemoryRecordId;
  readonly deletedAt: string;
  readonly sourceCommand: "/memory";
  readonly reason?: string;
}

export interface ProjectMemoryDeleteResult {
  readonly recordId: ProjectMemoryRecordId;
  readonly deleted: boolean;
  readonly skipped: boolean;
  readonly blocker?: string;
  readonly deletedAt?: string;
  readonly evidence: readonly string[];
}

export interface ProjectMemoryStoreHealth {
  readonly mode: ProjectMemoryStoreMode;
  readonly ok: boolean;
  readonly writable: boolean;
  readonly readable?: boolean;
  readonly diagnostics?: readonly string[];
  readonly recordCount?: number;
  readonly storeRoot?: string;
  readonly recordsFile?: string;
  readonly detail: string;
  readonly evidence: readonly string[];
}

export interface ProjectMemoryReader {
  readonly ref: ProjectMemoryStoreRef;
  list(options?: ProjectMemoryListOptions): Promise<ProjectMemoryListResult>;
  get(id: ProjectMemoryRecordId, readOptions?: ProjectMemoryReadOptions): Promise<ProjectMemoryRecord | undefined>;
  health(readOptions?: ProjectMemoryReadOptions): Promise<ProjectMemoryStoreHealth>;
}

export interface ProjectMemoryStore extends ProjectMemoryReader {
  /** One preparation owns this read-only snapshot; it never replaces live reads. */
  snapshot?(readOptions: ProjectMemoryReadOptions): Promise<ProjectMemoryReader>;
  write(request: ProjectMemoryWriteRequest): Promise<ProjectMemoryWriteResult>;
  invalidate?(request: ProjectMemoryInvalidateRequest): Promise<ProjectMemoryInvalidateResult>;
  delete?(request: ProjectMemoryDeleteRequest): Promise<ProjectMemoryDeleteResult>;
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
