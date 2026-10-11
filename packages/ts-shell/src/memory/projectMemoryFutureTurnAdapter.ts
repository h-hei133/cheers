import type {
  ProjectMemoryRetrievalMatch,
  ProjectMemoryRetrievalResult,
} from "./projectMemoryRetrieval.js";
import type { ProjectMemoryRecord } from "./projectMemoryStoreContract.js";
import type { ProjectMemoryWakeupPreview } from "./projectMemoryWakeup.js";
import { memoryRecordIsInjectable } from "./memoryValidation.js";

export type ProjectMemoryFutureTurnMode = "wake" | "recall";
export type ProjectMemoryFutureTurnAdapterStatus =
  | "candidate"
  | "safe-to-inject"
  | "blocked";

export interface ProjectMemoryStructuredFacts {
  readonly stableProjectFacts: readonly string[];
  readonly userPreferenceFacts: readonly string[];
  readonly capabilityStateFacts: readonly string[];
  readonly routeDecisions: readonly string[];
  readonly validationPatterns: readonly string[];
  readonly blockedByDesignDecisions: readonly string[];
  readonly evidenceReferences: readonly string[];
}

export interface ProjectMemoryFutureTurnCandidateContext {
  readonly adapterVersion: "project-memory-future-turn-adapter-v1";
  readonly injectionId: string;
  readonly mode: ProjectMemoryFutureTurnMode;
  readonly query?: string;
  readonly modelFacingMemorySummary: string;
  readonly structuredFacts: ProjectMemoryStructuredFacts;
  readonly recordIds: readonly string[];
  /** Formatter-owned facts retain their source before any budget selection. */
  readonly factSources?: readonly { readonly recordId: string; readonly summary: string }[];
  readonly excludedRecords: readonly string[];
  readonly redactions: readonly string[];
  readonly warnings: readonly { readonly id: string; readonly message: string }[];
  readonly injectionStatus: ProjectMemoryFutureTurnAdapterStatus;
  readonly evidence: readonly string[];
}

export function adaptProjectMemoryWakeupForFutureTurn(input: {
  readonly injectionId: string;
  readonly wakeup: ProjectMemoryWakeupPreview;
}): ProjectMemoryFutureTurnCandidateContext {
  const records = [...input.wakeup.l0.records, ...input.wakeup.l1.records];
  return candidateFromRecords({
    injectionId: input.injectionId,
    mode: "wake",
    records,
    evidence: input.wakeup.evidence,
    warnings: input.wakeup.warnings.map((message) => ({
      id: message,
      message,
    })),
  });
}

export function adaptProjectMemoryRecallForFutureTurn(input: {
  readonly injectionId: string;
  readonly retrieval: ProjectMemoryRetrievalResult;
}): ProjectMemoryFutureTurnCandidateContext {
  return candidateFromRecords({
    injectionId: input.injectionId,
    mode: "recall",
    query: input.retrieval.query,
    records: input.retrieval.matches.map((match) => match.record),
    matches: input.retrieval.matches,
    evidence: input.retrieval.evidence,
    warnings: [],
  });
}

function candidateFromRecords(input: {
  readonly injectionId: string;
  readonly mode: ProjectMemoryFutureTurnMode;
  readonly query?: string;
  readonly records: readonly ProjectMemoryRecord[];
  readonly matches?: readonly ProjectMemoryRetrievalMatch[];
  readonly evidence: readonly string[];
  readonly warnings: readonly { readonly id: string; readonly message: string }[];
}): ProjectMemoryFutureTurnCandidateContext {
  const safeRecords = input.records.filter(memoryRecordIsInjectable);
  const redactions = unique(safeRecords.flatMap((record) => record.redactions));
  const serialized = safeRecords.map(recordSummary).join("\n");
  const blocked = containsUnsafeContent(serialized);
  return {
    adapterVersion: "project-memory-future-turn-adapter-v1",
    injectionId: input.injectionId,
    mode: input.mode,
    query: input.query,
    modelFacingMemorySummary:
      safeRecords.length === 0
        ? "No project memory records selected."
        : safeRecords.map(recordSummary).join("\n"),
    structuredFacts: {
      stableProjectFacts: safeRecords
        .filter((record) => record.candidateKind === "project-fact" || record.candidateKind === "project-structure")
        .map(recordSummary),
      userPreferenceFacts: safeRecords
        .filter((record) => record.retentionClass === "user-memory-candidate" || record.candidateKind === "user-preference-candidate")
        .map(recordSummary),
      capabilityStateFacts: safeRecords
        .filter((record) => record.candidateKind === "capability-state")
        .map(recordSummary),
      routeDecisions: safeRecords
        .filter((record) => record.candidateKind === "route-decision")
        .map(recordSummary),
      validationPatterns: safeRecords
        .filter((record) => record.candidateKind === "validation-pattern")
        .map(recordSummary),
      blockedByDesignDecisions: safeRecords
        .filter((record) => record.candidateKind === "blocked-by-design-decision")
        .map(recordSummary),
      evidenceReferences: unique(safeRecords.flatMap((record) => [
        ...record.evidence,
        ...record.routeReferences,
      ])),
    },
    recordIds: safeRecords.map((record) => record.id),
    factSources: safeRecords.map(record => ({ recordId: record.id, summary: recordSummary(record) })),
    excludedRecords: input.records
      .filter((record) => !memoryRecordIsInjectable(record))
      .map((record) => `${record.id}:${record.invalidatedAt ? "invalidated" : "policy-excluded"}`),
    redactions,
    warnings: [
      ...input.warnings,
      ...(input.matches
        ? input.matches.map((match) => ({
            id: `match:${match.record.id}`,
            message: `score=${match.score}; reasons=${match.reasons.join(",") || "none"}`,
          }))
        : []),
    ],
    injectionStatus: blocked
      ? "blocked"
      : safeRecords.length > 0
      ? "safe-to-inject"
      : "candidate",
    evidence: [
      ...input.evidence,
      "project-memory-future-turn-adapter:deterministic",
      "project-memory-future-turn-adapter:no-provider-call",
      "project-memory-future-turn-adapter:no-vector-db",
      "project-memory-future-turn-adapter:no-automatic-recovery",
      "project-memory-future-turn-adapter:no-atomic-rollback",
    ],
  };
}

function recordSummary(record: ProjectMemoryRecord): string {
  return `${safeSnippet(record.memoryText, 220)} [${record.candidateKind}; ${record.id}]`;
}

function safeSnippet(value: string, maxLength: number): string {
  const redacted = value
    .replace(/\b(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, "[REDACTED]")
    .replace(/\bRAW_[A-Z0-9_]+\b/g, "[REDACTED_RAW]")
    .replace(/\b(hidden reasoning|chain[- ]?of[- ]?thought)\b/gi, "[REDACTED_REASONING]")
    .replace(/\s+/g, " ")
    .trim();
  return redacted.length > maxLength ? `${redacted.slice(0, maxLength - 3)}...` : redacted;
}

function containsUnsafeContent(value: string): boolean {
  return /\bRAW_[A-Z0-9_]+\b/.test(value) ||
    /\b(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/.test(value) ||
    /\b(hidden reasoning|chain[- ]?of[- ]?thought)\b/i.test(value);
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
