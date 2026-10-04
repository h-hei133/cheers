import type { ProjectMemoryRecord } from "./projectMemoryStoreContract.js";

/** Stored/recalled records still have to qualify for model-facing use. */
export function memoryRecordIsInjectable(record: ProjectMemoryRecord): boolean {
  return !record.invalidatedAt
    && record.safety === "safe"
    && record.retentionClass !== "never-remember"
    && record.candidateKind !== "rejected";
}

export function recordHasForbiddenContent(record: ProjectMemoryRecord): boolean {
  const values = [
    record.memoryText,
    ...record.evidence,
    ...record.routeReferences,
    ...record.redactions,
    record.structuredFact?.subject ?? "",
    record.structuredFact?.predicate ?? "",
    record.structuredFact?.object ?? "",
  ];
  return values.some(
    (value) =>
      containsRawContent(value) ||
      containsSecret(value) ||
      containsHiddenReasoning(value),
  );
}

export function sanitizeLifecycleReason(
  reason: string | undefined,
): string | undefined {
  const compact = reason?.replace(/\s+/g, " ").trim();
  if (!compact) {
    return undefined;
  }
  return compact
    .replace(
      /\b(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g,
      "[REDACTED]",
    )
    .replace(/\bRAW_[A-Z0-9_]+\b/g, "[REDACTED_RAW]")
    .replace(
      /\b(hidden reasoning|chain[- ]?of[- ]?thought)\b/gi,
      "[REDACTED_REASONING]",
    )
    .slice(0, 240);
}

export function containsRawContent(value: string): boolean {
  return (
    /\bRAW_[A-Z0-9_]+\b/.test(value) ||
    /\braw (file|recovery|content)\b/i.test(value)
  );
}

export function containsSecret(value: string): boolean {
  return (
    /\b(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/.test(
      value,
    ) ||
    /\b(provider credential|provider config|authorization|api key|token)\b/i.test(
      value,
    )
  );
}

export function containsHiddenReasoning(value: string): boolean {
  return /\b(hidden reasoning|chain[- ]?of[- ]?thought)\b/i.test(value);
}
