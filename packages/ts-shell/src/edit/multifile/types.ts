import type { VerificationResultObservation } from "../../verification/result/boundary.js";

export type MultiTargetOperationKind =
  | "read_only"
  | "create"
  | "update"
  | "delete"
  | "move"
  | "unsupported"
  | "unknown";

export type MultiTargetClassificationStatus =
  | MultiTargetOperationKind
  | "authority_required"
  | "blocked";

export type MultiTargetConflictKind =
  | "same_file_overlap"
  | "overlapping_hunk"
  | "stale_base"
  | "missing_file"
  | "path_escape"
  | "unsupported_operation"
  | "dependency_ordering"
  | "snapshot_conflict"
  | "unknown_conflict";

export type MultiTargetAuthorityStatus =
  | "granted"
  | "missing"
  | "partial"
  | "denied"
  | "blocked";

export type MultiTargetStaleReadStatus =
  | "not_run"
  | "passed"
  | "stale"
  | "target_missing"
  | "target_exists"
  | "blocked"
  | "failed";

export type MultiTargetSnapshotStatus =
  | "not_planned"
  | "planned"
  | "unavailable";

export type MultiTargetQueueState =
  | "planned"
  | "ready"
  | "skipped"
  | "blocked"
  | "applying"
  | "applied"
  | "failed"
  | "reverted"
  | "revert_failed"
  | "unknown";

export type MultiTargetGraphRelationKind =
  | "independent"
  | "dependency"
  | "conflict"
  | "blocked";

export type MultiTargetParallelEligibilityStatus =
  | "eligible"
  | "forced_sequential"
  | "blocked"
  | "unsupported"
  | "unknown"
  | "authority_required"
  | "stale"
  | "conflict"
  | "dependency_blocked"
  | "snapshot_missing"
  | "rollback_missing"
  | "unsafe";

export type MultiTargetGroupMode = "parallel" | "sequential" | "blocked";

export type MultiTargetGroupStatus =
  | "created"
  | "ready"
  | "applying"
  | "settled"
  | "failed"
  | "skipped"
  | "blocked";

export type MultiTargetSettlementStatus =
  | "applied"
  | "failed"
  | "skipped"
  | "reverted"
  | "revert_failed";

export type MultiTargetVerificationStatus =
  VerificationResultObservation["status"];

export type MultiTargetRepairEligibilityStatus =
  | "eligible"
  | "not_eligible"
  | "not_needed"
  | "blocked";

export type MultiTargetVerdictStatus =
  | "complete"
  | "blocked"
  | "failed"
  | "partial"
  | "not_proven";

export interface MultiTargetMutationTargetInput {
  readonly targetId: string;
  readonly relativePath: string;
  readonly operation: MultiTargetOperationKind;
  readonly expectedContent?: string;
  readonly proposedContent?: string;
  readonly repairContent?: string;
  readonly reportSafeTargetSummary?: string;
  readonly dependsOnTargetIds?: readonly string[];
  readonly hunk?: {
    readonly startLine: number;
    readonly endLine: number;
  };
  readonly authority?: {
    readonly status: Exclude<MultiTargetAuthorityStatus, "partial">;
    readonly reason?: string;
  };
  readonly snapshot?: {
    readonly available: boolean;
    readonly reason?: string;
  };
  readonly verification?: {
    readonly status: MultiTargetVerificationStatus;
    readonly failureClass?: string;
  };
}

export interface MultiTargetMutationInput {
  readonly laneId: string;
  readonly projectRoot: string;
  readonly baseCommit?: string;
  readonly targets: readonly MultiTargetMutationTargetInput[];
  readonly caller?: string;
  readonly requireRollbackSnapshots?: boolean;
}

export interface MultiTargetClassification {
  readonly targetId: string;
  readonly relativePath: string;
  readonly operation: MultiTargetOperationKind;
  readonly status: MultiTargetClassificationStatus;
  readonly safeTargetSummary: string;
  readonly readOnly: boolean;
  readonly mutation: boolean;
  readonly destructive: boolean;
  readonly unsupported: boolean;
  readonly reason: string;
}

export interface MultiTargetConflict {
  readonly conflictId: string;
  readonly leftTargetId: string;
  readonly rightTargetId: string;
  readonly kind: MultiTargetConflictKind;
  readonly reason: string;
  readonly relativePath?: string;
}

export interface MultiTargetAuthorityObservation {
  readonly targetId: string;
  readonly status: MultiTargetAuthorityStatus;
  readonly reason: string;
  readonly granted: boolean;
  readonly blocked: boolean;
}

export interface MultiTargetStaleReadObservation {
  readonly targetId: string;
  readonly status: MultiTargetStaleReadStatus;
  readonly reason: string;
  readonly expectedFingerprint?: string;
  readonly currentFingerprint?: string;
  readonly stale: boolean;
  readonly blocked: boolean;
}

export interface MultiTargetSnapshotObservation {
  readonly targetId: string;
  readonly status: MultiTargetSnapshotStatus;
  readonly reason: string;
  readonly available: boolean;
  readonly snapshotRef?: string;
}

export interface MultiTargetRollbackObservation {
  readonly targetId: string;
  readonly rollbackSupported: boolean;
  readonly reason: string;
  readonly available: boolean;
}

export interface MultiTargetParallelEligibility {
  readonly status: MultiTargetParallelEligibilityStatus;
  readonly allowed: boolean;
  readonly reasons: readonly string[];
}

export interface MultiTargetGraphNode {
  readonly targetId: string;
  readonly relativePath: string;
  readonly dependencies: readonly string[];
  readonly conflicts: readonly string[];
  readonly relationKind: MultiTargetGraphRelationKind;
}

export interface MultiTargetExecutionGroup {
  readonly groupId: string;
  readonly mode: MultiTargetGroupMode;
  readonly targetIds: readonly string[];
  readonly status: MultiTargetGroupStatus;
  readonly reason: string;
}

export interface MultiTargetQueueObservation {
  readonly targetId: string;
  readonly state: MultiTargetQueueState;
  readonly reason: string;
  readonly blocker?: string;
}

export interface MultiTargetSettlementObservation {
  readonly targetId: string;
  readonly status: MultiTargetSettlementStatus;
  readonly reason: string;
  readonly reverted: boolean;
}

export interface MultiTargetRepairEligibility {
  readonly targetId: string;
  readonly status: MultiTargetRepairEligibilityStatus;
  readonly reason: string;
  readonly eligible: boolean;
}

export interface MultiTargetMutationPlan {
  readonly planId: string;
  readonly laneId: string;
  readonly projectRoot: string;
  readonly classifications: readonly MultiTargetClassification[];
  readonly authorityObservations: readonly MultiTargetAuthorityObservation[];
  readonly staleReadObservations: readonly MultiTargetStaleReadObservation[];
  readonly snapshotObservations: readonly MultiTargetSnapshotObservation[];
  readonly rollbackObservations: readonly MultiTargetRollbackObservation[];
  readonly conflicts: readonly MultiTargetConflict[];
  readonly parallelEligibility: MultiTargetParallelEligibility;
  readonly graphNodes: readonly MultiTargetGraphNode[];
  readonly executionGroups: readonly MultiTargetExecutionGroup[];
  readonly initialQueueStates: readonly MultiTargetQueueObservation[];
  readonly notProvenClaims: readonly string[];
  readonly terminalSuccessClaim: false;
}
