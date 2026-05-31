import type { CodingResultSummary } from "../orchestration/types.js";
import { extractPathLikeTargets } from "./recovery/resumeContextBuilder.js";

export interface MutationContinuityStateInput {
  readonly lastCodingResult?: CodingResultSummary;
  readonly recentCodingResults: readonly CodingResultSummary[];
  readonly lastUserIntent?: string;
}

export interface MutationContinuityState {
  readonly recentChangedFiles: readonly string[];
  readonly recentTargetFiles: readonly string[];
  readonly recentFailedFiles: ReadonlyArray<{ path: string; reason: string }>;
  readonly recentVerifiedFiles: readonly string[];
}

export function buildMutationContinuityState(
  input: MutationContinuityStateInput,
): MutationContinuityState {
  const recentTargetFilesFromHistory = input.recentCodingResults.flatMap(
    (result) => [
      ...(result.changeSet.attemptedFiles ?? []),
      ...(result.changedFiles ?? []),
      ...(result.verifiedFiles ?? []),
      ...((result.failedFiles ?? []).map((entry) => entry.path)),
    ],
  );
  const recentTargetFiles = Array.from(
    new Set([
      ...recentTargetFilesFromHistory,
      ...extractPathLikeTargets(input.lastUserIntent),
    ]),
  ).slice(0, 12);

  const recentFailedByPath = new Map<string, string>();
  for (const result of input.recentCodingResults) {
    for (const entry of result.failedFiles ?? []) {
      const pathCandidate = entry.path?.trim();
      if (!pathCandidate || recentFailedByPath.has(pathCandidate)) {
        continue;
      }
      recentFailedByPath.set(pathCandidate, entry.reason);
    }
  }

  return {
    recentChangedFiles: (input.lastCodingResult?.changedFiles ?? []).slice(0, 6),
    recentTargetFiles,
    recentFailedFiles: Array.from(recentFailedByPath.entries())
      .map(([path, reason]) => ({ path, reason }))
      .slice(0, 8),
    recentVerifiedFiles: (input.lastCodingResult?.verifiedFiles ?? []).slice(
      0,
      6,
    ),
  };
}
