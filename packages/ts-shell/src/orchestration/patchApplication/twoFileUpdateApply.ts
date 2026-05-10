import type { PatchFailure } from "../patchParsing/types.js";
import type {
  NoPartialPatchApplicationContract,
  PatchWriteIntent,
} from "./noPartialApply.js";

export interface TwoFileUpdateApplyOptions {
  readonly writeFile: (path: string, content: string) => void | Promise<void>;
  readonly readFile: (path: string) => string | undefined;
}

export type TwoFileUpdateApplyFailureKind =
  | "write-application"
  | "post-write-verification";

export type TwoFileUpdateApplyResult =
  | {
      readonly ok: true;
      readonly changedFiles: readonly [string, string];
      readonly failedFiles: readonly [];
      readonly applied: readonly [PatchWriteIntent, PatchWriteIntent];
      readonly postWriteVerification: "passed";
    }
  | {
      readonly ok: false;
      readonly changedFiles: readonly string[];
      readonly failedFiles: readonly PatchFailure[];
      readonly applied: readonly PatchWriteIntent[];
      readonly failureKind: TwoFileUpdateApplyFailureKind;
      readonly postWriteVerification: "blocked" | "failed";
    };

export async function applyTwoFileUpdateIntents(
  contract: NoPartialPatchApplicationContract,
  options: TwoFileUpdateApplyOptions,
): Promise<TwoFileUpdateApplyResult> {
  if (contract.ok === false) {
    return fail(contract.failures, [], [], "write-application", "blocked");
  }

  const intents = contract.writeIntents;
  if (intents.length !== 2 || !intents[0] || !intents[1]) {
    return fail(
      [
        {
          code: "patch-apply-plan-not-verified",
          message:
            "Patch apply only supports exactly two verified update write intents in the multi-file candidate route.",
          nextAction:
            "Use exactly two verified Update File operations before applying through the multi-file route.",
        },
      ],
      [],
      [],
      "write-application",
      "blocked",
    );
  }

  if (new Set(intents.map((intent) => intent.path)).size !== 2) {
    return fail(
      [
        {
          code: "patch-apply-plan-not-verified",
          message:
            "Patch apply requires two distinct update targets in the multi-file candidate route.",
          nextAction:
            "Regenerate the patch with exactly two distinct existing-file Update File operations.",
        },
      ],
      [],
      [],
      "write-application",
      "blocked",
    );
  }

  for (const intent of intents) {
    if (intent.kind !== "update") {
      return fail(
        [
          {
            code: "patch-apply-plan-not-verified",
            path: intent.path,
            message:
              "Multi-file patch apply only supports verified Update File operations.",
            nextAction:
              "Keep add, delete, move, and mixed operations out of the two-file update route.",
          },
        ],
        [],
        [],
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
            message:
              "Multi-file patch apply requires verified replacement content for each update target.",
            nextAction:
              "Re-run patch verification and ensure both updates have planned content.",
          },
        ],
        [],
        [],
        "write-application",
        "blocked",
      );
    }
  }

  const changedFiles: string[] = [];
  const applied: PatchWriteIntent[] = [];

  for (const intent of intents) {
    try {
      await options.writeFile(intent.path, intent.content);
    } catch (error) {
      return fail(
        [
          {
            code: "patch-apply-write-failed",
            path: intent.path,
            message:
              error instanceof Error
                ? `Patch write failed: ${error.message}`
                : "Patch write failed.",
            nextAction:
              "Inspect/re-read both attempted files before retrying; no rollback was attempted.",
          },
        ],
        changedFiles,
        applied,
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
              "Patch update post-write verification failed: readback did not match planned content.",
            nextAction:
              "Inspect/re-read both attempted files before retrying; no rollback was attempted.",
          },
        ],
        changedFiles,
        applied,
        "post-write-verification",
        "failed",
      );
    }

    changedFiles.push(intent.path);
    applied.push(intent);
  }

  return {
    ok: true,
    changedFiles: [intents[0].path, intents[1].path],
    failedFiles: [],
    applied: [intents[0], intents[1]],
    postWriteVerification: "passed",
  };
}

function fail(
  failedFiles: readonly PatchFailure[],
  changedFiles: readonly string[],
  applied: readonly PatchWriteIntent[],
  failureKind: TwoFileUpdateApplyFailureKind,
  postWriteVerification: "blocked" | "failed",
): TwoFileUpdateApplyResult {
  return {
    ok: false,
    changedFiles: [...changedFiles],
    failedFiles,
    applied: [...applied],
    failureKind,
    postWriteVerification,
  };
}
