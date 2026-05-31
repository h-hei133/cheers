import type { CodingResultSummary } from "../../../orchestration/types.js";

export function hasSuccessfulMutationWithVerificationCaveat(
  codingResult: CodingResultSummary,
): boolean {
  return (
    codingResult.changedFiles.length > 0 &&
    codingResult.failedFiles.length === 0 &&
    codingResult.verification.status === "blocked"
  );
}

export function hasHardFailureSignal(
  codingResult: CodingResultSummary,
): boolean {
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

export function buildHardFailureStopReason(input: {
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

export function isHardFailureReason(reason: string): boolean {
  const normalized = reason.toLowerCase();
  return /(failed|error|exception|timeout|denied|write failed|read failed|mutation failed)/.test(
    normalized,
  );
}

export function isBashExecutionFailure(
  codingResult: CodingResultSummary,
): boolean {
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

export function hasApprovedBashExecutionFailureProvenance(
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

