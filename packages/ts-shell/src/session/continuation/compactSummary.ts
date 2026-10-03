import type { CodingResultSummary, CodingWriteEffect } from "../../result/types.js";
import type { QueryRuntimeHarnessState } from "../../core/query/runtime/harness.js";
import type { QueryRuntimeTaskState } from "../../core/query/runtime/taskState.js";
import { encodeSessionHarnessState } from "../harness/state.js";
import { mergeContinuitySummaryEntries } from "./summaryFormatter.js";
import type { ContinuityTerminalFacts } from "../../result/terminal/truth.js";
import { readStoredResultSource, RESULT_FIELDS, shouldReplaceStoredResult } from "./source.js";
import type { ApprovalAuditMemoryState } from "../sessionContinuityTypes.js";
import type { ContinuitySource } from "./branch.js";

export type CompactContinuitySeedInfluence =
  | "target-carryover"
  | "verify-signal"
  | "ignored-explicit-target";

export type CompactContinuityApprovalAudit = ApprovalAuditMemoryState;

export interface CompactContinuityWriteState {
  readonly writerStarted?: boolean;
  readonly writeEffect?: CodingWriteEffect;
  readonly requiresUserInspection?: boolean;
  readonly target?: string;
}

/** Optional fields belong to one complete result, including their absence. */
export interface CompactContinuityResult {
  readonly source?: ContinuitySource;
  readonly taskKind: CodingResultSummary["taskKind"];
  readonly terminal?: ContinuityTerminalFacts;
  readonly actionHandoffSummary?: string;
  readonly writeContinuity?: CompactContinuityWriteState;
  readonly seedInfluence?: CompactContinuitySeedInfluence;
  readonly seedInfluenceHandoffSummary?: string;
  readonly failureHandoffDiagnostic?: string;
  readonly successHandoffDiagnostic?: string;
  readonly taskState?: QueryRuntimeTaskState;
}

export interface CompactContinuitySummaryInput {
  readonly summary: unknown;
  readonly continuity: unknown;
  readonly approvalAudit?: CompactContinuityApprovalAudit;
  readonly approvalAuditHistory: readonly CompactContinuityApprovalAudit[];
  readonly result?: CompactContinuityResult;
  readonly harness?: QueryRuntimeHarnessState;
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
  const replaceResult = input.result !== undefined && shouldReplaceStoredResult(
    readStoredResultSource({ continuity, summary: input.summary }), input.result.taskKind,
  );
  if (replaceResult && input.result) applyResult(continuity, input.result);
  if (input.harness) {
    continuity.harnessState = encodeSessionHarnessState(input.harness);
  }

  return {
    continuity,
    summary: mergeContinuitySummaryEntries(input.summary, continuity, { preserveResult: !replaceResult }),
    ...(input.approvalAuditHistory.length > 0
      ? { approvalAuditHistory: input.approvalAuditHistory }
      : {}),
  };
}

function applyResult(continuity: Record<string, unknown>, input: CompactContinuityResult): void {
  for (const key of RESULT_FIELDS) delete continuity[key];
  continuity.lastTaskKind = input.taskKind;
  if (input.source) continuity.resultSource = input.source;
  if (input.terminal?.terminalClassification) continuity.lastTerminalClassification = input.terminal.terminalClassification;
  if (input.terminal?.terminalReason) continuity.lastTerminalReason = input.terminal.terminalReason;
  if (input.terminal?.stopReason) continuity.lastFailure = input.terminal.stopReason;
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
  if (input.taskState) {
    continuity.taskState = input.taskState;
  }
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
