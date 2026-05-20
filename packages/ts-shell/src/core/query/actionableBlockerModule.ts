import type { CodingResultSummary } from "../../orchestration/types.js";

export type ActionableBlockerKind =
  | "ambiguous-target"
  | "patch-from-not-found"
  | "patch-target-missing"
  | "patch-generation-failed"
  | "stale-read"
  | "partial-mutation-failed"
  | "verification-failed"
  | "command-not-allowlisted"
  | "mcp-unavailable"
  | "approval-denied"
  | "browser-policy-blocked"
  | "browser-unavailable"
  | "browser-timeout"
  | "browser-target-missing"
  | "browser-adapter-failure";

export type ActionableBlockerContract = {
  kind: ActionableBlockerKind;
  reason: string;
};

export function deriveActionableBlockerContract(input: {
  stopReason?: string;
  codingResult?: CodingResultSummary;
}): ActionableBlockerContract | undefined {
  const evidenceKind = findActionableKindFromEvidence(
    input.codingResult?.evidence,
  );
  const reason =
    input.stopReason?.trim() ||
    firstTruthy(
      input.codingResult?.failedFiles.map((entry) => entry.reason) ?? [],
    ) ||
    input.codingResult?.verification.reason?.trim() ||
    firstTruthy(input.codingResult?.taskSatisfaction.reasons ?? []);

  if (!reason) {
    return undefined;
  }

  const kind =
    evidenceKind ??
    classifyActionableKind(
      reason,
      input.codingResult?.verification.status === "failed",
    );
  if (!kind) {
    return undefined;
  }

  const nextAction = input.codingResult?.verification.nextAction?.trim();
  return {
    kind,
    reason: kind === "approval-denied" && nextAction ? nextAction : reason,
  };
}

export function findActionableKindFromEvidence(
  evidence: readonly string[] | undefined,
): ActionableBlockerKind | undefined {
  if (!evidence) {
    return undefined;
  }
  const marker = evidence
    .find((entry) => entry.startsWith("actionable-blocker-kind:"))
    ?.slice("actionable-blocker-kind:".length)
    .trim();
  const mutationSummaryMarker = evidence
    .find((entry) => entry.startsWith("mutation-summary-blocker:"))
    ?.slice("mutation-summary-blocker:".length)
    .trim();
  const actionableMarker = marker ?? mutationSummaryMarker;
  if (
    actionableMarker === "ambiguous-target" ||
    actionableMarker === "patch-from-not-found" ||
    actionableMarker === "patch-target-missing" ||
    actionableMarker === "patch-generation-failed" ||
    actionableMarker === "stale-read" ||
    actionableMarker === "partial-mutation-failed" ||
    actionableMarker === "verification-failed" ||
    actionableMarker === "command-not-allowlisted" ||
    actionableMarker === "mcp-unavailable" ||
    actionableMarker === "approval-denied" ||
    actionableMarker === "browser-policy-blocked" ||
    actionableMarker === "browser-unavailable" ||
    actionableMarker === "browser-timeout" ||
    actionableMarker === "browser-target-missing" ||
    actionableMarker === "browser-adapter-failure"
  ) {
    return actionableMarker;
  }
  return undefined;
}

export function classifyActionableKind(
  reason: string,
  verificationFailed: boolean,
): ActionableBlockerKind | undefined {
  const normalized = reason.toLowerCase();
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
    normalized.includes("policy-blocked") ||
    normalized.includes("public web automation is blocked") ||
    normalized.includes("outside the controlled local fixture")
  ) {
    return "browser-policy-blocked";
  }
  if (
    normalized.includes("runtime-package-missing") ||
    normalized.includes("runtime-binary-missing") ||
    (normalized.includes("direct playwright runtime") &&
      normalized.includes("disabled"))
  ) {
    return "browser-unavailable";
  }
  if (
    normalized.includes("action-target-missing") ||
    normalized.includes("target was not found")
  ) {
    return "browser-target-missing";
  }
  if (
    normalized.includes("action-timeout") ||
    normalized.includes("navigation-timeout") ||
    normalized.includes("timed out")
  ) {
    return "browser-timeout";
  }
  if (
    normalized.includes("browser tool failed") ||
    normalized.includes("playwright operation failed")
  ) {
    return "browser-adapter-failure";
  }
  if (verificationFailed || normalized.includes("verification failed")) {
    return "verification-failed";
  }
  if (normalized.includes("not allowed in the mvp allowlist")) {
    return "command-not-allowlisted";
  }
  if (
    normalized.includes("approval denied") ||
    normalized.includes("user rejected") ||
    normalized.includes("rejected permission") ||
    normalized.includes("permission rejected")
  ) {
    return "approval-denied";
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
    normalized.includes("changed since it was read") ||
    normalized.includes("read it again before")
  ) {
    return "stale-read";
  }
  if (
    normalized.includes("partial-mutation-failed") ||
    normalized.includes("mutation-summary-blocker") ||
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
    normalized.includes("relocation is ambiguous") ||
    normalized.includes("follow-up is ambiguous") ||
    (normalized.includes("ambiguous") && !normalized.includes("allowlist"))
  ) {
    return "ambiguous-target";
  }
  return undefined;
}

function firstTruthy(values: readonly string[]): string | undefined {
  return values.find((value) => value.trim().length > 0);
}

