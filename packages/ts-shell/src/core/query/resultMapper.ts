import type {
  CodingResultSummary,
  OrchestrationResult,
  TerminalClassification,
  TerminalReason,
} from "../../orchestration/types.js";
import type { QueryRuntimeState } from "./runtimeState.js";
import type { QueryTerminal } from "./transitions.js";

export function mapTerminalToOrchestrationResult(
  state: QueryRuntimeState,
  terminal: QueryTerminal,
): OrchestrationResult {
  const latestCodingResult =
    state.transcript[state.transcript.length - 1]?.codingResult;
  const codingResult = latestCodingResult
    ? {
        ...latestCodingResult,
        ...(terminal.terminalReason === "completed" ||
        latestCodingResult.failureBoundary
          ? {}
          : {
              failureBoundary: terminal.stopReason ?? terminal.terminalReason,
            }),
      }
    : undefined;

  const truthfulTerminal = deriveTruthfulTerminal({
    terminal,
    codingResult,
    lastContinuationReason: state.lastContinuationReason,
  });

  return {
    status: truthfulTerminal.terminalReason,
    terminalReason: truthfulTerminal.terminalReason,
    terminalClassification: truthfulTerminal.terminalClassification,
    lastContinuationReason: state.lastContinuationReason,
    stopReason: truthfulTerminal.stopReason,
    transcript: state.transcript,
    sharedContext: state.sharedContext,
    finalOutput: state.transcript[state.transcript.length - 1]?.content ?? "",
    codingResult,
  };
}

type ActionableBlockerKind =
  | "ambiguous-target"
  | "patch-from-not-found"
  | "patch-target-missing"
  | "patch-generation-failed"
  | "stale-read"
  | "partial-mutation-failed"
  | "verification-failed"
  | "command-not-allowlisted"
  | "approval-denied";

function deriveTruthfulTerminal(input: {
  terminal: QueryTerminal;
  codingResult?: CodingResultSummary;
  lastContinuationReason?: QueryRuntimeState["lastContinuationReason"];
}): {
  terminalReason: TerminalReason;
  terminalClassification: TerminalClassification;
  stopReason?: string;
} {
  const baseClassification =
    input.terminal.terminalClassification ??
    classifyTerminalReason(
      input.terminal.terminalReason,
      input.lastContinuationReason,
    );
  const base = {
    terminalReason: input.terminal.terminalReason,
    terminalClassification: baseClassification,
    stopReason: input.terminal.stopReason,
  };

  const baseActionableBlocker = deriveActionableBlockerContract({
    stopReason: input.terminal.stopReason,
    codingResult: input.codingResult,
  });
  if (
    input.terminal.terminalReason !== "completed" &&
    baseActionableBlocker &&
    baseClassification === "error"
  ) {
    return {
      terminalReason: input.terminal.terminalReason,
      terminalClassification: "stopped",
      stopReason: baseActionableBlocker.reason,
    };
  }

  if (input.terminal.terminalReason !== "completed" || !input.codingResult) {
    return base;
  }

  const codingResult = input.codingResult;
  const taskVerdict = codingResult.taskSatisfaction.verdict;
  const verification = codingResult.verification;
  const taskReason = firstTruthy(codingResult.taskSatisfaction.reasons);
  const verificationReason = verification.reason?.trim();
  const failedReason = firstTruthy(
    codingResult.failedFiles.map((entry) => entry.reason),
  );
  const actionableBlocker = deriveActionableBlockerContract({
    stopReason: verificationReason ?? taskReason ?? failedReason,
    codingResult,
  });
  const hasHardFailure = hasHardFailureSignal(codingResult);

  if (
    actionableBlocker &&
    !hasSuccessfulMutationWithVerificationCaveat(codingResult) &&
    !(actionableBlocker.kind === "verification-failed" && hasHardFailure)
  ) {
    return {
      terminalReason: "stopped_error",
      terminalClassification: "stopped",
      stopReason: actionableBlocker.reason,
    };
  }

  if (verification.status === "failed" && !hasHardFailure) {
    return {
      terminalReason: "stopped_error",
      terminalClassification: "error",
      stopReason:
        verificationReason ??
        taskReason ??
        failedReason ??
        "Verification failed",
    };
  }

  if (verification.status === "blocked") {
    if (hasSuccessfulMutationWithVerificationCaveat(codingResult)) {
      return base;
    }

    return {
      terminalReason: "stopped_error",
      terminalClassification: "stopped",
      stopReason:
        verification.nextAction ??
        verificationReason ??
        taskReason ??
        `Verification blocked (${verification.blockerKind ?? "unknown"})`,
    };
  }

  if (hasHardFailure) {
    return {
      terminalReason: "stopped_error",
      terminalClassification: "error",
      stopReason: buildHardFailureStopReason({
        codingResult,
        taskReason,
        failedReason,
        verificationReason,
      }),
    };
  }

  if (
    taskVerdict === "insufficient-evidence" ||
    taskVerdict === "completed-with-caveats"
  ) {
    if (hasSuccessfulMutationWithVerificationCaveat(codingResult)) {
      return base;
    }

    return {
      terminalReason: "stopped_error",
      terminalClassification: "stopped",
      stopReason:
        taskReason ??
        verificationReason ??
        "Task completed with insufficient evidence",
    };
  }

  return base;
}

