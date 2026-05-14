import type { PatchFailure, PatchVerificationResult } from "../patchParsing/types.js";

export interface SingleFileMoveIntent {
  readonly sourcePath: string;
  readonly targetPath: string;
  readonly content: string;
}

export type SingleFileMoveApplicationContract =
  | {
      readonly ok: true;
      readonly changedFiles: readonly [string];
      readonly moveIntent: SingleFileMoveIntent;
    }
  | {
      readonly ok: false;
      readonly changedFiles: readonly [];
      readonly failures: readonly PatchFailure[];
      readonly failureCode: "patch-move-application-not-verified";
    };

export interface SingleFileMoveApplyOptions {
  readonly moveFileExclusive: (
    sourcePath: string,
    targetPath: string,
  ) => void | Promise<void>;
  readonly readFile: (path: string) => string | undefined;
}

export type SingleFileMoveApplyFailureKind =
  | "write-application"
  | "post-write-verification";

export type SingleFileMoveApplyResult =
  | {
      readonly ok: true;
      readonly changedFiles: readonly [string];
      readonly failedFiles: readonly [];
      readonly applied: SingleFileMoveIntent;
      readonly postWriteVerification: "passed";
    }
  | {
      readonly ok: false;
      readonly changedFiles: readonly string[];
      readonly failedFiles: readonly PatchFailure[];
      readonly applied?: SingleFileMoveIntent;
      readonly failureKind: SingleFileMoveApplyFailureKind;
      readonly postWriteVerification: "blocked" | "failed";
    };

export function buildSingleFileMoveApplicationContract(
  verification: PatchVerificationResult,
): SingleFileMoveApplicationContract {
  if (verification.ok === false) {
    return failContract(verification.failures);
  }

  const operation = verification.plan.operations[0];
  if (verification.plan.operations.length !== 1 || !operation) {
    return failContract([
      {
        code: "patch-apply-plan-not-verified",
        message:
          "Patch move only supports exactly one verified Move File operation.",
        nextAction:
          "Reduce the patch to one verified Move File operation before applying.",
      },
    ]);
  }

  if (operation.operation.kind !== "move") {
    return failContract([
      {
        code: "patch-apply-plan-not-verified",
        path: operation.operation.path,
        message: "Patch move only supports verified Move File operations.",
        nextAction: "Use a single Move File patch operation before applying.",
      },
    ]);
  }

  if (
    typeof operation.originalContent !== "string" ||
    typeof operation.plannedContent !== "string"
  ) {
    return failContract([
      {
        code: "patch-apply-plan-not-verified",
        path: operation.operation.path,
        message: "Patch move requires verified source content.",
        nextAction:
          "Re-run patch verification and ensure the source file can be read.",
      },
    ]);
  }

  if (operation.plannedContent !== operation.originalContent) {
    return failContract([
      {
        code: "patch-apply-plan-not-verified",
        path: operation.operation.moveTo,
        message:
          "Move File in this guarded lane must preserve file content exactly; content edits during move are not enabled.",
        nextAction:
          "Regenerate the patch as a pure Move File/rename, then use a separate approved update route for content changes.",
      },
    ]);
  }

  return {
    ok: true,
    changedFiles: [operation.operation.moveTo],
    moveIntent: {
      sourcePath: operation.operation.path,
      targetPath: operation.operation.moveTo,
      content: operation.originalContent,
    },
  };
}

export async function applySingleFileMoveIntent(
  contract: SingleFileMoveApplicationContract,
  options: SingleFileMoveApplyOptions,
): Promise<SingleFileMoveApplyResult> {
  if (contract.ok === false) {
    return fail(contract.failures, [], undefined, "write-application", "blocked");
  }

  const intent = contract.moveIntent;
  try {
    await options.moveFileExclusive(intent.sourcePath, intent.targetPath);
  } catch (error) {
    return fail(
      [
        {
          code: "patch-apply-write-failed",
          path: intent.targetPath,
          message:
            error instanceof Error
              ? `Patch move failed: ${error.message}`
              : "Patch move failed.",
          nextAction:
            "Inspect/re-read the source and target paths before retrying; no rollback was attempted.",
        },
      ],
      [],
      intent,
      "write-application",
      "blocked",
    );
  }

  const sourceReadback = options.readFile(intent.sourcePath);
  const targetReadback = options.readFile(intent.targetPath);
  if (sourceReadback !== undefined || targetReadback !== intent.content) {
    const changedFiles = targetReadback !== undefined ? [intent.targetPath] : [];
    return fail(
      [
        {
          code: "patch-apply-write-failed",
          path: intent.targetPath,
          message:
            "Patch move post-write verification failed: source must be absent and target content must match original source content.",
          nextAction:
            "Inspect/re-read the source and target paths before retrying; no rollback was attempted.",
        },
      ],
      changedFiles,
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
): SingleFileMoveApplicationContract {
  return {
    ok: false,
    changedFiles: [],
    failures,
    failureCode: "patch-move-application-not-verified",
  };
}

function fail(
  failedFiles: readonly PatchFailure[],
  changedFiles: readonly string[],
  applied: SingleFileMoveIntent | undefined,
  failureKind: SingleFileMoveApplyFailureKind,
  postWriteVerification: "blocked" | "failed",
): SingleFileMoveApplyResult {
  return {
    ok: false,
    changedFiles: [...changedFiles],
    failedFiles,
    ...(applied ? { applied } : {}),
    failureKind,
    postWriteVerification,
  };
}
