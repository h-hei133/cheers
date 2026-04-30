import type {
  CodingPatchOperation,
  CodingPatchRecord,
} from "./types.js";

export interface FileMutationDispatchResult {
  readonly success: boolean;
  readonly error?: string;
}

export interface FileMutationReadCurrentContentResult {
  readonly success: boolean;
  readonly content?: string;
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

export type FileMutationExecutionSummary =
  | {
      readonly ok: true;
      readonly status: "applied";
      readonly changedFiles: readonly string[];
      readonly failedFiles: readonly [];
      readonly patches: readonly CodingPatchRecord[];
      readonly evidence: readonly string[];
    }
  | {
      readonly ok: false;
      readonly status: "failed";
      readonly blocker: {
        readonly code: "partial-mutation-failed";
        readonly reason: string;
        readonly nextAction: string;
      };
      readonly changedFiles: readonly string[];
      readonly failedFiles: readonly { readonly path: string; readonly reason: string }[];
      readonly patches: readonly CodingPatchRecord[];
      readonly evidence: readonly string[];
    };

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
  readonly expectedContentBeforeWrite?: string;
  readonly readContentBeforeWrite?: () => Promise<FileMutationReadCurrentContentResult>;
  readonly dispatch: () => Promise<FileMutationDispatchResult>;
}): Promise<FileMutationExecutionResult> {
  if (
    input.expectedContentBeforeWrite !== undefined &&
    input.readContentBeforeWrite
  ) {
    const current = await input.readContentBeforeWrite();
    if (!current.success) {
      const reason =
        current.error ??
        "stale-read: Could not verify the current file content before writing.";
      return {
        failedFile: { path: input.path, reason },
        patch: {
          path: input.path,
          operation: input.operation,
          status: "failed",
          failureCode: "stale-read",
          reason,
        },
        evidence: `stale-read-blocker:${normalizePathLike(input.path)}`,
      };
    }
    if (current.content !== input.expectedContentBeforeWrite) {
      const reason =
        "stale-read: Target file changed since it was read for this edit. Re-read the latest file content and rerun the mutation.";
      return {
        failedFile: { path: input.path, reason },
        patch: {
          path: input.path,
          operation: input.operation,
          status: "failed",
          failureCode: "stale-read",
          reason,
        },
        evidence: `stale-read-blocker:${normalizePathLike(input.path)}`,
      };
    }
  }

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

export function summarizeFileMutationResults(
  results: readonly FileMutationExecutionResult[],
): FileMutationExecutionSummary {
  const changedFiles = results
    .map((result) => result.changedFile)
    .filter((path): path is string => Boolean(path));
  const failedFiles = results.flatMap((result) => {
    const failures: Array<{ path: string; reason: string }> = [];
    if (result.failedFile) {
      failures.push(result.failedFile);
    }
    if (result.patch.status === "failed" && !result.failedFile) {
      failures.push({
        path: result.patch.path,
        reason: result.patch.reason ?? "Mutation patch failed.",
      });
    }
    return failures;
  });
  const patches = results.map((result) => result.patch);
  const evidence = results
    .map((result) => result.evidence)
    .filter((item): item is string => Boolean(item));

  if (failedFiles.length > 0) {
    return {
      ok: false,
      status: "failed",
      blocker: {
        code: "partial-mutation-failed",
        reason:
          "One or more file mutations failed, so the mutation set cannot be reported as successfully applied.",
        nextAction:
          "Review the failed files, re-read current content, and retry only the unresolved mutation.",
      },
      changedFiles,
      failedFiles,
      patches,
      evidence,
    };
  }

  return {
    ok: true,
    status: "applied",
    changedFiles,
    failedFiles: [],
    patches,
    evidence,
  };
}

function normalizePathLike(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\/+/g, "").trim();
}
