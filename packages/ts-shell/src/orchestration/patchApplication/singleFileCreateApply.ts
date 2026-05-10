import type { PatchFailure } from "../patchParsing/types.js";
import type {
  NoPartialPatchApplicationContract,
  PatchWriteIntent,
} from "./noPartialApply.js";

export interface SingleFileCreateApplyOptions {
  readonly createFileExclusive: (
    path: string,
    content: string,
  ) => void | Promise<void>;
  readonly readFile: (path: string) => string | undefined;
}

export type SingleFileCreateApplyFailureKind =
  | "write-application"
  | "post-write-verification";

export type SingleFileCreateApplyResult =
  | {
      readonly ok: true;
      readonly changedFiles: readonly [string];
      readonly failedFiles: readonly [];
      readonly applied: readonly [PatchWriteIntent];
      readonly postWriteVerification: "passed";
    }
  | {
      readonly ok: false;
      readonly changedFiles: readonly [];
      readonly failedFiles: readonly PatchFailure[];
      readonly failureKind: SingleFileCreateApplyFailureKind;
      readonly postWriteVerification: "blocked" | "failed";
    };

export async function applySingleFileCreateIntent(
  contract: NoPartialPatchApplicationContract,
  options: SingleFileCreateApplyOptions,
): Promise<SingleFileCreateApplyResult> {
  if (contract.ok === false) {
    return fail(contract.failures, "write-application", "blocked");
  }

  const intent = contract.writeIntents[0];
  if (contract.writeIntents.length !== 1 || !intent) {
    return fail(
      [
        {
          code: "patch-apply-plan-not-verified",
          message:
            "Patch create only supports exactly one verified add write intent.",
          nextAction:
            "Reduce the patch to one verified Add File operation before applying.",
        },
      ],
      "write-application",
      "blocked",
    );
  }

  if (intent.kind !== "add") {
    return fail(
      [
        {
          code: "patch-apply-plan-not-verified",
          path: intent.path,
          message: "Patch create only supports verified Add File operations.",
          nextAction: "Use a single Add File patch operation before applying.",
        },
      ],
      "write-application",
      "blocked",
    );
  }

  if (typeof intent.content !== "string") {
    return fail(
      [
        {
          code: "patch-apply-plan-not-verified",
          path: intent.path,
          message: "Patch create requires verified file content.",
          nextAction:
            "Re-run patch verification and ensure the Add File operation has planned content.",
        },
      ],
      "write-application",
      "blocked",
    );
  }

  try {
    await options.createFileExclusive(intent.path, intent.content);
  } catch (error) {
    return fail(
      [
        {
          code: "patch-apply-write-failed",
          path: intent.path,
          message:
            error instanceof Error
              ? `Patch create failed: ${error.message}`
              : "Patch create failed.",
          nextAction:
            "Retry after checking filesystem permissions and target file state.",
        },
      ],
      "write-application",
      "blocked",
    );
  }

  const readback = options.readFile(intent.path);
  if (readback !== intent.content) {
    return fail(
      [
        {
          code: "patch-apply-write-failed",
          path: intent.path,
          message:
            "Patch create post-write verification failed: readback did not match planned content.",
          nextAction:
            "Re-read the created file, inspect the current content, then retry or repair from that current state.",
        },
      ],
      "post-write-verification",
      "failed",
    );
  }

  return {
    ok: true,
    changedFiles: [intent.path],
    failedFiles: [],
    applied: [intent],
    postWriteVerification: "passed",
  };
}

function fail(
  failedFiles: readonly PatchFailure[],
  failureKind: SingleFileCreateApplyFailureKind,
  postWriteVerification: "blocked" | "failed",
): SingleFileCreateApplyResult {
  return {
    ok: false,
    changedFiles: [],
    failedFiles,
    failureKind,
    postWriteVerification,
  };
}
