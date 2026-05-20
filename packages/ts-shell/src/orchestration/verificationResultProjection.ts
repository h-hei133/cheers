import {
  projectRuntimeReceiptEvidence,
  type ToolLifecycleResult,
} from "./flowDispatch.js";
import { projectVerificationEvidence } from "./flowEvidenceProjection.js";
import { classifyVerificationFailure } from "./toolExecutionOutcomeProjection.js";
import type { VerificationPlan, VerificationRetryDecision } from "./verificationPlanner.js";
import type { CodingVerificationSummary } from "./types.js";

export interface VerificationProjection {
  readonly verification: CodingVerificationSummary;
  readonly note: string;
  readonly evidence: readonly string[];
  readonly retry: VerificationRetryDecision;
}

export function projectCommandVerificationResult(input: {
  readonly plan: VerificationPlan;
  readonly result: ToolLifecycleResult;
  readonly attempt: number;
  readonly retry: VerificationRetryDecision;
  readonly targetPath?: string;
  readonly workspaceRoot: string;
  readonly verifyLikeCommand: boolean;
}): VerificationProjection {
  const command = input.plan.command ?? "verify command";
  if (input.result.success) {
    const verification: CodingVerificationSummary = {
      status: "passed",
      command,
      reason: "verify completed",
      selectionScope: input.plan.selectionScope,
      selectionSource: input.plan.selectionSource,
    };
    return {
      verification,
      note: `verify passed: ${command}`,
      evidence: [
        ...projectVerificationEvidence({
          verification,
          targetPath: input.targetPath,
          workspaceRoot: input.workspaceRoot,
          verifyLikeCommand: input.verifyLikeCommand,
        }),
        ...projectRuntimeReceiptEvidence(input.result),
        "verify-retry:retry-not-planned:passed",
      ],
      retry: input.retry,
    };
  }

  const failure = classifyVerificationFailure(input.result);
  const attemptsExhausted =
    failure.status === "failed" &&
    input.retry.status === "retry-not-planned" &&
    input.retry.reasonCode === "attempts-exhausted" &&
    input.plan.maxAttempts > 1;
  const reason = attemptsExhausted
    ? `Verification command failed after ${input.plan.maxAttempts} attempts: ${failure.reason}`
    : failure.reason;
  const verification: CodingVerificationSummary = {
    status: failure.status,
    command,
    reason,
    selectionScope: input.plan.selectionScope,
    selectionSource: input.plan.selectionSource,
    blockerKind: failure.blockerKind,
    nextAction:
      failure.nextAction ??
      (failure.status === "failed"
        ? "Inspect verify output, repair the failure, then rerun verification."
        : undefined),
  };

  return {
    verification,
    note:
      failure.status === "blocked"
        ? `verify blocked: ${command}`
        : `verify failed: ${command}`,
    evidence: [
      ...projectVerificationEvidence({
        verification,
        targetPath: input.targetPath,
        workspaceRoot: input.workspaceRoot,
        verifyLikeCommand: input.verifyLikeCommand,
      }),
      ...projectRuntimeReceiptEvidence(input.result),
      `verify-retry:${input.retry.status}:${input.retry.reasonCode}`,
    ],
    retry: input.retry,
  };
}

export function projectSkippedVerification(
  plan: VerificationPlan,
): CodingVerificationSummary {
  return {
    status: "skipped",
    command: plan.command,
    reason: plan.reason,
    selectionScope: plan.selectionScope,
    selectionSource: plan.selectionSource,
    blockerKind: plan.blockerKind,
    nextAction: plan.nextAction,
  };
}

export function projectNotRequestedVerification(
  plan: VerificationPlan,
): CodingVerificationSummary {
  return {
    status: "not-requested",
    reason: plan.reason,
    selectionScope: plan.selectionScope,
    selectionSource: plan.selectionSource,
  };
}
