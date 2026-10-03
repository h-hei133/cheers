import type { CodingResultSummary } from "../result/types.js";
import { extractPathLikeTargets } from "./recovery/resumeContextBuilder.js";
import { buildStoppedSessionWriteContinuity } from "./continuation/stoppedSessionContinuity.js";

export interface MutationContinuityStateInput {
  readonly lastCodingResult?: CodingResultSummary;
  /** Newest first, as collected from the selected transcript. */
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
  const resolvedPaths = new Set<string>();
  for (const result of input.recentCodingResults) {
    const write = buildStoppedSessionWriteContinuity(result);
    const uncertain = write?.writeEffect === "unknown" || write?.writeEffect === "unverified" ||
      write?.requiresUserInspection === true;
    for (const entry of result.failedFiles ?? []) {
      const pathCandidate = entry.path?.trim();
      if (!pathCandidate || recentFailedByPath.has(pathCandidate) ||
        (!uncertain && resolvedPaths.has(pathCandidate))) {
        continue;
      }
      recentFailedByPath.set(pathCandidate, entry.reason);
    }
    if (uncertain || result.verification.status !== "passed" ||
      (result.lastActionResultSeed?.verification?.status ?? "passed") !== "passed") continue;
    const changed = new Set(result.changedFiles.map(path => path.trim()));
    const unverified = new Set(result.unverifiedFiles.map(entry => entry.path.trim()));
    for (const path of result.verifiedFiles) {
      const key = path.trim();
      if (key && changed.has(key) && !unverified.has(key) && !recentFailedByPath.has(key)) {
        resolvedPaths.add(key);
      }
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
