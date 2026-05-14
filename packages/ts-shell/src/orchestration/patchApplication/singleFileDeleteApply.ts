import type { PatchFailure, PatchVerificationResult } from "../patchParsing/types.js";

export interface SingleFileDeleteIntent {
  readonly targetPath: string;
  readonly content: string;
}

export type SingleFileDeleteApplicationContract =
  | {
      readonly ok: true;
      readonly changedFiles: readonly [string];
      readonly deleteIntent: SingleFileDeleteIntent;
    }
  | {
      readonly ok: false;
      readonly changedFiles: readonly [];
      readonly failures: readonly PatchFailure[];
      readonly failureCode: "patch-delete-application-not-verified";
    };

export interface SingleFileDeleteApplyOptions {
  readonly deleteFile: (targetPath: string) => void | Promise<void>;
  readonly readFile: (path: string) => string | undefined;
}

export type SingleFileDeleteApplyFailureKind =
  | "write-application"
  | "post-write-verification";

export type SingleFileDeleteApplyResult =
  | {
      readonly ok: true;
      readonly changedFiles: readonly [string];
      readonly failedFiles: readonly [];
      readonly applied: SingleFileDeleteIntent;
      readonly postWriteVerification: "passed";
    }
  | {
      readonly ok: false;
      readonly changedFiles: readonly string[];
      readonly failedFiles: readonly PatchFailure[];
      readonly applied?: SingleFileDeleteIntent;
      readonly failureKind: SingleFileDeleteApplyFailureKind;
      readonly postWriteVerification: "blocked" | "failed";
    };

export function buildSingleFileDeleteApplicationContract(
  verification: PatchVerificationResult,
): SingleFileDeleteApplicationContract {
  if (verification.ok === false) {
    return failContract(verification.failures);
  }

  const operation = verification.plan.operations[0];
  if (verification.plan.operations.length !== 1 || !operation) {
    return failContract([
      {
        code: "patch-apply-plan-not-verified",
        message:
          "Patch delete only supports exactly one verified Delete File operation.",
        nextAction:
          "Reduce the patch to one verified Delete File operation before applying.",
      },
    ]);
  }

  if (operation.operation.kind !== "delete") {
    return failContract([
      {
        code: "patch-apply-plan-not-verified",
        path: operation.operation.path,
        message: "Patch delete only supports verified Delete File operations.",
        nextAction: "Use a single Delete File patch operation before applying.",
      },
    ]);
  }

  if (typeof operation.originalContent !== "string") {
    return failContract([
      {
        code: "patch-apply-plan-not-verified",
        path: operation.operation.path,
        message: "Patch delete requires verified target content.",
        nextAction:
          "Re-run patch verification and ensure the target file can be read.",
      },
    ]);
  }

  return {
    ok: true,
    changedFiles: [operation.operation.path],
    deleteIntent: {
      targetPath: operation.operation.path,
      content: operation.originalContent,
    },
  };
}

export async function applySingleFileDeleteIntent(
  contract: SingleFileDeleteApplicationContract,
  options: SingleFileDeleteApplyOptions,
): Promise<SingleFileDeleteApplyResult> {
  if (contract.ok === false) {
    return fail(contract.failures, [], undefined, "write-application", "blocked");
  }

  const intent = contract.deleteIntent;
  try {
    await options.deleteFile(intent.targetPath);
  } catch (error) {
    return fail(
      [
        {
          code: "patch-apply-write-failed",
          path: intent.targetPath,
          message:
            error instanceof Error
              ? `Patch delete failed: ${error.message}`
              : "Patch delete failed.",
          nextAction:
            "Inspect/re-read the target path before retrying; no rollback was attempted.",
        },
      ],
      [],
      intent,
      "write-application",
      "blocked",
    );
  }

  const targetReadback = options.readFile(intent.targetPath);
  if (targetReadback !== undefined) {
    return fail(
      [
        {
          code: "patch-apply-write-failed",
          path: intent.targetPath,
          message:
            "Patch delete post-write verification failed: target must be absent after delete.",
          nextAction:
            "Inspect/re-read the target path before retrying; no rollback was attempted.",
        },
      ],
      [],
      intent,
      "post-write-verification",
      "failed",
    );
  }

  return {
    ok: true,
    changedFiles: [intent.targetPath],
    failedFiles: [],
    applied: intent,
    postWriteVerification: "passed",
  };
}

function failContract(
  failures: readonly PatchFailure[],
): SingleFileDeleteApplicationContract {
  return {
    ok: false,
    changedFiles: [],
    failures,
    failureCode: "patch-delete-application-not-verified",
  };
}

function fail(
  failedFiles: readonly PatchFailure[],
  changedFiles: readonly string[],
  applied: SingleFileDeleteIntent | undefined,
  failureKind: SingleFileDeleteApplyFailureKind,
  postWriteVerification: "blocked" | "failed",
): SingleFileDeleteApplyResult {
  return {
    ok: false,
    changedFiles: [...changedFiles],
    failedFiles,
    ...(applied ? { applied } : {}),
    failureKind,
    postWriteVerification,
  };
}
