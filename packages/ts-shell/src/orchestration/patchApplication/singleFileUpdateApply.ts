import type { PatchFailure } from "../patchParsing/types.js";
import type {
  NoPartialPatchApplicationContract,
  PatchWriteIntent,
} from "./noPartialApply.js";

export interface SingleFileUpdateApplyOptions {
  readonly writeFile: (path: string, content: string) => void | Promise<void>;
}

export type SingleFileUpdateApplyResult =
  | {
      readonly ok: true;
      readonly changedFiles: readonly string[];
      readonly failedFiles: readonly [];
      readonly applied: readonly PatchWriteIntent[];
    }
  | {
      readonly ok: false;
      readonly changedFiles: readonly [];
      readonly failedFiles: readonly PatchFailure[];
    };

export async function applySingleFileUpdateIntent(
  contract: NoPartialPatchApplicationContract,
  options: SingleFileUpdateApplyOptions,
): Promise<SingleFileUpdateApplyResult> {
  if (contract.ok === false) {
    return fail(contract.failures);
  }

  if (contract.writeIntents.length !== 1) {
    return fail([
      {
        code: "patch-apply-plan-not-verified",
        message:
          "Patch apply only supports exactly one verified update write intent.",
        nextAction:
          "Reduce the patch to one verified update operation before applying.",
      },
    ]);
  }

  const intent = contract.writeIntents[0];
  if (!intent) {
    return fail([
      {
        code: "patch-apply-plan-not-verified",
        message:
          "Patch apply only supports exactly one verified update write intent.",
        nextAction:
          "Reduce the patch to one verified update operation before applying.",
      },
    ]);
  }

  if (intent.kind !== "update") {
    return fail([
      {
        code: "patch-apply-plan-not-verified",
        path: intent.path,
        message: "Patch apply only supports verified update operations.",
        nextAction: "Use a single Update File patch operation before applying.",
      },
    ]);
  }

  if (typeof intent.content !== "string") {
    return fail([
      {
        code: "patch-apply-plan-not-verified",
        path: intent.path,
        message: "Patch apply requires verified replacement content.",
        nextAction:
          "Re-run patch verification and ensure the update has planned content.",
      },
    ]);
  }

  try {
    await options.writeFile(intent.path, intent.content);
  } catch (error) {
    return fail([
      {
        code: "patch-apply-write-failed",
        path: intent.path,
        message:
          error instanceof Error
            ? `Patch write failed: ${error.message}`
            : "Patch write failed.",
        nextAction:
          "Retry after checking filesystem permissions and target file state.",
      },
    ]);
  }

  return {
    ok: true,
    changedFiles: [intent.path],
    failedFiles: [],
    applied: [intent],
  };
}

function fail(
  failedFiles: readonly PatchFailure[],
): SingleFileUpdateApplyResult {
  return {
    ok: false,
    changedFiles: [],
    failedFiles,
  };
}
