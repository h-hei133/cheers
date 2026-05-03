import type {
  PatchFailure,
  PatchOperationKind,
  PatchVerificationResult,
  VerifiedPatchFileOperation,
} from "../patchParsing/types.js";

export interface PatchWriteIntent {
  readonly path: string;
  readonly kind: PatchOperationKind;
  readonly content: string | undefined;
}

export type NoPartialPatchApplicationContract =
  | {
      readonly ok: true;
      readonly changedFiles: readonly string[];
      readonly writeIntents: readonly PatchWriteIntent[];
      readonly atomicity: "verify-all-before-write";
    }
  | {
      readonly ok: false;
      readonly changedFiles: readonly [];
      readonly writeIntents: readonly [];
      readonly failures: readonly PatchFailure[];
      readonly failureCode: "patch-no-partial-apply-blocked";
    };

export function buildNoPartialPatchApplicationContract(
  verification: PatchVerificationResult,
): NoPartialPatchApplicationContract {
  if (verification.ok === false) {
    return {
      ok: false,
      changedFiles: [],
      writeIntents: [],
      failures: verification.failures,
      failureCode: "patch-no-partial-apply-blocked",
    };
  }

  const writeIntents = verification.plan.operations.map(toWriteIntent);
  return {
    ok: true,
    changedFiles: writeIntents.map((intent) => intent.path),
    writeIntents,
    atomicity: "verify-all-before-write",
  };
}

function toWriteIntent(operation: VerifiedPatchFileOperation): PatchWriteIntent {
  switch (operation.operation.kind) {
    case "add":
    case "update":
      return {
        path: operation.operation.path,
        kind: operation.operation.kind,
        content: operation.plannedContent ?? "",
      };
    case "delete":
      return {
        path: operation.operation.path,
        kind: "delete",
        content: undefined,
      };
    case "move":
      return {
        path: operation.operation.moveTo,
        kind: "move",
        content: operation.plannedContent ?? "",
      };
  }
}
