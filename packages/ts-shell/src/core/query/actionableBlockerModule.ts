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
  | "browser-adapter-failure"
  | "browser-cleanup-failed"
  | "patch-content-missing"
  | "unsupported-future-edit"
  | "provider-not-configured"
  | "provider-opt-in-required"
  | "provider-unsupported";

export type ActionableBlockerContract = {
  kind: ActionableBlockerKind;
  reason: string;
};

export type ActionableBlockerTerminalDetail = ActionableBlockerContract & {
  doNext: string;
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
    (() => {
      const verification = input.codingResult?.verification;
      if (
        verification.status === "blocked" &&
        verification.blockerKind === "approval-denied" &&
        Boolean(verification.nextAction?.trim())
      ) {
        return "approval-denied";
      }
      return classifyActionableKind(
        reason,
        input.codingResult?.verification.status === "failed",
      );
    })();
  if (!kind) {
    return undefined;
  }

  const nextAction = input.codingResult?.verification.nextAction?.trim();
  return {
    kind,
    reason: kind === "approval-denied" && nextAction ? nextAction : reason,
  };
}

export function projectActionableBlockerTerminalDetail(
  contract: ActionableBlockerContract,
): ActionableBlockerTerminalDetail {
  return {
    ...contract,
    doNext: actionableBlockerNextAction(contract.kind),
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
  const providerReadinessMarker = evidence
    .find((entry) => entry.startsWith("provider-readiness:"))
    ?.trim();
  const actionableMarker =
    marker ?? mutationSummaryMarker ?? providerReadinessMarker;
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
    actionableMarker === "browser-adapter-failure" ||
    actionableMarker === "browser-cleanup-failed" ||
    actionableMarker === "patch-content-missing" ||
    actionableMarker === "unsupported-future-edit" ||
    actionableMarker === "provider-not-configured" ||
    actionableMarker === "provider-opt-in-required" ||
    actionableMarker === "provider-unsupported"
  ) {
    return actionableMarker;
  }
  if (
    actionableMarker === "provider-readiness:missing-key" ||
    actionableMarker === "provider-readiness:missing-config"
  ) {
    return "provider-not-configured";
  }
  if (actionableMarker === "provider-readiness:unsupported-provider") {
    return "provider-unsupported";
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
  if (
    normalized.includes("cleanup-failed") ||
    normalized.includes("cleanup failed")
  ) {
    return "browser-cleanup-failed";
  }
  if (
    normalized.includes("provider-readiness:missing-key") ||
    normalized.includes("provider-readiness:missing-config") ||
    normalized.includes("provider not configured") ||
    normalized.includes("missing provider key") ||
    normalized.includes("requires a configured base url") ||
    normalized.includes("requires a configured model")
  ) {
    return "provider-not-configured";
  }
  if (
    normalized.includes("provider-opt-in-required") ||
    normalized.includes("real provider path requires explicit opt-in") ||
    normalized.includes("real-provider opt-in required")
  ) {
    return "provider-opt-in-required";
  }
  if (
    normalized.includes("provider-readiness:unsupported-provider") ||
    normalized.includes("unsupported provider")
  ) {
    return "provider-unsupported";
  }
  if (verificationFailed || normalized.includes("verification failed")) {
    return "verification-failed";
  }
  if (normalized.includes("not allowed in the controlled allowlist")) {
    return "command-not-allowlisted";
  }
  if (
    normalized.includes("review-only planning runtime") ||
    normalized.includes("verification intent only") ||
    normalized.includes("mutationauthority=not-granted") ||
    normalized.includes("mutation authority is not granted")
  ) {
    // A planning stop with a structured handoff is actionable by design: the
    // user confirms or supplies what the planner listed. Looping cannot grant
    // the missing mutation authority.
    return "unsupported-future-edit";
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
    normalized.includes("edit-target-missing") ||
    normalized.includes("explicit target is required")
  ) {
    return "patch-target-missing";
  }
  if (
    normalized.includes("patch-content-missing") ||
    normalized.includes("edit-patch-content-or-transform-missing") ||
    normalized.includes("concrete content") ||
    normalized.includes("exact mapping") ||
    normalized.includes("transform manifest is missing")
  ) {
    return "patch-content-missing";
  }
  if (
    normalized.includes("unsupported-future-edit") ||
    normalized.includes("preview-only future edit") ||
    normalized.includes("execution is not enabled") ||
    normalized.includes("future-only")
  ) {
    return "unsupported-future-edit";
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

function actionableBlockerNextAction(kind: ActionableBlockerKind): string {
  switch (kind) {
    case "command-not-allowlisted":
      return "Rephrase the request with an allowlisted command: node --version, npm test -- --help, or npm run build -- --help.";
    case "mcp-unavailable":
      return "Run /mcp status and /mcp refresh for the affected server, then retry with a visible executable MCP tool.";
    case "approval-denied":
      return "Re-run and approve escalation for verify command execution.";
    case "browser-policy-blocked":
      return "Use a controlled local fixture or an explicitly approved browser route before retrying.";
    case "browser-unavailable":
      return "Check the browser runtime status and install or enable the required local runtime before retrying.";
    case "browser-timeout":
      return "Retry against a controlled local fixture with a narrower target or longer dedicated browser timeout.";
    case "browser-target-missing":
      return "Re-observe the controlled page, confirm one exact target, then retry the browser action.";
    case "browser-adapter-failure":
      return "Inspect the browser adapter failure and rerun only after the adapter returns a valid result.";
    case "browser-cleanup-failed":
      return "Resolve the browser cleanup failure before retrying so no stale runtime state is reused.";
    case "provider-not-configured":
      return "Configure the provider through the approved readiness path or retry with a synthetic/non-provider route.";
    case "provider-opt-in-required":
      return "Use the explicit real-provider opt-in gate if this route intentionally needs real provider credentials.";
    case "provider-unsupported":
      return "Choose a supported provider/model mode or update the provider readiness contract in a dedicated route.";
    case "patch-from-not-found":
      return "Provide the exact current source text from the target file, then rerun the patch.";
    case "patch-target-missing":
      return "Create or confirm the target file path first, then rerun the patch.";
    case "patch-content-missing":
      return "Provide concrete content, an exact replacement mapping, or a supported patch shape before retrying.";
    case "unsupported-future-edit":
      return "Keep this as a preview/planning result until a dedicated edit capability route enables execution.";
    case "patch-generation-failed":
      return "Rerun with one explicit target file plus exact replace-from and replace-to text; do not pass unified diff or apply_patch syntax.";
    case "stale-read":
      return "Re-read the latest target file content, then rerun the edit against that current content.";
    case "partial-mutation-failed":
      return "Review the failed files, re-read current content, inspect any writer-started target before retrying, and retry only the unresolved mutation.";
    case "ambiguous-target":
      return "Specify one exact target file/path (and exact from/to text if editing), then rerun.";
    case "verification-failed":
      return "Fix the verification failure, then rerun the verification step.";
  }
}
