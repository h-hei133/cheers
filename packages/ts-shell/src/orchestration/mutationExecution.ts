import type {
  CodingPatchOperation,
  CodingPatchRecord,
} from "./types.js";

export interface FileMutationDispatchResult {
  readonly success: boolean;
  readonly error?: string;
}

export interface FileMutationExecutionResult {
  readonly changedFile?: string;
  readonly failedFile?: { readonly path: string; readonly reason: string };
  readonly patch: CodingPatchRecord;
  readonly appliedContent?: {
    readonly path: string;
    readonly normalizedPath: string;
    readonly content: string;
  };
  readonly note?: string;
  readonly evidence?: string;
}

export async function executeFileMutationBranch(input: {
  readonly path: string;
  readonly content: string;
  readonly operation: CodingPatchOperation;
  readonly changedLines: number;
  readonly addedLines: number;
  readonly removedLines: number;
  readonly failureReason: string;
  readonly appliedNote?: string;
  readonly appliedEvidence?: string;
  readonly recordAppliedContent?: boolean;
  readonly dispatch: () => Promise<FileMutationDispatchResult>;
}): Promise<FileMutationExecutionResult> {
  const mutation = await input.dispatch();
  if (!mutation.success) {
    const reason = mutation.error ?? input.failureReason;
    return {
      failedFile: { path: input.path, reason },
      patch: {
        path: input.path,
        operation: input.operation,
        status: "failed",
        failureCode: "write-failed",
        reason,
      },
    };
  }

  return {
    changedFile: input.path,
    patch: {
      path: input.path,
      operation: input.operation,
      status: "applied",
      changedLines: input.changedLines,
      addedLines: input.addedLines,
      removedLines: input.removedLines,
    },
    appliedContent:
      input.recordAppliedContent === false
        ? undefined
        : {
            path: input.path,
            normalizedPath: normalizePathLike(input.path),
            content: input.content,
          },
    note: input.appliedNote,
    evidence: input.appliedEvidence,
  };
}

function normalizePathLike(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\/+/g, "").trim();
}
