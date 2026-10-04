import type { ProjectMemoryFutureTurnCandidateContext } from "./projectMemoryFutureTurnAdapter.js";
import type { ProjectMemoryConflictDetectionResult } from "./projectMemoryConflictDetection.js";
import type { ProjectMemoryInjectionState } from "./projectMemoryInjectionState.js";

export type ProjectMemoryInjectionMergeStatus = "pass" | "warn" | "fail";
export type ProjectMemoryPendingRecordLifecycleStatus = "active" | "invalidated" | "deleted";

export interface ProjectMemoryPendingRecordLifecycle {
  readonly recordId: string;
  readonly status: ProjectMemoryPendingRecordLifecycleStatus;
}

export interface ProjectMemoryInjectionMergeResult {
  readonly mergeStatus: ProjectMemoryInjectionMergeStatus;
  readonly candidate: ProjectMemoryFutureTurnCandidateContext;
  readonly filteredRecordIds: readonly string[];
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

export interface PlanProjectMemoryInjectionMergeInput {
  readonly injectionState: ProjectMemoryInjectionState;
  readonly candidate: ProjectMemoryFutureTurnCandidateContext;
  readonly pendingRecordLifecycle: readonly ProjectMemoryPendingRecordLifecycle[];
  readonly conflictDetection: ProjectMemoryConflictDetectionResult;
}

export function planProjectMemoryInjectionMerge(
  input: PlanProjectMemoryInjectionMergeInput,
): ProjectMemoryInjectionMergeResult {
  const warnings: Array<{ readonly id: string; readonly message: string }> = [
    ...input.injectionState.warnings,
    ...input.candidate.warnings,
    ...input.conflictDetection.warnings,
  ];
  const blockers: Array<{ readonly id: string; readonly message: string }> = [
    ...input.conflictDetection.blockers,
  ];
  const duplicateCount = input.candidate.recordIds.length - unique(input.candidate.recordIds).length;
  const filteredRecordIds = input.pendingRecordLifecycle
    .filter((record) => record.status !== "active")
    .map((record) => `${record.recordId}:${record.status}`);
  const staleSelected = input.pendingRecordLifecycle.some(record =>
    record.status !== "active" && input.candidate.recordIds.includes(record.recordId));
  if (staleSelected) {
    blockers.push({
      id: "selected-memory-changed-during-read",
      message: "A selected memory record was invalidated or deleted during retrieval; stage memory again before use.",
    });
  }
  const newRecordIds = input.candidate.recordIds.filter(
    (recordId) => !input.injectionState.recordIds.includes(recordId),
  );

  if (input.injectionState.supersededInjectionIds.length > 0) {
    warnings.push({
      id: "superseded-memory-injections-present",
      message: `${input.injectionState.supersededInjectionIds.length} older memory injection(s) were superseded before injection.`,
    });
  }
  if (duplicateCount > 0) {
    warnings.push({
      id: "duplicate-memory-records-deduped",
      message: `${duplicateCount} duplicate selected memory record(s) were deduped before injection.`,
    });
  }
  if (filteredRecordIds.length > 0) {
    warnings.push({
      id: "stale-memory-records-filtered",
      message: `${filteredRecordIds.length} pending memory record(s) were invalidated or deleted before injection.`,
    });
  }
  if (newRecordIds.length > 0) {
    warnings.push({
      id: "new-memory-records-since-staging",
      message: `${newRecordIds.length} current memory record(s) matched after /memory use was staged.`,
    });
  }
  if (input.candidate.recordIds.length === 0) {
    blockers.push({
      id: "no-active-memory-records",
      message: "No active project memory records remain after lifecycle filtering.",
    });
  }
  if (
    input.injectionState.recordIds.length > 0 &&
    input.pendingRecordLifecycle.length > 0 &&
    input.pendingRecordLifecycle.every((record) => record.status !== "active") &&
    input.candidate.recordIds.length === 0
  ) {
    blockers.push({
      id: "stale-pending-memory-injection",
      message: "All records selected by the pending /memory use were invalidated or deleted.",
    });
  }

  const candidate = mergeWarningsIntoProjectMemoryCandidate(
    dedupeProjectMemoryCandidate({
      ...input.candidate,
      excludedRecords: unique([
        ...input.candidate.excludedRecords,
        ...filteredRecordIds,
      ]),
    }),
    uniqueWarnings(warnings),
    blockers,
  );

  return {
    mergeStatus: blockers.length > 0 ? "fail" : warnings.length > 0 ? "warn" : "pass",
    candidate,
    filteredRecordIds,
    warnings: uniqueWarnings(warnings),
    blockers,
    evidence: [
      "project-memory-injection-merge:latest-explicit-use-wins",
      "project-memory-injection-merge:dedupe-by-record-id",
      "project-memory-injection-merge:lifecycle-filtered",
      "project-memory-injection-merge:no-provider-call",
      "project-memory-injection-merge:no-persistence",
      "project-memory-injection-merge:no-raw-content",
      ...input.conflictDetection.evidence,
    ],
  };
}

export function mergeWarningsIntoProjectMemoryCandidate(
  candidate: ProjectMemoryFutureTurnCandidateContext,
  warnings: readonly { readonly id: string; readonly message: string }[],
  blockers: readonly { readonly id: string; readonly message: string }[] = [],
): ProjectMemoryFutureTurnCandidateContext {
  return {
    ...candidate,
    warnings: uniqueWarnings([...candidate.warnings, ...warnings, ...blockers]),
  };
}

function dedupeProjectMemoryCandidate(
  candidate: ProjectMemoryFutureTurnCandidateContext,
): ProjectMemoryFutureTurnCandidateContext {
  return {
    ...candidate,
    modelFacingMemorySummary: dedupeLines(candidate.modelFacingMemorySummary.split("\n")).join("\n"),
    structuredFacts: {
      stableProjectFacts: unique(candidate.structuredFacts.stableProjectFacts),
      userPreferenceFacts: unique(candidate.structuredFacts.userPreferenceFacts),
      capabilityStateFacts: unique(candidate.structuredFacts.capabilityStateFacts),
      routeDecisions: unique(candidate.structuredFacts.routeDecisions),
      validationPatterns: unique(candidate.structuredFacts.validationPatterns),
      blockedByDesignDecisions: unique(candidate.structuredFacts.blockedByDesignDecisions),
      evidenceReferences: unique(candidate.structuredFacts.evidenceReferences),
    },
    recordIds: unique(candidate.recordIds),
    excludedRecords: unique(candidate.excludedRecords),
    redactions: unique(candidate.redactions),
    warnings: uniqueWarnings(candidate.warnings),
    evidence: unique(candidate.evidence),
  };
}

function dedupeLines(lines: readonly string[]): string[] {
  return unique(lines);
}

function unique(values: readonly string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function uniqueWarnings(
  warnings: readonly { readonly id: string; readonly message: string }[],
): Array<{ readonly id: string; readonly message: string }> {
  const seen = new Set<string>();
  const result: Array<{ readonly id: string; readonly message: string }> = [];
  for (const warning of warnings) {
    const key = `${warning.id}:${warning.message}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(warning);
  }
  return result;
}
