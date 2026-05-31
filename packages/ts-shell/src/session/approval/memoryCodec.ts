import type { ApprovalAuditMemoryState } from "../sessionContinuityTypes.js";

export type ApprovalMemoryRecord = ApprovalAuditMemoryState;

export function encodeApprovalMemory(
  record: ApprovalMemoryRecord,
): ApprovalMemoryRecord {
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
    ...(record.inputKey ? { inputKey: record.inputKey } : {}),
    recordedAt: record.recordedAt,
  };
}

export function decodeApprovalMemory(
  workingMemory: unknown,
): ApprovalMemoryRecord | undefined {
  if (!workingMemory || typeof workingMemory !== "object") {
    return undefined;
  }
  const root = workingMemory as Record<string, unknown>;
  return (
    normalizeApprovalMemoryRecord(root.approvalAudit) ??
    parseApprovalAuditFromContinuityState(root.continuity) ??
    projectApprovalSummaryFallback(root.summary)
  );
}

export function decodeApprovalMemoryHistory(
  workingMemory: unknown,
  options: { readonly historyLimit: number },
): readonly ApprovalMemoryRecord[] {
  if (!workingMemory || typeof workingMemory !== "object") {
    return [];
  }
  const root = workingMemory as Record<string, unknown>;
  const historyCandidates: unknown[] = [root.approvalAuditHistory];
  if (
    root.continuity &&
    typeof root.continuity === "object" &&
    !Array.isArray(root.continuity)
  ) {
    historyCandidates.push(
      (root.continuity as Record<string, unknown>).lastApprovalHistory,
    );
  }
  for (const candidate of historyCandidates) {
    if (!Array.isArray(candidate)) {
      continue;
    }
    const parsed: ApprovalMemoryRecord[] = [];
    for (const entry of candidate) {
      const normalized = normalizeApprovalMemoryRecord(entry);
      if (normalized) {
        parsed.push(normalized);
      }
    }
    if (parsed.length > 0) {
      return parsed.slice(-options.historyLimit);
    }
  }
  return [];
}

export function normalizeApprovalMemoryRecord(
  value: unknown,
): ApprovalMemoryRecord | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const approval = value as Record<string, unknown>;
  const decision = normalizeApprovalDecision(approval.decision);
  if (!decision) {
    return undefined;
  }
  const decisionSource = normalizeOptionalString(approval.decisionSource);
  const persistent =
    typeof approval.persistent === "boolean"
      ? approval.persistent
      : decision === "allow-always";
  const cacheEffect = normalizeOptionalString(approval.cacheEffect);
  const projectRoot = normalizeOptionalString(approval.projectRoot);
  const cacheKey = normalizeOptionalString(approval.cacheKey);
  const scopeLabel = normalizeOptionalString(approval.scopeLabel);
  const recordedAt = normalizeOptionalString(approval.recordedAt);
  return {
    decision,
    decisionSource: decisionSource ?? "unknown",
    persistent,
    cacheEffect: cacheEffect ?? "none",
    projectRoot: projectRoot ?? "unknown",
    cacheKey: cacheKey ?? "unknown",
    scopeLabel: scopeLabel ?? "unknown",
    ...(typeof approval.lineage === "string" && approval.lineage.trim().length > 0
      ? { lineage: approval.lineage.trim() }
      : {}),
    ...(typeof approval.stopReason === "string" &&
    approval.stopReason.trim().length > 0
      ? { stopReason: approval.stopReason.trim() }
      : {}),
    ...(approval.channel === "interactive" || approval.channel === "non-interactive"
      ? { channel: approval.channel }
      : {}),
    ...(approval.inputKey === "y" ||
    approval.inputKey === "a" ||
    approval.inputKey === "n" ||
    approval.inputKey === "other"
      ? { inputKey: approval.inputKey }
      : {}),
    recordedAt: recordedAt ?? new Date(0).toISOString(),
  };
}

