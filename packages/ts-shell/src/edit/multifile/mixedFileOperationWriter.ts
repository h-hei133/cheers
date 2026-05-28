import type {
  PatchFailure,
  PatchFileOperation,
  VerifiedPatchFileOperation,
} from "../../orchestration/patchParsing/types.js";

export interface MixedFileOperationWriterOptions {
  readonly writeFile: (relativePath: string, content: string) => void | Promise<void>;
  readonly createFileExclusive: (
    relativePath: string,
    content: string,
  ) => void | Promise<void>;
  readonly moveFileExclusive: (
    sourcePath: string,
    targetPath: string,
  ) => void | Promise<void>;
  readonly deleteFile: (relativePath: string) => void | Promise<void>;
  readonly readVerifiedFile: (relativePath: string) => string | undefined;
}

export type MixedFileOperationWriteResult =
  | {
      readonly ok: true;
      readonly changedFiles: readonly string[];
      readonly failedFiles: readonly [];
      readonly postWriteVerification: "passed";
    }
  | {
      readonly ok: false;
      readonly changedFiles: readonly string[];
      readonly failedFiles: readonly PatchFailure[];
      readonly postWriteVerification: "blocked" | "failed";
    };

export async function writeMixedFileOperations(
  options: MixedFileOperationWriterOptions,
  operations: readonly VerifiedPatchFileOperation[],
): Promise<MixedFileOperationWriteResult> {
  const changedFiles: string[] = [];
  // Parsed order is preserved after all preflight checks; this does not imply rollback or atomicity.
  for (const operation of operations) {
    const applied = await writeOneOperation(options, operation);
    if (applied.ok === false) {
      return {
        ok: false,
        changedFiles,
        failedFiles: applied.failedFiles,
        postWriteVerification: applied.postWriteVerification,
      };
    }
    changedFiles.push(applied.changedFile);
  }
  return {
    ok: true,
    changedFiles,
    failedFiles: [],
    postWriteVerification: "passed",
  };
}

type OneOperationWriteResult =
  | {
      readonly ok: true;
      readonly changedFile: string;
    }
  | {
      readonly ok: false;
      readonly failedFiles: readonly PatchFailure[];
      readonly postWriteVerification: "blocked" | "failed";
    };

async function writeOneOperation(
  options: MixedFileOperationWriterOptions,
  operation: VerifiedPatchFileOperation,
): Promise<OneOperationWriteResult> {
  const patchOperation = operation.operation;
  try {
    switch (patchOperation.kind) {
      case "update":
        await options.writeFile(patchOperation.path, operation.plannedContent ?? "");
        if (options.readVerifiedFile(patchOperation.path) !== operation.plannedContent) {
          return postWriteFailure(patchOperation.path, "update");
        }
        return { ok: true, changedFile: patchOperation.path };
      case "add":
        await options.createFileExclusive(
          patchOperation.path,
          operation.plannedContent ?? "",
        );
        if (options.readVerifiedFile(patchOperation.path) !== operation.plannedContent) {
          return postWriteFailure(patchOperation.path, "create");
        }
        return { ok: true, changedFile: patchOperation.path };
      case "move":
        await options.moveFileExclusive(patchOperation.path, patchOperation.moveTo);
        if (
          options.readVerifiedFile(patchOperation.path) !== undefined ||
          options.readVerifiedFile(patchOperation.moveTo) !== operation.originalContent
        ) {
          return postWriteFailure(patchOperation.moveTo, "move");
        }
        return { ok: true, changedFile: patchOperation.moveTo };
      case "delete":
        await options.deleteFile(patchOperation.path);
        if (options.readVerifiedFile(patchOperation.path) !== undefined) {
          return postWriteFailure(patchOperation.path, "delete");
        }
        return { ok: true, changedFile: patchOperation.path };
    }
  } catch (error) {
    return {
      ok: false,
      failedFiles: [
        {
          code: "patch-apply-write-failed",
          path: targetPathForOperation(patchOperation),
          message:
            error instanceof Error
              ? `Patch mixed write failed: ${error.message}`
              : "Patch mixed write failed.",
          nextAction:
            "Inspect/re-read all attempted paths before retrying; no rollback was attempted.",
        },
      ],
      postWriteVerification: "blocked",
    };
  }
}

function postWriteFailure(
  targetPath: string,
  operation: "update" | "create" | "move" | "delete",
): OneOperationWriteResult {
  return {
    ok: false,
    failedFiles: [
      {
        code: "patch-apply-write-failed",
        path: targetPath,
        message: `Patch mixed ${operation} post-write verification failed.`,
        nextAction:
          "Inspect/re-read all attempted paths before retrying; no rollback was attempted.",
      },
    ],
    postWriteVerification: "failed",
  };
}

function targetPathForOperation(operation: PatchFileOperation): string {
  return operation.kind === "move" ? operation.moveTo : operation.path;
}
