import { projectVerificationEvidence } from "./flowEvidenceProjection.js";
import type { ToolLifecycleResult } from "./flowDispatch.js";
import type { CodingTaskKind } from "./types.js";
import {
  planVerification,
  planVerificationRetry,
  stripVerificationTailForMutationTarget,
  type VerificationPlan,
  type VerificationRetryDecision,
} from "./verificationPlanner.js";
import {
  projectCommandVerificationResult,
  projectNotRequestedVerification,
  projectSkippedVerification,
  type VerificationProjection,
} from "./verificationResultProjection.js";
import type { CodingVerificationSummary } from "./types.js";

export type {
  VerificationPlan,
  VerificationRetryDecision,
} from "./verificationPlanner.js";
export type { VerificationProjection } from "./verificationResultProjection.js";

export function stripVerificationTailForTarget(prompt: string): string {
  return stripVerificationTailForMutationTarget(prompt);
}

export function planWorkflowVerification(input: {
  readonly taskKind: CodingTaskKind;
  readonly prompt: string;
  readonly changedFiles: readonly string[];
  readonly explicitVerifyRequested: boolean;
  readonly explicitVerifyCommand?: string;
}): VerificationPlan {
  return planVerification(input);
}

export function planWorkflowVerificationRetry(input: {
  readonly plan: VerificationPlan;
  readonly attempt: number;
  readonly outcome: "passed" | "failed" | "blocked";
}): VerificationRetryDecision {
  return planVerificationRetry(input);
}

export function projectWorkflowCommandVerification(input: {
  readonly plan: VerificationPlan;
  readonly result: ToolLifecycleResult;
  readonly attempt: number;
  readonly retry: VerificationRetryDecision;
  readonly targetPath?: string;
  readonly workspaceRoot: string;
  readonly verifyLikeCommand: boolean;
}): VerificationProjection {
  return projectCommandVerificationResult(input);
}

export function projectSkippedWorkflowVerification(
  plan: VerificationPlan,
): CodingVerificationSummary {
  return projectSkippedVerification(plan);
}

export function projectNotRequestedWorkflowVerification(
  plan: VerificationPlan,
): CodingVerificationSummary {
  return projectNotRequestedVerification(plan);
}

export function projectWorkflowVerificationEvidence(input: {
  readonly verification: CodingVerificationSummary;
  readonly targetPath?: string;
  readonly workspaceRoot: string;
  readonly verifyLikeCommand: boolean;
}): readonly string[] {
  return projectVerificationEvidence(input);
}
