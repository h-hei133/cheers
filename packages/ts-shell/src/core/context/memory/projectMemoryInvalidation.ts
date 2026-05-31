import type {
  ProjectMemoryDeleteResult,
  ProjectMemoryInvalidateResult,
  ProjectMemoryRecordId,
  ProjectMemoryStore,
} from "./projectMemoryStoreContract.js";

export interface ProjectMemoryInvalidationRequest {
  readonly recordId: ProjectMemoryRecordId;
  readonly reason?: string;
  readonly now?: () => string;
  readonly sourceCommand: "/memory";
}

export interface ProjectMemoryDeletionRequest {
  readonly recordId: ProjectMemoryRecordId;
  readonly reason?: string;
  readonly now?: () => string;
  readonly sourceCommand: "/memory";
}

export function normalizeProjectMemoryLifecycleRecordId(
  recordId: string | undefined,
): ProjectMemoryRecordId {
  const normalized = recordId?.trim();
  if (!normalized) {
    throw new ProjectMemoryInvalidationError(
      "project-memory-lifecycle-missing-record-id",
      "Project memory lifecycle commands require an explicit record id.",
    );
  }
  return normalized;
}

export class ProjectMemoryInvalidationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ProjectMemoryInvalidationError";
    this.code = code;
  }
}

export async function invalidateProjectMemoryRecord(input: {
  readonly store?: ProjectMemoryStore;
  readonly request: ProjectMemoryInvalidationRequest;
}): Promise<ProjectMemoryInvalidateResult> {
  if (!input.store?.invalidate) {
    return {
      invalidated: false,
      skipped: false,
      blocker: "Explicit local memory store with invalidation support is required.",
      evidence: [
        "project-memory-invalidation:store-required",
        "project-memory-invalidation:no-provider-call",
        "project-memory-invalidation:no-auto-cleanup",
      ],
    };
  }
  return input.store.invalidate({
    recordId: normalizeProjectMemoryLifecycleRecordId(input.request.recordId),
    invalidatedAt: (input.request.now ?? (() => new Date().toISOString()))(),
    sourceCommand: input.request.sourceCommand,
    reason: input.request.reason,
  });
}

export async function deleteProjectMemoryRecord(input: {
  readonly store?: ProjectMemoryStore;
  readonly request: ProjectMemoryDeletionRequest;
}): Promise<ProjectMemoryDeleteResult> {
  const recordId = normalizeProjectMemoryLifecycleRecordId(input.request.recordId);
  if (!input.store?.delete) {
    return {
      recordId,
      deleted: false,
      skipped: false,
      blocker: "Explicit local memory store with delete support is required.",
      evidence: [
        "project-memory-delete:store-required",
        "project-memory-delete:no-provider-call",
        "project-memory-delete:no-auto-cleanup",
      ],
    };
  }
  return input.store.delete({
    recordId,
    deletedAt: (input.request.now ?? (() => new Date().toISOString()))(),
    sourceCommand: input.request.sourceCommand,
    reason: input.request.reason,
  });
}
