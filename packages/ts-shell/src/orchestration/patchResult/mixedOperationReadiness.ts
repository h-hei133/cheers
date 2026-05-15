import type {
  PatchFileOperation,
  PatchOperationKind,
} from "../patchParsing/types.js";

export type MixedOperationKind = "update" | "create" | "delete" | "move";

export type MixedOperationReadinessPrerequisite =
  | "transaction-rollback-decision"
  | "operation-ordering"
  | "destructive-operation-confirmation"
  | "partial-failure-semantics"
  | "post-write-verification-semantics"
  | "per-operation-authority";

export interface MixedOperationReadinessProjection {
  readonly isMixedOperation: boolean;
  readonly operationKinds: readonly MixedOperationKind[];
  readonly operationCount: number;
  readonly individuallySupportedKinds: readonly MixedOperationKind[];
  readonly unsupportedIndividualKinds: readonly MixedOperationKind[];
  readonly blockedCombinations: readonly string[];
  readonly routeBlocker: "mixed-operation-route-not-enabled" | "none";
  readonly additionalPrerequisites: readonly MixedOperationReadinessPrerequisite[];
  readonly mixedWritesEnabled: boolean;
  readonly rollbackOrAtomicityClaim: "none";
  readonly writeAuthority: "not-granted-by-readiness-projection";
}

const currentSingleOperationLanes = new Set<MixedOperationKind>([
  "update",
  "create",
  "delete",
  "move",
]);

const mixedWritePrerequisites: readonly MixedOperationReadinessPrerequisite[] = [
  "transaction-rollback-decision",
  "operation-ordering",
  "destructive-operation-confirmation",
  "partial-failure-semantics",
  "post-write-verification-semantics",
  "per-operation-authority",
];

export function projectMixedOperationReadiness(
  operations: readonly PatchFileOperation[],
): MixedOperationReadinessProjection {
  const operationKinds = uniqueOperationKinds(
    operations.map(operationKindForPatchOperation),
  );
  const isMixedOperation = operationKinds.length > 1;
  const mixedWritesEnabled =
    isMixedOperation &&
    (operations.length === 2 || operations.length === 3) &&
    operationKinds.every((kind) => currentSingleOperationLanes.has(kind));
  const blocked = isMixedOperation && !mixedWritesEnabled;
  return {
    isMixedOperation,
    operationKinds,
    operationCount: operations.length,
    individuallySupportedKinds: operationKinds.filter((kind) =>
      currentSingleOperationLanes.has(kind),
    ),
    unsupportedIndividualKinds: operationKinds.filter(
      (kind) => !currentSingleOperationLanes.has(kind),
    ),
    blockedCombinations: blocked
      ? [operationKinds.join("+")]
      : [],
    routeBlocker: blocked
      ? "mixed-operation-route-not-enabled"
      : "none",
    additionalPrerequisites: blocked
      ? mixedWritePrerequisites
      : [],
    mixedWritesEnabled,
    rollbackOrAtomicityClaim: "none",
    writeAuthority: "not-granted-by-readiness-projection",
  };
}

function operationKindForPatchOperation(
  operation: PatchFileOperation,
): MixedOperationKind {
  if (operation.kind === "add") {
    return "create";
  }
  return operation.kind;
}

function uniqueOperationKinds(
  operationKinds: readonly MixedOperationKind[],
): readonly MixedOperationKind[] {
  const seen = new Set<PatchOperationKind | "create">();
  const unique: MixedOperationKind[] = [];
  for (const kind of operationKinds) {
    if (seen.has(kind)) {
      continue;
    }
    seen.add(kind);
    unique.push(kind);
  }
  return unique;
}
