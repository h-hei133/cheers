import type { ProjectMemoryRecord } from "./projectMemoryStoreContract.js";

export type ProjectMemoryConflictStatus = "pass" | "warn" | "fail";

export interface ProjectMemoryConflictDetectionResult {
  readonly conflictStatus: ProjectMemoryConflictStatus;
  readonly warnings: readonly {
    readonly id: string;
    readonly message: string;
  }[];
  readonly blockers: readonly {
    readonly id: string;
    readonly message: string;
  }[];
  readonly evidence: readonly string[];
}

export interface DetectProjectMemoryConflictsInput {
  readonly records: readonly ProjectMemoryRecord[];
}

export function detectProjectMemoryConflicts(
  input: DetectProjectMemoryConflictsInput,
): ProjectMemoryConflictDetectionResult {
  const warnings: Array<{ readonly id: string; readonly message: string }> = [];
  const blockers: Array<{ readonly id: string; readonly message: string }> = [];
  const structuredFacts = new Map<string, Map<string, string[]>>();

  for (const record of input.records) {
    const key = structuredFactKey(record);
    const object = normalizeStructuredObject(record.structuredFact?.object);
    if (key && object) {
      const values = structuredFacts.get(key) ?? new Map<string, string[]>();
      values.set(object, [...(values.get(object) ?? []), record.id]);
      structuredFacts.set(key, values);
    }
  }

  for (const [key, values] of structuredFacts) {
    if (values.size <= 1) {
      continue;
    }
    blockers.push({
      id: "conflicting-structured-memory",
      message: `Project memory records disagree on ${key}: ${Array.from(values.keys()).join(" vs ")}.`,
    });
  }

  for (const group of groupRecordsByRouteAndKind(input.records)) {
    const statuses = new Map<string, string[]>();
    for (const record of group.records) {
      const status = extractClearStatus(record.memoryText);
      if (!status) {
        continue;
      }
      statuses.set(status, [...(statuses.get(status) ?? []), record.id]);
    }
    if (statuses.size > 1) {
      warnings.push({
        id: "possible-route-memory-conflict",
        message: `Route memory records for ${group.key} have different status words: ${Array.from(statuses.keys()).join(" vs ")}.`,
      });
    }
  }

  return {
    conflictStatus: blockers.length > 0 ? "fail" : warnings.length > 0 ? "warn" : "pass",
    warnings,
    blockers,
    evidence: [
      "project-memory-conflict-detection:deterministic",
      "project-memory-conflict-detection:no-provider-call",
      "project-memory-conflict-detection:no-llm-rerank",
      blockers.length > 0
        ? "project-memory-conflict-detection:fail"
        : warnings.length > 0
          ? "project-memory-conflict-detection:warn"
          : "project-memory-conflict-detection:pass",
    ],
  };
}

function structuredFactKey(record: ProjectMemoryRecord): string | undefined {
  const subject = normalizeStructuredObject(record.structuredFact?.subject);
  const predicate = normalizeStructuredObject(record.structuredFact?.predicate);
  if (!subject || !predicate) {
    return undefined;
  }
  return `${record.candidateKind}:${subject}:${predicate}`;
}

function normalizeStructuredObject(value: string | undefined): string | undefined {
  const normalized = value?.replace(/\s+/g, " ").trim().toLowerCase();
  return normalized || undefined;
}

function groupRecordsByRouteAndKind(records: readonly ProjectMemoryRecord[]): Array<{
  readonly key: string;
  readonly records: readonly ProjectMemoryRecord[];
}> {
  const groups = new Map<string, ProjectMemoryRecord[]>();
  for (const record of records) {
    const route = firstRouteReference(record);
    if (!route) {
      continue;
    }
    const key = `${record.candidateKind}:${route}`;
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }
  return Array.from(groups.entries()).map(([key, groupedRecords]) => ({
    key,
    records: groupedRecords,
  }));
}

function firstRouteReference(record: ProjectMemoryRecord): string | undefined {
  const fromReference = record.routeReferences.find((reference) => /route\s*\d+/i.test(reference));
  if (fromReference) {
    return fromReference.toLowerCase().replace(/\s+/g, "");
  }
  const match = record.memoryText.match(/\broute\s*\d+\b/i);
  return match?.[0].toLowerCase().replace(/\s+/g, "");
}

function extractClearStatus(value: string): string | undefined {
  const normalized = value.toLowerCase();
  if (/\b(enabled|available|default|implemented|complete)\b/.test(normalized)) {
    return "enabled";
  }
  if (/\b(disabled|blocked|deferred|non-default|not enabled|not available)\b/.test(normalized)) {
    return "disabled";
  }
  return undefined;
}
