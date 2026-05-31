import path from "node:path";

import type { ContinuityStateLike } from "../../orchestration/runtimeHandoffProjection.js";

export interface CrossFileFailureEntry {
  readonly path: string;
  readonly failureCode: "read-failed" | "patch-generation-failed" | "write-failed";
  readonly reason: string;
}

export function hasCrossFileEvidenceSignalInContinuity(
  continuity: ContinuityStateLike,
): boolean {
  const explicitRemaining = extractCrossFileStateListFromContinuityEvidence(
    continuity,
    "repair-remaining-files:",
  );
  if (explicitRemaining.length > 0) {
    return true;
  }
  if ((continuity.recentFailedFiles?.length ?? 0) > 1) {
    return true;
  }
  const unresolved = (continuity.unresolvedItems ?? [])
    .join(" | ")
    .toLowerCase();
  if (/failed-files:.*[,，]/.test(unresolved)) {
    return true;
  }
  return (continuity.recentChangedFiles?.length ?? 0) > 1;
}

export function deriveCrossFileRepairCandidates(
  continuity: ContinuityStateLike,
  primaryTarget?: string,
): string[] {
  if (!primaryTarget) {
    return [];
  }
  const normalizedPrimary = normalizePathLike(primaryTarget);
  const explicitRemaining = extractCrossFileStateListFromContinuityEvidence(
    continuity,
    "repair-remaining-files:",
  ).filter((candidate) => candidate !== normalizedPrimary);
  if (explicitRemaining.length > 0) {
    return explicitRemaining.slice(0, 2);
  }
  const processedFromEvidence = new Set(
    extractProcessedCrossFilePathsFromContinuity(continuity),
  );
  const primaryDir = path.posix.dirname(normalizedPrimary);
  const pool = Array.from(
    new Set([
      ...(continuity.recentFailedFiles ?? []).map((item) =>
        normalizePathLike(item.path),
      ),
      ...(continuity.recentChangedFiles ?? []).map((item) =>
        normalizePathLike(item),
      ),
      ...(continuity.recentTargetFiles ?? []).map((item) =>
        normalizePathLike(item),
      ),
    ]),
  ).filter(
    (item) =>
      item.length > 0 &&
      item !== normalizedPrimary &&
      !processedFromEvidence.has(item),
  );
  const scoreFile = (candidate: string): number => {
    let score = 0;
    if (path.posix.dirname(candidate) === primaryDir) {
      score += 2;
    }
    if (/\b(test|spec)\b|\.test\.|\.spec\./i.test(candidate)) {
      score += 3;
    }
    if (/\b(helper|util|config|map|fixture)\b/i.test(candidate)) {
      score += 2;
    }
    if (candidate.endsWith(".md")) {
      score -= 1;
    }
    return score;
  };
  return pool
    .map((candidate) => ({ candidate, score: scoreFile(candidate) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map((entry) => entry.candidate);
}

export function hasCrossFileContinuationContextInContinuity(
  continuity: ContinuityStateLike,
): boolean {
  return (
    extractCrossFileStateListFromContinuityEvidence(
      continuity,
      "repair-candidate-files:",
    ).length > 0 ||
    extractCrossFileStateListFromContinuityEvidence(
      continuity,
      "repair-processed-files:",
    ).length > 0 ||
    extractCrossFileStateListFromContinuityEvidence(
      continuity,
      "repair-remaining-files:",
    ).length > 0 ||
    (continuity.lastContinuationEvidence ?? []).some((entry) =>
      entry.startsWith("repair-cross-file"),
    )
  );
}

export function extractProcessedCrossFilePathsFromContinuity(
  continuity: ContinuityStateLike,
): string[] {
  const entries = continuity.lastContinuationEvidence ?? [];
  const processed = new Set(
    extractCrossFileStateListFromContinuityEvidence(
      continuity,
      "repair-processed-files:",
    ),
  );
  for (const token of entries) {
    const normalizedToken = token.trim();
    const appliedMatch = normalizedToken.match(
      /^repair-cross-file applied on (.+)$/i,
    );
    if (appliedMatch?.[1]) {
      processed.add(normalizePathLike(appliedMatch[1]));
    }
  }
  return Array.from(processed).filter((item) => item.length > 0);
}

export function extractCrossFileStateListFromContinuityEvidence(
  continuity: ContinuityStateLike,
  prefix: string,
): string[] {
  const entries = continuity.lastContinuationEvidence ?? [];
  const marker = entries.find((entry) =>
    entry.toLowerCase().startsWith(prefix.toLowerCase()),
  );
  if (!marker) {
    return [];
  }
  const markerIndex = marker.indexOf(":");
  const payload = markerIndex >= 0 ? marker.slice(markerIndex + 1).trim() : "";
  if (!payload || payload === "(none)") {
    return [];
  }
  return payload
    .split(",")
    .map((item) => normalizePathLike(item))
    .filter((item) => item.length > 0);
}

export function extractCrossFileFailureEntriesFromContinuity(
  continuity: ContinuityStateLike,
): CrossFileFailureEntry[] {
  const entries = continuity.lastContinuationEvidence ?? [];
  const marker = entries.find((entry) =>
    entry.toLowerCase().startsWith("repair-failed-files:"),
  );
  if (!marker) {
    return [];
  }
  const markerIndex = marker.indexOf(":");
  const payload = markerIndex >= 0 ? marker.slice(markerIndex + 1).trim() : "";
  if (!payload || payload === "(none)") {
    return [];
  }
  const parsed: CrossFileFailureEntry[] = [];
  for (const token of payload.split("|")) {
    const [rawPath, rawCode, rawReason] = token.split("::");
    const pathCandidate = normalizePathLike((rawPath ?? "").trim());
    const codeCandidate = (rawCode ?? "").trim().toLowerCase();
    const reasonCandidate = (rawReason ?? "").trim();
    if (!pathCandidate || !reasonCandidate) {
      continue;
    }
    if (
      codeCandidate !== "read-failed" &&
      codeCandidate !== "patch-generation-failed" &&
      codeCandidate !== "write-failed"
    ) {
      continue;
    }
    parsed.push({
      path: pathCandidate,
      failureCode: codeCandidate,
      reason: reasonCandidate,
    });
  }
  return parsed;
}

export function shouldDegradeCrossFileRemaining(input: {
  previousRemainingTargets: readonly string[];
  previousFailedEntries: readonly CrossFileFailureEntry[];
  currentRemainingTargets: readonly string[];
  currentFailedEntries: readonly CrossFileFailureEntry[];
}):
  | { shouldDegrade: false }
  | {
      shouldDegrade: true;
      reason: string;
      degradedTargets: string[];
    } {
  const repeatedTargets = input.currentRemainingTargets.filter((target) =>
    input.previousRemainingTargets.includes(target),
  );
  const repeatedNonRetriable = repeatedTargets.filter((target) => {
    const currentFailure = input.currentFailedEntries.find(
      (entry) => entry.path === target,
    );
    const previousFailure = input.previousFailedEntries.find(
      (entry) => entry.path === target,
    );
    if (!currentFailure || !previousFailure) {
      return false;
    }
    return (
      isNonRetriableRemainingFailure(
        currentFailure.failureCode,
        currentFailure.reason,
      ) &&
      isNonRetriableRemainingFailure(
        previousFailure.failureCode,
        previousFailure.reason,
      )
    );
  });
  if (repeatedNonRetriable.length > 0) {
    return {
      shouldDegrade: true,
      reason: `remaining targets are non-retriable and repeated without progress: ${repeatedNonRetriable.join(", ")}`,
      degradedTargets: repeatedNonRetriable,
    };
  }
  const repeatedPatchGenerationFailures = Array.from(
    new Set(
      input.currentFailedEntries
        .filter((entry) => entry.failureCode === "patch-generation-failed")
        .map((entry) => entry.path),
    ),
  ).filter((target) => {
    const currentFailure = input.currentFailedEntries.find(
      (entry) => entry.path === target,
    );
    const previousFailure = input.previousFailedEntries.find(
      (entry) => entry.path === target,
    );
    if (!currentFailure || !previousFailure) {
      return false;
    }
    return (
      currentFailure.failureCode === "patch-generation-failed" &&
      previousFailure.failureCode === "patch-generation-failed"
    );
  });
  if (repeatedPatchGenerationFailures.length > 0) {
    return {
      shouldDegrade: true,
      reason: `remaining targets exhausted after repeated patch-generation-failed: ${repeatedPatchGenerationFailures.join(", ")}`,
      degradedTargets: repeatedPatchGenerationFailures,
    };
  }
  return { shouldDegrade: false };
}

export function shouldRetainCrossFileFailureInRemaining(
  failureCode: "read-failed" | "patch-generation-failed" | "write-failed",
  reason: string,
): boolean {
  const normalizedReason = reason.toLowerCase();
  if (failureCode === "patch-generation-failed") {
    return true;
  }
  if (failureCode === "read-failed") {
    if (
      normalizedReason.includes("enoent") ||
      normalizedReason.includes("no such file") ||
      normalizedReason.includes("outside workspace") ||
      normalizedReason.includes("does not exist")
    ) {
      return false;
    }
    return true;
  }
  if (failureCode === "write-failed") {
    if (
      normalizedReason.includes("outside workspace") ||
      normalizedReason.includes("readonly") ||
      normalizedReason.includes("permission denied")
    ) {
      return false;
    }
    return true;
  }
  return true;
}

function isNonRetriableRemainingFailure(
  failureCode: "read-failed" | "patch-generation-failed" | "write-failed",
  reason: string,
): boolean {
  const normalized = reason.toLowerCase();
  if (failureCode === "patch-generation-failed") {
    return false;
  }
  return (
    normalized.includes("eisdir") ||
    normalized.includes("directory") ||
    normalized.includes("outside workspace") ||
    normalized.includes("permission denied") ||
    normalized.includes("readonly") ||
    normalized.includes("read-only")
  );
}

function normalizePathLike(value: string): string {
  return value
    .replace(/\\/g, "/")
    .replace(/^\.\/+/g, "")
    .trim();
}
