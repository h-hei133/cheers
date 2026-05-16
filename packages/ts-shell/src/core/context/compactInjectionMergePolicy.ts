import type { CompactFutureTurnCandidateContext } from "./compactFutureTurnAdapter.js";
import type { CompactInjectionState } from "./compactInjectionState.js";
import type { CompactLiveCheckpoint } from "./compactLiveCheckpoint.js";

export type CompactInjectionMergeStatus = "pass" | "warn" | "fail";

export interface CompactInjectionMergeResult {
  readonly mergeStatus: CompactInjectionMergeStatus;
  readonly checkpoint: CompactLiveCheckpoint;
  readonly previousCheckpoint?: CompactLiveCheckpoint;
  readonly mergedCompactSurvivorFacts: readonly string[];
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

export interface PlanCompactInjectionMergeInput {
  readonly checkpoint: CompactLiveCheckpoint;
  readonly injectionState: CompactInjectionState;
  readonly previousCheckpoint?: CompactLiveCheckpoint;
}

export function planCompactInjectionMerge(
  input: PlanCompactInjectionMergeInput,
): CompactInjectionMergeResult {
  const evidence = [
    "compact-injection-merge:latest-wins",
    "compact-injection-merge:no-persistence",
    "compact-injection-merge:no-memory-write",
    "compact-injection-merge:no-provider-call",
  ];
  const warnings: Array<{ readonly id: string; readonly message: string }> = [
    ...input.injectionState.warnings,
  ];
  const blockers: Array<{ readonly id: string; readonly message: string }> = [];

  if (
    input.previousCheckpoint &&
    input.previousCheckpoint.createdAt > input.checkpoint.createdAt
  ) {
    blockers.push({
      id: "stale-checkpoint",
      message: `Checkpoint ${input.checkpoint.checkpointId} is older than previous checkpoint ${input.previousCheckpoint.checkpointId}.`,
    });
  }

  if (input.injectionState.supersededCheckpointIds.length > 0) {
    warnings.push({
      id: "superseded-checkpoints-present",
      message: `${input.injectionState.supersededCheckpointIds.length} older compact checkpoint(s) were superseded before injection.`,
    });
  }

  const mergedCompactSurvivorFacts = dedupe([
    ...(input.previousCheckpoint?.compactSurvivorFacts ?? []),
    ...input.checkpoint.compactSurvivorFacts,
  ]).filter((fact) => !isRecursiveCompactFact(fact) && !containsUnsafeContent(fact));

  return {
    mergeStatus: blockers.length > 0 ? "fail" : warnings.length > 0 ? "warn" : "pass",
    checkpoint: input.checkpoint,
    previousCheckpoint: input.previousCheckpoint,
    mergedCompactSurvivorFacts,
    warnings,
    blockers,
    evidence: [
      ...evidence,
      input.previousCheckpoint
        ? "compact-injection-merge:previous-checkpoint-inspected"
        : "compact-injection-merge:no-previous-checkpoint",
      "compact-injection-merge:stable-survivor-facts-carried",
      "compact-injection-merge:no-recursive-compact-markdown",
      "compact-injection-merge:no-raw-content",
    ],
  };
}

export function mergeWarningsIntoCandidate(
  candidate: CompactFutureTurnCandidateContext,
  merge: CompactInjectionMergeResult,
): CompactFutureTurnCandidateContext {
  return {
    ...candidate,
    warnings: [...candidate.warnings, ...merge.warnings, ...merge.blockers],
    evidence: [...candidate.evidence, ...merge.evidence],
  };
}

function dedupe(values: readonly string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function isRecursiveCompactFact(value: string): boolean {
  return /<compact_v2_injected_context>|# Compact v2 Handoff|previous compact handoff/i.test(value);
}

function containsUnsafeContent(value: string): boolean {
  return /\bRAW_[A-Z0-9_]+\b/.test(value) || /\bsk-[A-Za-z0-9_-]{8,}\b/.test(value);
}
