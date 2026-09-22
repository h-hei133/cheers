import type { ExecutionService } from "../../runtime/execution/service.js";
import type {
  VerificationLoopIntent,
  VerificationResultObservation,
} from "../../verification/result/boundary.js";
import type { MultiTargetMutationProofInput } from "../../evidence/projection/mutation/proof.js";
import type { MultiTargetMutationTerminalProjection } from "../../result/projection/mutation/verdict.js";

/**
 * Multi-target mutation contract.
 *
 * The target, classification, conflict, queue, graph, and settlement shapes shared
 * by the ordering write path and the observation and settlement layers. A leaf
 * module, so those layers depend on the contract instead of on the write path: a
 * type-only import back into `./model.js` is erased at emit and cannot fault, but
 * it becomes a runtime cycle the moment one is converted to a value import.
 */

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

export type MultiTargetAuthorityStatus = "granted" | "missing" | "partial" | "denied" | "blocked";
export type MultiTargetStaleReadStatus = "not_run" | "passed" | "stale" | "target_missing" | "target_exists" | "blocked" | "failed";
export type MultiTargetSnapshotStatus = "not_planned" | "planned" | "unavailable";
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
export type MultiTargetVerificationStatus = VerificationResultObservation["status"];
export type MultiTargetRepairEligibilityStatus = "eligible" | "not_eligible" | "not_needed" | "blocked";
export type MultiTargetVerdictStatus = "complete" | "blocked" | "failed" | "partial" | "not_proven";

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
  readonly turnId: string;
  readonly workspaceRoot: string;
  readonly executionService: Pick<ExecutionService, "readTextFile" | "writeTextFile">;
  readonly targets: readonly MultiTargetMutationTargetInput[];
  readonly authority: {
    readonly status: MultiTargetAuthorityStatus;
    readonly reason?: string;
  };
  readonly parallel?: {
    readonly enabled?: boolean;
    readonly maxGroupSize?: number;
  };
  readonly verification: {
    readonly wholeTaskStatus: MultiTargetVerificationStatus;
    readonly failureClass?: string;
  };
  readonly recovery?: {
    readonly rollbackOnPartialFailure?: boolean;
    readonly repairTargetIds?: readonly string[];
    readonly postRepairWholeTaskStatus?: MultiTargetVerificationStatus;
  };
  readonly notProvenClaims?: readonly string[];
}

export interface MultiTargetMutationPlan {
  readonly planId: string;
  readonly targetCount: number;
  readonly operationKinds: readonly MultiTargetOperationKind[];
  readonly parallelMutation: "unsupported" | "bounded";
  readonly ordering: "sequential" | "bounded_parallel";
  readonly maxGroupSize: number;
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export interface MultiTargetClassification {
  readonly targetId: string;
  readonly targetSummary: string;
  readonly operation: MultiTargetOperationKind;
  readonly status: MultiTargetClassificationStatus;
  readonly reason: string;
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export interface MultiTargetConflict {
  readonly conflictId: string;
  readonly kind: MultiTargetConflictKind;
  readonly targetIds: readonly string[];
  readonly blocked: boolean;
  readonly reason: string;
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export interface MultiTargetAuthorityObservation {
  readonly authorityId: string;
  readonly status: MultiTargetAuthorityStatus;
  readonly targetStatuses: readonly {
    readonly targetId: string;
    readonly status: Exclude<MultiTargetAuthorityStatus, "partial">;
    readonly reason: string;
  }[];
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export interface MultiTargetStaleReadObservation {
  readonly staleReadId: string;
  readonly targetId: string;
  readonly status: MultiTargetStaleReadStatus;
  readonly targetSummary: string;
  readonly expectedFingerprint?: string;
  readonly currentFingerprint?: string;
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export interface MultiTargetSnapshotObservation {
  readonly snapshotId: string;
  readonly targetId: string;
  readonly status: MultiTargetSnapshotStatus;
  readonly restorePlanAvailable: boolean;
  readonly targetSummary: string;
  readonly contentFingerprint?: string;
  readonly blocker?: string;
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export interface MultiTargetQueueObservation {
  readonly queueId: string;
  readonly targetId: string;
  readonly state: MultiTargetQueueState;
  readonly targetSummary: string;
  readonly order: number;
  readonly blocker?: string;
  readonly contentFingerprint?: string;
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export interface MultiTargetGraphNode {
  readonly nodeId: string;
  readonly targetId: string;
  readonly targetSummary: string;
  readonly operation: MultiTargetOperationKind;
  readonly relation: MultiTargetGraphRelationKind;
  readonly conflictIds: readonly string[];
  readonly dependsOnTargetIds: readonly string[];
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export interface MultiTargetParallelEligibility {
  readonly eligibilityId: string;
  readonly targetId: string;
  readonly status: MultiTargetParallelEligibilityStatus;
  readonly reason: string;
  readonly groupable: boolean;
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export interface MultiTargetExecutionGroup {
  readonly groupId: string;
  readonly mode: MultiTargetGroupMode;
  readonly status: MultiTargetGroupStatus;
  readonly targetIds: readonly string[];
  readonly order: number;
  readonly maxGroupSize: number;
  readonly blockedReason?: string;
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export interface MultiTargetSettlementObservation {
  readonly settlementId: string;
  readonly groupId: string;
  readonly targetId: string;
  readonly status: MultiTargetSettlementStatus;
  readonly order: number;
  readonly targetSummary: string;
  readonly originalFailure?: string;
  readonly contentFingerprint?: string;
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export interface MultiTargetRollbackObservation {
  readonly rollbackId: string;
  readonly status: "not_required" | "required" | "succeeded" | "failed";
  readonly targetIds: readonly string[];
  readonly revertedTargetIds: readonly string[];
  readonly failedTargetIds: readonly string[];
  readonly preservesOriginalFailure: true;
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export interface MultiTargetRepairEligibility {
  readonly eligibilityId: string;
  readonly status: MultiTargetRepairEligibilityStatus;
  readonly targetIds: readonly string[];
  readonly originalFailureIds: readonly string[];
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export interface MultiTargetMutationProjection {
  readonly laneId: string;
  readonly turnId: string;
  readonly plan: MultiTargetMutationPlan;
  readonly classifications: readonly MultiTargetClassification[];
  readonly conflicts: readonly MultiTargetConflict[];
  readonly authority: MultiTargetAuthorityObservation;
  readonly staleReads: readonly MultiTargetStaleReadObservation[];
  readonly snapshots: readonly MultiTargetSnapshotObservation[];
  readonly graph: readonly MultiTargetGraphNode[];
  readonly parallelEligibility: readonly MultiTargetParallelEligibility[];
  readonly executionGroups: readonly MultiTargetExecutionGroup[];
  readonly queue: readonly MultiTargetQueueObservation[];
  readonly settlements: readonly MultiTargetSettlementObservation[];
  readonly rollback: MultiTargetRollbackObservation;
  readonly verificationIntents: readonly VerificationLoopIntent[];
  readonly verificationResults: readonly VerificationResultObservation[];
  readonly groupVerificationIntents: readonly VerificationLoopIntent[];
  readonly groupVerificationResults: readonly VerificationResultObservation[];
  readonly wholeTaskVerificationIntent: VerificationLoopIntent;
  readonly wholeTaskVerificationResult: VerificationResultObservation;
  readonly repairEligibility: MultiTargetRepairEligibility;
  readonly proofInput: MultiTargetMutationProofInput;
  readonly resultVerdict: MultiTargetMutationTerminalProjection;
  readonly verdictStatus: MultiTargetVerdictStatus;
  readonly redactionStatus: "report-safe" | "redacted";
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}
