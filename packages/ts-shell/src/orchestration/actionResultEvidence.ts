import type {
  CodingActionResultSeed,
  CodingTaskKind,
  CodingVerificationSummary,
} from "./types.js";

export function buildActionResultSeedFromCodingResult(
  taskKind: CodingTaskKind,
  input: {
    readonly attemptedFiles: readonly string[];
    readonly changedFiles: readonly string[];
    readonly verifiedFiles: readonly string[];
    readonly verification: CodingVerificationSummary;
    readonly reason?: string;
  },
): CodingActionResultSeed | undefined {
  if (
    taskKind !== "edit-file" &&
    taskKind !== "write-file" &&
    taskKind !== "read-file" &&
    taskKind !== "repo-explain" &&
    taskKind !== "inspect-files" &&
    taskKind !== "run-command"
  ) {
    return undefined;
  }

  const target =
    input.changedFiles[0] ??
    input.verifiedFiles[0] ??
    input.attemptedFiles[0] ??
    (taskKind === "run-command" ? input.verification.command : undefined) ??
    (taskKind === "inspect-files" ? "(workspace)" : undefined);
  if (!target) {
    return undefined;
  }

  return {
    actionKind: taskKind,
    target: normalizePathLike(target),
    changedFiles: input.changedFiles.map(normalizePathLike),
    verifiedFiles: input.verifiedFiles.map(normalizePathLike),
    verification: {
      status: input.verification.status,
      ...(input.verification.command
        ? { command: input.verification.command }
        : {}),
      ...(input.verification.reason ? { reason: input.verification.reason } : {}),
      ...(input.verification.blockerKind
        ? { blockerKind: input.verification.blockerKind }
        : {}),
    },
    ...(input.reason ? { reason: input.reason } : {}),
  };
}

export function extractAttemptedFilesFromEvidence(
  evidence: readonly string[],
): string[] {
  const extracted = new Set<string>();
  const markerPatterns = [
    /^inspect:\s*read\s+(.+)$/i,
    /^repo-explain:\s*read\s+(.+)$/i,
    /^verify-target-hint:\s*(.+)$/i,
    /^edit\/write applied on\s+(.+)$/i,
    /^mutation skipped due inspect failure on\s+(.+)$/i,
    /^repair-replan:blocker:([^:]+):/i,
    /^replan-transform:([^:]+):/i,
    /^transform:([^:]+):/i,
  ];
  for (const token of evidence) {
    const normalizedToken = token.trim();
    if (!normalizedToken) {
      continue;
    }
    for (const pattern of markerPatterns) {
      const match = normalizedToken.match(pattern);
      const candidate = match?.[1]?.trim();
      if (
        candidate &&
        candidate !== "(unknown)" &&
        candidate !== "(missing-target)"
      ) {
        extracted.add(normalizePathLike(candidate));
        break;
      }
    }
  }
  return Array.from(extracted);
}

function normalizePathLike(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\/+/g, "").trim();
}
