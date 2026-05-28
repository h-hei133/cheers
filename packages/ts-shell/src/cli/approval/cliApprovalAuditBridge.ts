import type {
  ApprovalAuditRecord,
} from "../../entrypoints/approvalPromptBridge.js";
import type {
  ApprovalAuditMemoryState,
  SessionManager,
} from "../../session/SessionManager.js";

export function projectApprovalAuditMemoryState(
  record: ApprovalAuditRecord,
): Omit<ApprovalAuditMemoryState, "recordedAt"> {
  return {
    decision: record.decision,
    decisionSource: record.decisionSource,
    persistent: record.persistent,
    cacheEffect: record.cacheEffect,
    projectRoot: record.projectRoot,
    cacheKey: record.cacheKey,
    scopeLabel: record.scopeLabel,
    ...(record.lineage ? { lineage: record.lineage } : {}),
    ...(record.stopReason ? { stopReason: record.stopReason } : {}),
    ...(record.channel ? { channel: record.channel } : {}),
    ...(isReportableInputKey(record.inputKey)
      ? { inputKey: record.inputKey }
      : {}),
  };
}

export function persistApprovalAuditDecision(input: {
  readonly sessionManager: SessionManager;
  readonly sessionId: string;
  readonly record: ApprovalAuditRecord;
}): void {
  input.sessionManager.recordApprovalAuditDecision(
    input.sessionId,
    projectApprovalAuditMemoryState(input.record),
  );
}

function isReportableInputKey(
  inputKey: ApprovalAuditRecord["inputKey"],
): inputKey is "y" | "a" | "n" | "other" {
  return (
    inputKey === "y" ||
    inputKey === "a" ||
    inputKey === "n" ||
    inputKey === "other"
  );
}
