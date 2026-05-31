import type {
  ApprovalAuditMemoryState,
  SessionContinuitySnapshot,
} from "../sessionContinuityTypes.js";

export type ApprovalAuditProjection = Partial<SessionContinuitySnapshot>;

export function projectApprovalAudit(
  approvalAudit: ApprovalAuditMemoryState | undefined,
): ApprovalAuditProjection {
  if (!approvalAudit) {
    return {};
  }
  return {
    lastApprovalDecision: approvalAudit.decision,
    lastApprovalDecisionSource: approvalAudit.decisionSource,
    lastApprovalPersistent: approvalAudit.persistent,
    lastApprovalCacheEffect: approvalAudit.cacheEffect,
    lastApprovalProjectRoot: approvalAudit.projectRoot,
    lastApprovalCacheKey: approvalAudit.cacheKey,
    lastApprovalScope: approvalAudit.scopeLabel,
    ...(approvalAudit.lineage
      ? { lastApprovalLineage: approvalAudit.lineage }
      : {}),
    ...(approvalAudit.stopReason
      ? { lastApprovalStopReason: approvalAudit.stopReason }
      : {}),
    ...(approvalAudit.channel
      ? { lastApprovalChannel: approvalAudit.channel }
      : {}),
    ...(approvalAudit.inputKey
      ? { lastApprovalInputKey: approvalAudit.inputKey }
      : {}),
    ...(approvalAudit.recordedAt
      ? { lastApprovalRecordedAt: approvalAudit.recordedAt }
      : {}),
  };
}

export function projectApprovalAuditContinuity(input: {
  readonly approvalAudit: ApprovalAuditMemoryState;
  readonly approvalAuditHistory: readonly ApprovalAuditMemoryState[];
}): Record<string, unknown> {
  const approvalAudit = input.approvalAudit;
  return {
    lastApprovalDecision: approvalAudit.decision,
    lastApprovalDecisionSource: approvalAudit.decisionSource,
    lastApprovalPersistent: approvalAudit.persistent,
    lastApprovalCacheEffect: approvalAudit.cacheEffect,
    lastApprovalProjectRoot: approvalAudit.projectRoot,
    lastApprovalCacheKey: approvalAudit.cacheKey,
    lastApprovalScope: approvalAudit.scopeLabel,
    lastApprovalRecordedAt: approvalAudit.recordedAt,
    ...(approvalAudit.lineage
      ? { lastApprovalLineage: approvalAudit.lineage }
      : {}),
    ...(approvalAudit.stopReason
      ? { lastApprovalStopReason: approvalAudit.stopReason }
      : {}),
    ...(approvalAudit.channel
      ? { lastApprovalChannel: approvalAudit.channel }
      : {}),
    ...(approvalAudit.inputKey
      ? { lastApprovalInputKey: approvalAudit.inputKey }
      : {}),
    lastRequestScopeCacheKey: approvalAudit.cacheKey,
    lastRequestScopeLabel: approvalAudit.scopeLabel,
    lastRequestScopeProjectRoot: approvalAudit.projectRoot,
    lastRequestScopeSource: "approval-request",
    lastPermissionRequestCacheKey: approvalAudit.cacheKey,
    lastPermissionRequestScopeLabel: approvalAudit.scopeLabel,
    lastPermissionRequestProjectRoot: approvalAudit.projectRoot,
    lastPermissionRequestSource: "approval-request",
    ...(approvalAudit.lineage
      ? { lastPermissionRequestLineage: approvalAudit.lineage }
      : {}),
    lastApprovalHistory: input.approvalAuditHistory,
  };
}

export function projectApprovalSummaryFallback(input: {
  readonly currentSummaryEntries: readonly string[];
  readonly approvalAudit: ApprovalAuditMemoryState;
}): readonly string[] {
  const summaryByKey = new Map<string, string>();
  for (const rawEntry of input.currentSummaryEntries) {
    const entry = rawEntry.trim();
    if (!entry) {
      continue;
    }
    const normalized = entry.startsWith("- ")
      ? entry.slice(2).trim()
      : entry;
    const separator = normalized.indexOf(":");
    if (separator <= 0) {
      continue;
    }
    const key = normalized.slice(0, separator).trim().toLowerCase();
    const value = normalized.slice(separator + 1).trim();
    if (key.startsWith("last-approval-") && value) {
      summaryByKey.set(key, value);
    }
  }

  const setSummaryApproval = (
    key: string,
    value: string | undefined,
  ): void => {
    if (!value?.trim()) {
      summaryByKey.delete(key);
      return;
    }
    summaryByKey.set(key, value.trim());
  };
  const approvalAudit = input.approvalAudit;
  setSummaryApproval("last-approval-decision", approvalAudit.decision);
  setSummaryApproval(
    "last-approval-decision-source",
    approvalAudit.decisionSource,
  );
  setSummaryApproval(
    "last-approval-persistent",
    approvalAudit.persistent ? "yes" : "no",
  );
  setSummaryApproval("last-approval-cache-effect", approvalAudit.cacheEffect);
  setSummaryApproval("last-approval-project-root", approvalAudit.projectRoot);
  setSummaryApproval("last-approval-cache-key", approvalAudit.cacheKey);
  setSummaryApproval("last-approval-scope", approvalAudit.scopeLabel);
  setSummaryApproval("last-approval-lineage", approvalAudit.lineage);
  setSummaryApproval("last-approval-stop-reason", approvalAudit.stopReason);
  setSummaryApproval("last-approval-channel", approvalAudit.channel);
  setSummaryApproval("last-approval-input-key", approvalAudit.inputKey);
  setSummaryApproval("last-approval-recorded-at", approvalAudit.recordedAt);

  const preservedSummaryEntries = input.currentSummaryEntries.filter((entry) => {
    const trimmed = entry.trim();
    if (!trimmed) {
      return false;
    }
    const normalized = trimmed.startsWith("- ")
      ? trimmed.slice(2).trim()
      : trimmed;
    const separator = normalized.indexOf(":");
    if (separator <= 0) {
      return true;
    }
    const key = normalized.slice(0, separator).trim().toLowerCase();
    return !key.startsWith("last-approval-");
  });
  return [
    ...preservedSummaryEntries,
    ...Array.from(summaryByKey.entries()).map(([key, value]) =>
      `- ${key}: ${value}`,
    ),
  ];
}
