import type {
  PatchFailure,
  PatchFailureCode,
  PatchFileOperation,
} from "../../../orchestration/patchParsing/types.js";

export function isAddOperation(
  operation: PatchFileOperation,
): operation is Extract<PatchFileOperation, { kind: "add" }> {
  return operation.kind === "add";
}

export function isUpdateOperation(
  operation: PatchFileOperation,
): operation is Extract<PatchFileOperation, { kind: "update" }> {
  return operation.kind === "update";
}

export function isDeleteOperation(
  operation: PatchFileOperation,
): operation is Extract<PatchFileOperation, { kind: "delete" }> {
  return operation.kind === "delete";
}

export function isMoveOperation(
  operation: PatchFileOperation,
): operation is Extract<PatchFileOperation, { kind: "move" }> {
  return operation.kind === "move";
}

export function targetPathForOperation(operation: PatchFileOperation): string {
  if (operation.kind === "move") {
    return operation.moveTo;
  }
  return operation.path;
}

export function pathsForOperation(
  operation: PatchFileOperation,
): readonly string[] {
  if (operation.kind === "move") {
    return [operation.path, operation.moveTo];
  }
  return [operation.path];
}

export function normalizePathKey(filePath: string): string {
  return filePath.replace(/\\/g, "/").toLowerCase();
}

export function duplicateTargetsForOperations(
  operations: readonly PatchFileOperation[],
): readonly string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const op of operations) {
    const target = normalizePathKey(targetPathForOperation(op));
    if (seen.has(target)) {
      duplicates.add(targetPathForOperation(op));
    }
    seen.add(target);
  }

  return Array.from(duplicates);
}

export function patchFailure(input: {
  readonly code: PatchFailureCode;
  readonly path?: string;
  readonly message: string;
  readonly nextAction?: string;
}): PatchFailure {
  return {
    code: input.code,
    path: input.path,
    message: input.message,
    nextAction: input.nextAction,
  };
}
