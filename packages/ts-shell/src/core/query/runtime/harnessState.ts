import type { RuntimeSourceFact } from "../../../context/acquisition/code/source.js";
import type { RepairHypothesisState } from "../../../repair/flow/hypothesis.js";
import type { AgentRole } from "../../../result/types.js";
import type { ToolActionKind } from "../../../tools/policy/strategy.js";
import type { QueryRuntimeExecutionBatch } from "./batch.js";

/**
 * The query runtime harness state contract.
 *
 * Shared between the harness entry point and its classification, pending-state and
 * support layers. It lives in a leaf module so those layers depend on the contract
 * instead of on the entry point that consumes it: a type-only import back into
 * `./harness.js` is erased at emit and cannot fault, but it becomes a real runtime
 * cycle the moment one is converted to a value import.
 */

export interface QueryRuntimePendingWrite {
  readonly queueId: string
  readonly actionKind: ToolActionKind
  readonly targetFiles: readonly string[]
  readonly status: 'pending' | 'accounted'
}

export interface QueryRuntimePendingVerification {
  readonly queueId: string
  readonly targetFiles: readonly string[]
  readonly command?: string
  readonly reason?: string
}

export interface QueryRuntimePendingRepair {
  readonly queueId: string
  readonly failureClass: string
  readonly failureSummary: string
  readonly hypothesis: string
  readonly hypothesisState?: RepairHypothesisState
  readonly priorAttempt?: string
  readonly contextNeed?: string
  readonly sourceFactIds?: readonly string[]
  readonly rejectedCause?: string
  readonly targetFiles: readonly string[]
}

export interface QueryRuntimePendingArtifact {
  readonly queueId: string
  readonly claims: readonly string[]
  readonly evidenceIds: readonly string[]
  readonly targetFiles: readonly string[]
}

export type QueryRuntimeTrajectoryPhase =
  | 'tool:planned'
  | 'tool:started'
  | 'tool:completed'
  | 'tool:failed'
  | 'tool:retried'
  | 'tool:settled'
  | 'output:completion-claim-unproven'
  | 'output:verification-claim-unsettled'
  | 'output:artifact-claim-incomplete'
  | 'write:intended'
  | 'write:applied'
  | 'write:changed-file-accounted'
  | 'write:verification-queued'
  | 'write:verification-settled'
  | 'verification:targeted'
  | 'verification:started'
  | 'verification:passed'
  | 'verification:failed'
  | 'verification:wrong-target-ignored'
  | 'verification:settled'
  | 'context:source-fact-recorded'
  | 'repair:failure-classified'
  | 'repair:classified'
  | 'repair:hypothesis'
  | 'repair:hypothesis-rejected'
  | 'repair:context-needed'
  | 'repair:attempt'
  | 'repair:repeat-blocked'
  | 'repair:rerun'
  | 'repair:next-hypothesis'
  | 'repair:settled'
  | 'artifact:requested'
  | 'artifact:written'
  | 'artifact:source-missing'
  | 'artifact:verification-missing'
  | 'artifact:completed'
  | 'artifact:pending'

export interface QueryRuntimeTrajectoryEntry {
  readonly sequence: number
  readonly turn: number
  readonly role: AgentRole
  readonly phase: QueryRuntimeTrajectoryPhase
  readonly actionKind?: ToolActionKind
  readonly toolId?: string
  readonly targetFiles: readonly string[]
  readonly detail?: string
}

export interface QueryRuntimeLedgerEntry {
  readonly sequence: number
  readonly turn: number
  readonly role: AgentRole
  readonly actionKind: ToolActionKind
  readonly toolId: string
  readonly targetFiles: readonly string[]
  readonly affectedPaths: readonly string[]
  readonly exitStatusClass: string
  readonly failureClass: string
  readonly truncated: boolean
  readonly redactionStatus: string
  readonly diagnosticSummary?: string
}

export interface QueryRuntimeTurnSnapshot {
  readonly snapshotId: string
  readonly turn: number
  readonly role: AgentRole
  readonly runtimeAction: ToolActionKind
  readonly actionBatch: QueryRuntimeExecutionBatch
  readonly pendingWrite: readonly QueryRuntimePendingWrite[]
  readonly pendingVerification: readonly QueryRuntimePendingVerification[]
  readonly pendingRepair: readonly QueryRuntimePendingRepair[]
  readonly trajectory: readonly QueryRuntimeTrajectoryEntry[]
  readonly changedFiles: readonly string[]
  readonly failureState: readonly string[]
  readonly verificationPlan: readonly QueryRuntimePendingVerification[]
  readonly repairAttempts: readonly string[]
  readonly artifactPendingState: {
    readonly claims: readonly string[]
    readonly evidenceIds: readonly string[]
    readonly missingClaims: readonly string[]
  }
  readonly taskStateVersion: number
}

export interface QueryRuntimeSavePoint {
  readonly savePointId: string
  readonly phase: 'restore' | 'before-batch' | 'after-batch' | 'after-output'
  readonly turn: number
  readonly role: AgentRole
  readonly ledgerLength: number
  readonly snapshot?: QueryRuntimeTurnSnapshot
  readonly pendingWrite: readonly QueryRuntimePendingWrite[]
  readonly pendingVerification: readonly QueryRuntimePendingVerification[]
  readonly pendingRepair: readonly QueryRuntimePendingRepair[]
  readonly pendingArtifact: readonly QueryRuntimePendingArtifact[]
  readonly sourceFacts?: readonly RuntimeSourceFact[]
  readonly trajectory: readonly QueryRuntimeTrajectoryEntry[]
}

export interface QueryRuntimeHarnessState {
  readonly taskStateVersion: number
  readonly snapshots: readonly QueryRuntimeTurnSnapshot[]
  readonly savePoints: readonly QueryRuntimeSavePoint[]
  readonly ledger: readonly QueryRuntimeLedgerEntry[]
  readonly pendingWrite: readonly QueryRuntimePendingWrite[]
  readonly pendingVerification: readonly QueryRuntimePendingVerification[]
  readonly pendingRepair: readonly QueryRuntimePendingRepair[]
  readonly pendingArtifact: readonly QueryRuntimePendingArtifact[]
  readonly sourceFacts: readonly RuntimeSourceFact[]
  readonly trajectory: readonly QueryRuntimeTrajectoryEntry[]
}

export interface QueryRuntimeHarnessSeed {
  readonly taskStateVersion?: number
  readonly snapshots?: readonly QueryRuntimeTurnSnapshot[]
  readonly savePoints?: readonly QueryRuntimeSavePoint[]
  readonly ledger?: readonly QueryRuntimeLedgerEntry[]
  readonly pendingWrite?: readonly QueryRuntimePendingWrite[]
  readonly pendingVerification?: readonly QueryRuntimePendingVerification[]
  readonly pendingRepair?: readonly QueryRuntimePendingRepair[]
  readonly pendingArtifact?: readonly QueryRuntimePendingArtifact[]
  readonly sourceFacts?: readonly RuntimeSourceFact[]
  readonly trajectory?: readonly QueryRuntimeTrajectoryEntry[]
}
