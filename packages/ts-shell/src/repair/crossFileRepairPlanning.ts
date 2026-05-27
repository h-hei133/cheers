export function shouldDegradeCrossFileRemaining(input: {
  previousRemainingTargets: readonly string[];
  previousFailedEntries: ReadonlyArray<{
    path: string;
    failureCode: "read-failed" | "patch-generation-failed" | "write-failed";
    reason: string;
  }>;
  currentRemainingTargets: readonly string[];
  currentFailedEntries: ReadonlyArray<{
    path: string;
    failureCode: "read-failed" | "patch-generation-failed" | "write-failed";
    reason: string;
  }>;
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