function parseApprovalAuditFromContinuityState(
  value: unknown,
): ApprovalMemoryRecord | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const continuity = value as Record<string, unknown>;
  const decision = normalizeApprovalDecision(continuity.lastApprovalDecision);
  if (!decision) {
    return undefined;
  }
  const decisionSource = normalizeOptionalString(
    continuity.lastApprovalDecisionSource,
  );
  const persistent =
    typeof continuity.lastApprovalPersistent === "boolean"
      ? continuity.lastApprovalPersistent
      : decision === "allow-always";
  const cacheEffect = normalizeOptionalString(
    continuity.lastApprovalCacheEffect,
  );
  const projectRoot = normalizeOptionalString(
    continuity.lastApprovalProjectRoot,
  );
  const cacheKey = normalizeOptionalString(continuity.lastApprovalCacheKey);
  const scopeLabel = normalizeOptionalString(continuity.lastApprovalScope);
  const lineage = normalizeOptionalString(continuity.lastApprovalLineage);
  const stopReason = normalizeOptionalString(
    continuity.lastApprovalStopReason,
  );
  const recordedAt = normalizeOptionalString(
    continuity.lastApprovalRecordedAt,
  );
  return {
    decision,
    decisionSource: decisionSource ?? "unknown",
    persistent,
    cacheEffect: cacheEffect ?? "none",
    projectRoot: projectRoot ?? "unknown",
    cacheKey: cacheKey ?? "unknown",
    scopeLabel: scopeLabel ?? "unknown",
    ...(lineage ? { lineage } : {}),
    ...(stopReason ? { stopReason } : {}),
    ...(continuity.lastApprovalChannel === "interactive" ||
    continuity.lastApprovalChannel === "non-interactive"
      ? { channel: continuity.lastApprovalChannel }
      : {}),
    ...(continuity.lastApprovalInputKey === "y" ||
    continuity.lastApprovalInputKey === "a" ||
    continuity.lastApprovalInputKey === "n" ||
    continuity.lastApprovalInputKey === "other"
      ? { inputKey: continuity.lastApprovalInputKey }
      : {}),
    recordedAt: recordedAt ?? new Date(0).toISOString(),
  };
}

export function projectApprovalSummaryFallback(
  value: unknown,
): ApprovalMemoryRecord | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const summaryEntries = value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  if (summaryEntries.length === 0) {
    return undefined;
  }

  const fields = new Map<string, string>();
  const capture = (key: string, raw: string): void => {
    const normalized = raw.trim();
    if (!normalized || fields.has(key)) {
      return;
    }
    fields.set(key, normalized);
  };
  for (const entry of summaryEntries) {
    const line =
      entry.startsWith("- ") || entry.startsWith("* ")
        ? entry.slice(2).trim()
        : entry;
    const colonIndex = line.indexOf(":");
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim().toLowerCase();
      const rawValue = line.slice(colonIndex + 1);
      if (
        key.startsWith("last-approval-") ||
        key.startsWith("last-request-scope-") ||
        key.startsWith("last-permission-request-")
      ) {
        capture(key, rawValue);
      }
    }
    const auditMatch = line.match(/^approval-audit:([a-z-]+)=(.+)$/i);
    if (auditMatch?.[1] && auditMatch[2]) {
      capture(`last-approval-${auditMatch[1].toLowerCase()}`, auditMatch[2]);
    }
  }

  const decision = normalizeApprovalDecision(
    fields.get("last-approval-decision"),
  );
  if (!decision) {
    return undefined;
  }
  const persistentRaw = fields.get("last-approval-persistent");
  const persistent =
    persistentRaw !== undefined
      ? ["yes", "true", "1"].includes(persistentRaw.toLowerCase())
      : decision === "allow-always";
  const channelRaw = fields.get("last-approval-channel")?.toLowerCase();
  const inputKeyRaw = fields.get("last-approval-input-key")?.toLowerCase();
  const decisionSource = fields.get("last-approval-decision-source");
  const cacheEffect = fields.get("last-approval-cache-effect");
  const projectRoot = fields.get("last-approval-project-root");
  const cacheKey = fields.get("last-approval-cache-key");
  const scopeLabel = fields.get("last-approval-scope");
  const recordedAt = fields.get("last-approval-recorded-at");
  return {
    decision,
    decisionSource: decisionSource ?? "unknown",
    persistent,
    cacheEffect: cacheEffect ?? "none",
    projectRoot: projectRoot ?? "unknown",
    cacheKey: cacheKey ?? "unknown",
    scopeLabel: scopeLabel ?? "unknown",
    ...(fields.get("last-approval-lineage")
      ? { lineage: fields.get("last-approval-lineage")! }
      : {}),
    ...(fields.get("last-approval-stop-reason")
      ? { stopReason: fields.get("last-approval-stop-reason")! }
      : {}),
    ...(channelRaw === "interactive" || channelRaw === "non-interactive"
      ? { channel: channelRaw }
      : {}),
    ...(inputKeyRaw === "y" ||
    inputKeyRaw === "a" ||
    inputKeyRaw === "n" ||
    inputKeyRaw === "other"
      ? { inputKey: inputKeyRaw }
      : {}),
    recordedAt: recordedAt ?? new Date(0).toISOString(),
  };
}

function normalizeApprovalDecision(
  value: unknown,
): "deny" | "allow-once" | "allow-always" | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "deny" ||
    normalized === "allow-once" ||
    normalized === "allow-always"
  ) {
    return normalized;
  }
  return undefined;
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}
