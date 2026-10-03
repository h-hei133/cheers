const RESULT_KEYS = new Set([
  "last-action-handoff-summary", "last-seed-influence", "last-seed-influence-handoff-summary",
  "last-writer-started", "last-write-effect", "last-write-requires-user-inspection", "last-write-effect-target",
  "last-failure-handoff-diagnostic", "last-success-handoff-diagnostic",
]);

function summaryKey(entry: string): string {
  const normalized = entry.trim().replace(/^-\s+/, "");
  const separator = normalized.indexOf(":");
  return separator > 0 ? normalized.slice(0, separator).trim().toLowerCase() : "";
}

export function hasResultSummary(summaryValue: unknown): boolean {
  return Array.isArray(summaryValue) && summaryValue.some((entry) =>
    typeof entry === "string" && RESULT_KEYS.has(summaryKey(entry)));
}

export function mergeContinuitySummaryEntries(
  summaryValue: unknown,
  continuity: Record<string, unknown>,
  options: { readonly preserveResult: boolean },
): readonly string[] {
  const existingEntries = Array.isArray(summaryValue)
    ? summaryValue.filter((entry): entry is string => typeof entry === "string")
    : [];
  const preservedEntries = existingEntries.filter((entry) => {
    const trimmed = entry.trim();
    if (!trimmed) {
      return false;
    }
    const key = summaryKey(entry);
    if (!key) {
      return true;
    }
    return (
      !key.startsWith("last-approval-") &&
      !key.startsWith("last-request-scope-") &&
      !key.startsWith("last-permission-request-") &&
      (!RESULT_KEYS.has(key) || options.preserveResult)
    );
  });
  const approvalPairs: Array<[string, string]> = [];
  const addPair = (key: string, value: unknown): void => {
    if (typeof value !== "string" || value.trim().length === 0) {
      return;
    }
    approvalPairs.push([key, value.trim()]);
  };
  addPair("last-approval-decision", continuity.lastApprovalDecision);
  addPair("last-approval-decision-source", continuity.lastApprovalDecisionSource);
  if (typeof continuity.lastApprovalPersistent === "boolean") {
    approvalPairs.push([
      "last-approval-persistent",
      continuity.lastApprovalPersistent ? "yes" : "no",
    ]);
  }
  addPair("last-approval-cache-effect", continuity.lastApprovalCacheEffect);
  addPair("last-approval-project-root", continuity.lastApprovalProjectRoot);
  addPair("last-approval-cache-key", continuity.lastApprovalCacheKey);
  addPair("last-approval-scope", continuity.lastApprovalScope);
  addPair("last-approval-lineage", continuity.lastApprovalLineage);
  addPair("last-approval-stop-reason", continuity.lastApprovalStopReason);
  addPair("last-approval-channel", continuity.lastApprovalChannel);
  addPair("last-approval-input-key", continuity.lastApprovalInputKey);
  addPair("last-approval-recorded-at", continuity.lastApprovalRecordedAt);
  addPair("last-request-scope-cache-key", continuity.lastRequestScopeCacheKey);
  addPair("last-request-scope-label", continuity.lastRequestScopeLabel);
  addPair(
    "last-request-scope-project-root",
    continuity.lastRequestScopeProjectRoot,
  );
  addPair("last-request-scope-source", continuity.lastRequestScopeSource);
  addPair(
    "last-permission-request-tool",
    continuity.lastPermissionRequestToolName,
  );
  addPair(
    "last-permission-request-operation",
    continuity.lastPermissionRequestOperation,
  );
  addPair(
    "last-permission-request-target",
    continuity.lastPermissionRequestTarget,
  );
  addPair(
    "last-permission-request-process",
    continuity.lastPermissionRequestProcess,
  );
  addPair(
    "last-permission-request-scope-key",
    continuity.lastPermissionRequestScopeKey,
  );
  addPair(
    "last-permission-request-scope-label",
    continuity.lastPermissionRequestScopeLabel,
  );
  addPair(
    "last-permission-request-cache-key",
    continuity.lastPermissionRequestCacheKey,
  );
  addPair(
    "last-permission-request-project-root",
    continuity.lastPermissionRequestProjectRoot,
  );
  addPair(
    "last-permission-request-source",
    continuity.lastPermissionRequestSource,
  );
  addPair(
    "last-permission-request-lineage",
    continuity.lastPermissionRequestLineage,
  );
  addPair("last-action-handoff-summary", continuity.lastActionHandoffSummary);
  addPair("last-seed-influence", continuity.lastSeedInfluence);
  addPair(
    "last-seed-influence-handoff-summary",
    continuity.lastSeedInfluenceHandoffSummary,
  );
  if (typeof continuity.lastWriterStarted === "boolean") {
    approvalPairs.push([
      "last-writer-started",
      continuity.lastWriterStarted ? "yes" : "no",
    ]);
  }
  addPair("last-write-effect", continuity.lastWriteEffect);
  if (typeof continuity.lastWriteRequiresUserInspection === "boolean") {
    approvalPairs.push([
      "last-write-requires-user-inspection",
      continuity.lastWriteRequiresUserInspection ? "yes" : "no",
    ]);
  }
  addPair("last-write-effect-target", continuity.lastWriteEffectTarget);
  addPair(
    "last-failure-handoff-diagnostic",
    continuity.lastFailureHandoffDiagnostic,
  );
  addPair(
    "last-success-handoff-diagnostic",
    continuity.lastSuccessHandoffDiagnostic,
  );

  const projectedKeys = new Set(approvalPairs.map(([key]) => key));
  return [
    ...preservedEntries.filter((entry) => !projectedKeys.has(summaryKey(entry))),
    ...approvalPairs.map(([key, value]) => `- ${key}: ${value}`),
  ];
}
