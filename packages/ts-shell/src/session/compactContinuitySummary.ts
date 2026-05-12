import type { CodingWriteEffect } from "../orchestration/types.js";
import { mergeContinuitySummaryEntries } from "./compactSummaryFormatter.js";

export type CompactContinuitySeedInfluence =
  | "target-carryover"
  | "verify-signal"
  | "ignored-explicit-target";

export interface CompactContinuityApprovalAudit {
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

export interface CompactContinuityWriteState {
  readonly writerStarted?: boolean;
  readonly writeEffect?: CodingWriteEffect;
  readonly requiresUserInspection?: boolean;
  readonly target?: string;
}

export interface CompactContinuitySummaryInput {
  readonly summary: unknown;
  readonly continuity: unknown;
  readonly approvalAudit?: CompactContinuityApprovalAudit;
  readonly approvalAuditHistory: readonly CompactContinuityApprovalAudit[];
  readonly actionHandoffSummary?: string;
  readonly writeContinuity?: CompactContinuityWriteState;
  readonly seedInfluence?: CompactContinuitySeedInfluence;
  readonly seedInfluenceHandoffSummary?: string;
  readonly failureHandoffDiagnostic?: string;
  readonly successHandoffDiagnostic?: string;
}

export interface CompactContinuitySummary {
  readonly continuity: Record<string, unknown>;
  readonly summary: readonly string[];
  readonly approvalAuditHistory?: readonly CompactContinuityApprovalAudit[];
}

export function buildCompactContinuitySummary(
  input: CompactContinuitySummaryInput,
): CompactContinuitySummary {
  const continuity =
    input.continuity &&
    typeof input.continuity === "object" &&
    !Array.isArray(input.continuity)
      ? { ...(input.continuity as Record<string, unknown>) }
      : {};

  applyApprovalAuditContinuity(continuity, input.approvalAudit);

  if (input.approvalAuditHistory.length > 0) {
    continuity.lastApprovalHistory = input.approvalAuditHistory;
  }
  if (input.actionHandoffSummary) {
    continuity.lastActionHandoffSummary = input.actionHandoffSummary;
  }
  if (input.writeContinuity?.writerStarted !== undefined) {
    continuity.lastWriterStarted = input.writeContinuity.writerStarted;
  }
  if (input.writeContinuity?.writeEffect) {
    continuity.lastWriteEffect = input.writeContinuity.writeEffect;
  }
  if (input.writeContinuity?.requiresUserInspection !== undefined) {
    continuity.lastWriteRequiresUserInspection =
      input.writeContinuity.requiresUserInspection;
  }
  if (input.writeContinuity?.target) {
    continuity.lastWriteEffectTarget = input.writeContinuity.target;
  }
  if (input.seedInfluence) {
    continuity.lastSeedInfluence = input.seedInfluence;
  }
  if (input.seedInfluenceHandoffSummary) {
    continuity.lastSeedInfluenceHandoffSummary =
      input.seedInfluenceHandoffSummary;
  }
  if (input.failureHandoffDiagnostic) {
    continuity.lastFailureHandoffDiagnostic = input.failureHandoffDiagnostic;
  }
  if (input.successHandoffDiagnostic) {
    continuity.lastSuccessHandoffDiagnostic = input.successHandoffDiagnostic;
  }

  return {
    continuity,
    summary: mergeContinuitySummaryEntries(input.summary, continuity),
    ...(input.approvalAuditHistory.length > 0
      ? { approvalAuditHistory: input.approvalAuditHistory }
      : {}),
  };
}

function applyApprovalAuditContinuity(
  continuity: Record<string, unknown>,
  approvalAudit: CompactContinuityApprovalAudit | undefined,
): void {
  if (!approvalAudit) {
    return;
  }

  continuity.lastApprovalDecision = approvalAudit.decision;
  continuity.lastApprovalDecisionSource = approvalAudit.decisionSource;
  continuity.lastApprovalPersistent = approvalAudit.persistent;
  continuity.lastApprovalCacheEffect = approvalAudit.cacheEffect;
  continuity.lastApprovalProjectRoot = approvalAudit.projectRoot;
  continuity.lastApprovalCacheKey = approvalAudit.cacheKey;
  continuity.lastApprovalScope = approvalAudit.scopeLabel;
  continuity.lastApprovalRecordedAt = approvalAudit.recordedAt;
  if (approvalAudit.lineage) {
    continuity.lastApprovalLineage = approvalAudit.lineage;
  }
  if (approvalAudit.stopReason) {
    continuity.lastApprovalStopReason = approvalAudit.stopReason;
  }
  if (approvalAudit.channel) {
    continuity.lastApprovalChannel = approvalAudit.channel;
  }
  if (approvalAudit.inputKey) {
    continuity.lastApprovalInputKey = approvalAudit.inputKey;
  }
  if (!continuity.lastRequestScopeCacheKey) {
    continuity.lastRequestScopeCacheKey = approvalAudit.cacheKey;
  }
  if (!continuity.lastRequestScopeLabel) {
    continuity.lastRequestScopeLabel = approvalAudit.scopeLabel;
  }
  if (!continuity.lastRequestScopeProjectRoot) {
    continuity.lastRequestScopeProjectRoot = approvalAudit.projectRoot;
  }
  if (!continuity.lastRequestScopeSource) {
    continuity.lastRequestScopeSource = "approval-request";
  }
  if (!continuity.lastPermissionRequestScopeLabel) {
    continuity.lastPermissionRequestScopeLabel = approvalAudit.scopeLabel;
  }
  if (!continuity.lastPermissionRequestCacheKey) {
    continuity.lastPermissionRequestCacheKey = approvalAudit.cacheKey;
  }
  if (!continuity.lastPermissionRequestProjectRoot) {
    continuity.lastPermissionRequestProjectRoot = approvalAudit.projectRoot;
  }
  if (!continuity.lastPermissionRequestSource) {
    continuity.lastPermissionRequestSource = "approval-request";
  }
  if (!continuity.lastPermissionRequestLineage && approvalAudit.lineage) {
    continuity.lastPermissionRequestLineage = approvalAudit.lineage;
  }
}
