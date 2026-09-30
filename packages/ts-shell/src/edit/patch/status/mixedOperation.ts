

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
