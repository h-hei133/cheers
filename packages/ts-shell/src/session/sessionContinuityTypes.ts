import type {
  CodingActionResultSeed,
  CodingTaskKind,
  CodingWriteEffect,
  TerminalClassification,
  TerminalReason,
} from "../result/types.js";
import type { QueryRuntimeTaskState } from "../core/query/runtime/taskState.js";

export type SeedInfluenceDiagnostic =
  | "target-carryover"
  | "verify-signal"
  | "ignored-explicit-target";

export interface SessionContinuitySnapshot {
  readonly sessionId: string;
  readonly projectRoot: string;
  readonly lastUserIntent?: string;
  readonly lastAssistantOutput?: string;
  readonly lastTerminalClassification?: TerminalClassification;
  readonly lastTerminalReason?: TerminalReason;
  readonly lastFailure?: string;
  readonly lastTaskKind?: CodingTaskKind;
  readonly lastGroundedDeliverableMode?: "read" | "summary" | "explain";
  readonly lastReadDeliveredLines?: number;
  readonly lastReadWindowStart?: number;
  readonly lastReadWindowEnd?: number;
  readonly lastReadWindowSize?: number;
  readonly lastReadFragmentStart?: number;
  readonly lastReadFragmentEnd?: number;
  readonly lastReadFragmentLineIndexes?: readonly number[];
  readonly lastReadFragmentRanges?: readonly string[];
  readonly lastReadFragmentSourceWindowStart?: number;
  readonly lastReadFragmentSourceWindowEnd?: number;
  readonly lastReadFragmentFingerprint?: string;
  readonly lastReadFilter?: "none" | "function-definitions";
  readonly lastStagedRepairStepCount?: number;
  readonly lastStagedRepairCompletedStep?: number;
  readonly lastStagedRepairBlockedStep?: number;
  readonly lastStagedRepairNextStep?: number;
  readonly lastAnswerDefect?: string;
  readonly lastActionResultSeed?: CodingActionResultSeed;
  readonly lastWriterStarted?: boolean;
  readonly lastWriteEffect?: CodingWriteEffect;
  readonly lastWriteRequiresUserInspection?: boolean;
  readonly lastWriteEffectTarget?: string;
  readonly lastActionHandoffSummary?: string;
  readonly lastSeedInfluence?: SeedInfluenceDiagnostic;
  readonly lastSeedInfluenceHandoffSummary?: string;
  readonly lastFailureHandoffDiagnostic?: string;
  readonly lastSuccessHandoffDiagnostic?: string;
  readonly taskState?: QueryRuntimeTaskState;
  readonly recentChangedFiles: readonly string[];
  readonly recentTargetFiles: readonly string[];
  readonly recentFailedFiles: ReadonlyArray<{ path: string; reason: string }>;
  readonly recentVerifiedFiles: readonly string[];
  readonly lastVerificationStatus?: string;
  readonly lastVerificationCommand?: string;
  readonly lastVerificationReason?: string;
  readonly lastVerificationBlockerKind?: string;
  readonly lastVerificationNextAction?: string;
  readonly lastVerificationResumeEligible?: boolean;
  readonly lastApprovalDecision?: "deny" | "allow-once" | "allow-always";
  readonly lastApprovalDecisionSource?: string;
  readonly lastApprovalPersistent?: boolean;
  readonly lastApprovalCacheEffect?: string;
  readonly lastApprovalProjectRoot?: string;
  readonly lastApprovalCacheKey?: string;
  readonly lastApprovalScope?: string;
  readonly lastApprovalLineage?: string;
  readonly lastApprovalStopReason?: string;
  readonly lastApprovalChannel?: "interactive" | "non-interactive";
  readonly lastApprovalInputKey?: "y" | "a" | "n" | "other";
  readonly lastApprovalRecordedAt?: string;
  readonly lastApprovalHistory?: readonly ApprovalAuditMemoryState[];
  readonly lastApprovalProvenanceKind?: string;
  readonly lastApprovalProvenanceSource?: string;
  readonly lastApprovalProvenanceToolName?: string;
  readonly lastApprovalProvenanceTaskId?: string;
  readonly lastToolExecutionProvenanceKind?: string;
  readonly lastToolExecutionProvenanceSource?: string;
  readonly lastToolExecutionProvenanceToolName?: string;
  readonly lastToolExecutionProvenanceTaskId?: string;
  readonly lastToolExecutionFailureBoundary?: string;
  readonly lastPermissionRequestToolName?: string;
  readonly lastPermissionRequestOperation?: string;
  readonly lastPermissionRequestTarget?: string;
  readonly lastPermissionRequestProcess?: string;
  readonly lastPermissionRequestScopeKey?: string;
  readonly lastPermissionRequestScopeLabel?: string;
  readonly lastPermissionRequestCacheKey?: string;
  readonly lastPermissionRequestProjectRoot?: string;
  readonly lastPermissionRequestSource?: "verification-command" | "approval-request";
  readonly lastPermissionRequestLineage?: string;
  readonly lastRequestScopeCacheKey?: string;
  readonly lastRequestScopeLabel?: string;
  readonly lastRequestScopeProjectRoot?: string;
  readonly lastRequestScopeSource?: "verification-command" | "approval-request";
  readonly lastRepairStatus?: string;
  readonly lastRepairNotes: readonly string[];
  readonly lastContinuationStatus?: string;
  readonly lastContinuationEvidence: readonly string[];
  readonly lastTaskSatisfactionVerdict?: string;
  readonly lastTaskSatisfactionReasons: readonly string[];
  readonly unresolvedItems: readonly string[];
  readonly freshnessHistoryCount?: number;
}

export interface ApprovalAuditMemoryState {
  readonly decision: "deny" | "allow-once" | "allow-always";
  readonly decisionSource: string;
  readonly persistent: boolean;
  readonly cacheEffect: string;
  readonly projectRoot: string;
  readonly cacheKey: string;
  readonly scopeLabel: string;
  readonly lineage?: string;
  readonly stopReason?: string;
  readonly channel?: "interactive" | "non-interactive";
  readonly inputKey?: "y" | "a" | "n" | "other";
  readonly recordedAt: string;
}

export interface PermissionRequestMemoryState {
  readonly toolName?: string;
  readonly operation?: string;
  readonly target?: string;
  readonly process?: string;
  readonly scopeKey?: string;
  readonly scopeLabel?: string;
  readonly cacheKey?: string;
  readonly projectRoot?: string;
  readonly source?: "verification-command" | "approval-request";
  readonly lineage?: string;
}

export interface RequestScopeMemoryState {
  readonly cacheKey?: string;
  readonly scopeLabel?: string;
  readonly projectRoot?: string;
  readonly source?: "verification-command" | "approval-request";
}