function hasSuccessfulMutationWithVerificationCaveat(
  codingResult: CodingResultSummary,
): boolean {
  return (
    codingResult.changedFiles.length > 0 &&
    codingResult.failedFiles.length === 0 &&
    codingResult.verification.status === "blocked"
  );
}

function hasHardFailureSignal(codingResult: CodingResultSummary): boolean {
  if (
    codingResult.failedFiles.length === 0 &&
    codingResult.taskSatisfaction.reasons.length === 0
  ) {
    return false;
  }

  const reasons = [
    ...codingResult.failedFiles.map((entry) => entry.reason),
    ...codingResult.taskSatisfaction.reasons,
  ];

  return reasons.some(isHardFailureReason);
}

function buildHardFailureStopReason(input: {
  codingResult: CodingResultSummary;
  taskReason?: string;
  failedReason?: string;
  verificationReason?: string;
}): string {
  if (isBashExecutionFailure(input.codingResult) && input.failedReason) {
    return `Bash execution failed after approval: ${input.failedReason}`;
  }

  const explicitReason = [
    input.taskReason,
    input.failedReason,
    input.verificationReason,
  ].find(
    (reason): reason is string =>
      Boolean(reason) &&
      !reason.toLowerCase().startsWith("workflow stopped on blocker") &&
      isHardFailureReason(reason),
  );

  return (
    explicitReason ??
    input.taskReason ??
    input.failedReason ??
    input.verificationReason ??
    "Task failed"
  );
}

function isHardFailureReason(reason: string): boolean {
  const normalized = reason.toLowerCase();
  return /(failed|error|exception|timeout|denied|write failed|read failed|mutation failed)/.test(
    normalized,
  );
}

function isBashExecutionFailure(codingResult: CodingResultSummary): boolean {
  if (hasApprovedBashExecutionFailureProvenance(codingResult)) {
    return true;
  }

  return (
    codingResult.failedFiles.some((entry) => entry.path === "(command)") &&
    codingResult.evidence.some(
      (entry) =>
        entry === "current-permission-request-tool:bash" ||
        entry.startsWith("current-permission-request-process:"),
    )
  );
}

function hasApprovedBashExecutionFailureProvenance(
  codingResult: CodingResultSummary,
): boolean {
  if (!codingResult.failedFiles.some((entry) => entry.path === "(command)")) {
    return false;
  }

  return (
    codingResult.provenance?.toolExecutions?.some(
      (execution) =>
        execution.toolName === "bash" &&
        execution.kind === "executed-failed" &&
        codingResult.provenance?.approvalDecisions?.some(
          (approval) =>
            approval.taskId === execution.taskId &&
            approval.toolName === execution.toolName &&
            approval.legacyOutcome === "approved",
        ),
    ) ?? false
  );
}

function firstTruthy(values: readonly string[]): string | undefined {
  return values.find((value) => value.trim().length > 0);
}

function deriveActionableBlockerContract(input: {
  stopReason?: string;
  codingResult?: CodingResultSummary;
}): { kind: ActionableBlockerKind; reason: string } | undefined {
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

function findActionableKindFromEvidence(
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
    actionableMarker === "approval-denied"
  ) {
    return actionableMarker;
  }
  return undefined;
}

function classifyActionableKind(
  reason: string,
  verificationFailed: boolean,
): ActionableBlockerKind | undefined {
  const normalized = reason.toLowerCase();
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

export function classifyTerminalReason(
  reason: TerminalReason,
  lastContinuationReason?: QueryRuntimeState["lastContinuationReason"],
): OrchestrationResult["terminalClassification"] {
  if (reason === "stopped_error") {
    return lastContinuationReason === "retryable-error" ? "stopped" : "error";
  }

  return reason === "completed" ? "success" : "stopped";
}
