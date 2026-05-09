import type { CodingResultSummary } from "../orchestration/types.js";

export type ActionableFailureBlockerKind =
  | "ambiguous-target"
  | "patch-from-not-found"
  | "patch-target-missing"
  | "patch-generation-failed"
  | "stale-read"
  | "partial-mutation-failed"
  | "verification-failed"
  | "command-not-allowlisted"
  | "mcp-unavailable"
  | "approval-denied";

export interface ActionableFailureContinuity {
  readonly blockerKind?: ActionableFailureBlockerKind | string;
  readonly nextAction?: string;
}

export function deriveActionableFailureContinuity(
  codingResult: CodingResultSummary | undefined,
): ActionableFailureContinuity | undefined {
  if (!codingResult) {
    return undefined;
  }

  const evidence = [
    ...codingResult.evidence,
    ...codingResult.continuation.evidence,
  ];
  const reason =
    codingResult.verification.reason ??
    codingResult.failedFiles.find((entry) => entry.reason.trim())?.reason ??
    codingResult.taskSatisfaction.reasons.find((entry) => entry.trim()) ??
    codingResult.failureBoundary;
  const blockerKind =
    extractBlockerFromEvidence(evidence) ??
    normalizeActionableBlocker(codingResult.verification.blockerKind) ??
    classifyBlockerFromReason(reason);
  const nextAction =
    normalizeText(codingResult.verification.nextAction) ??
    extractNextActionFromEvidence(evidence) ??
    extractNextActionFromRepairNotes(codingResult.repair.notes) ??
    (blockerKind ? defaultNextAction(blockerKind) : undefined);

  if (!blockerKind && !nextAction) {
    return undefined;
  }

  return {
    ...(blockerKind ? { blockerKind } : {}),
    ...(nextAction ? { nextAction } : {}),
  };
}

function extractBlockerFromEvidence(
  evidence: readonly string[],
): ActionableFailureBlockerKind | undefined {
  for (const prefix of [
    "actionable-blocker-kind:",
    "mutation-summary-blocker:",
    "verify-blocker-kind:",
  ]) {
    const marker = evidence
      .find((entry) => entry.startsWith(prefix))
      ?.slice(prefix.length)
      .trim();
    const blocker = normalizeActionableBlocker(marker);
    if (blocker) {
      return blocker;
    }
  }
  return undefined;
}

function extractNextActionFromEvidence(
  evidence: readonly string[],
): string | undefined {
  for (const prefix of [
    "actionable-blocker-next:",
    "mutation-summary-next-action:",
    "verify-next-action:",
  ]) {
    const value = evidence
      .find((entry) => entry.startsWith(prefix))
      ?.slice(prefix.length);
    const normalized = normalizeText(value);
    if (normalized) {
      return normalized;
    }
  }
  return undefined;
}

function extractNextActionFromRepairNotes(
  notes: readonly string[],
): string | undefined {
  for (const note of notes) {
    const explicit = note.match(/\bNext action:\s*(.+)$/i)?.[1];
    const normalizedExplicit = normalizeText(explicit);
    if (normalizedExplicit) {
      return normalizedExplicit;
    }
    const normalizedNote = normalizeText(note);
    if (normalizedNote && isActionLike(normalizedNote)) {
      return normalizedNote;
    }
  }
  return undefined;
}

function classifyBlockerFromReason(
  reason: string | undefined,
): ActionableFailureBlockerKind | undefined {
  const normalized = reason?.toLowerCase() ?? "";
  if (!normalized) {
    return undefined;
  }
  if (normalized.includes("verification failed")) {
    return "verification-failed";
  }
  if (
    normalized.includes("mcp config is invalid") ||
    normalized.includes("mcp server ") ||
    normalized.includes("unknown mcp server") ||
    (normalized.includes("mcp tool ") &&
      (normalized.includes("not registered") ||
        normalized.includes("unavailable")))
  ) {
    return "mcp-unavailable";
  }
  if (
    normalized.includes("approval denied") ||
    normalized.includes("user rejected") ||
    normalized.includes("rejected permission") ||
    normalized.includes("permission rejected")
  ) {
    return "approval-denied";
  }
  if (normalized.includes("not allowed in the mvp allowlist")) {
    return "command-not-allowlisted";
  }
  if (
    normalized.includes("patch-target-missing") ||
    normalized.includes("edit-target-missing")
  ) {
    return "patch-target-missing";
  }
  if (
    normalized.includes("patch-generation-failed") ||
    normalized.includes("unified diff") ||
    normalized.includes("apply_patch")
  ) {
    return "patch-generation-failed";
  }
  if (
    normalized.includes("stale-read") ||
    normalized.includes("stale read") ||
    normalized.includes("changed since it was read")
  ) {
    return "stale-read";
  }
  if (
    normalized.includes("partial-mutation-failed") ||
    normalized.includes("one or more file mutations failed")
  ) {
    return "partial-mutation-failed";
  }
  if (
    normalized.includes("patch-from-not-found") ||
    normalized.includes("replace source text not found")
  ) {
    return "patch-from-not-found";
  }
  if (
    normalized.includes("patch-ambiguous") ||
    normalized.includes("target-not-unique") ||
    (normalized.includes("ambiguous") && !normalized.includes("allowlist"))
  ) {
    return "ambiguous-target";
  }
  return undefined;
}

function normalizeActionableBlocker(
  value: string | undefined,
): ActionableFailureBlockerKind | undefined {
  switch (value?.trim()) {
    case "ambiguous-target":
    case "patch-from-not-found":
    case "patch-target-missing":
    case "patch-generation-failed":
    case "stale-read":
    case "partial-mutation-failed":
    case "verification-failed":
    case "command-not-allowlisted":
    case "mcp-unavailable":
    case "approval-denied":
      return value.trim() as ActionableFailureBlockerKind;
    default:
      return undefined;
  }
}

function defaultNextAction(blockerKind: string): string | undefined {
  switch (blockerKind) {
    case "approval-denied":
      return "Submit the prompt again and approve escalation only if the requested action is still intended.";
    case "patch-generation-failed":
      return "Rerun with one explicit target file plus exact replace-from and replace-to text; do not pass unified diff or apply_patch syntax.";
    case "stale-read":
      return "Re-read the latest target file content, then rerun the edit against that current content.";
    case "partial-mutation-failed":
      return "Review the failed files, re-read current content, and retry only the unresolved mutation.";
    case "patch-from-not-found":
      return "Provide the exact current source text from the target file, then rerun the patch.";
    case "patch-target-missing":
      return "Create or confirm the target file path first, then rerun the patch.";
    case "ambiguous-target":
      return "Specify one exact target file/path and exact from/to text if editing, then rerun.";
    case "verification-failed":
      return "Fix the verification failure, then rerun the verification step.";
    case "command-not-allowlisted":
      return "Rephrase the request with an allowlisted command.";
    case "mcp-unavailable":
      return "Run /mcp status and /mcp refresh for the affected server, then retry with a visible executable MCP tool.";
    default:
      return undefined;
  }
}

function isActionLike(value: string): boolean {
  return /^(re-read|rerun|retry|review|inspect|fix|submit|provide|create|confirm|specify)\b/i.test(
    value,
  );
}

function normalizeText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}
