import type { TargetSetEditPlan } from "./targetSetEditPlan.js";

export type TargetSetEditPreflightPolicyStatus = "passed" | "stopped";

export interface TargetSetEditPreflightPolicy {
  readonly status: TargetSetEditPreflightPolicyStatus;
  readonly mutationAllowed: boolean;
  readonly reason?: string;
  readonly blocker?: string;
  readonly maxFileGuard:
    | "within-limit"
    | "over-limit"
    | "not-evaluated";
  readonly atomicity: "all-target-preflight-before-first-mutation";
  readonly writeAtomicityClaim: false;
  readonly evidence: readonly string[];
}

export function evaluateTargetSetEditPreflightPolicy(
  plan: TargetSetEditPlan,
): TargetSetEditPreflightPolicy {
  const baseEvidence = [
    "target-set-edit-policy:all-target-preflight-before-first-mutation",
    "target-set-edit-policy:no-write-atomicity-claim",
    "target-set-edit-policy:no-automatic-rollback",
    "target-set-edit-policy:exact-fenced-replacement-only",
    "target-set-edit-policy:raw-content-excluded",
  ];

  if (plan.status === "blocked") {
    return {
      status: "stopped",
      mutationAllowed: false,
      reason: plan.reason,
      blocker: plan.blocker,
      maxFileGuard:
        plan.blocker === "over-max-files" ? "over-limit" : "not-evaluated",
      atomicity: "all-target-preflight-before-first-mutation",
      writeAtomicityClaim: false,
      evidence: [
        ...baseEvidence,
        `target-set-edit-policy:blocker:${plan.blocker}`,
        "target-set-edit-policy:mutation:not-run",
      ],
    };
  }

  return {
    status: "passed",
    mutationAllowed: true,
    maxFileGuard: "within-limit",
    atomicity: "all-target-preflight-before-first-mutation",
    writeAtomicityClaim: false,
    evidence: [
      ...baseEvidence,
      `target-set-edit-policy:target-count:${plan.targetCount}`,
      "target-set-edit-policy:preflight-passed",
    ],
  };
}

export function classifyTargetSetExecutionFailure(input: {
  readonly changedFileCount: number;
  readonly failedFileCount: number;
}): "none" | "failed-before-change" | "partial-failure" {
  if (input.failedFileCount === 0) {
    return "none";
  }
  return input.changedFileCount > 0
    ? "partial-failure"
    : "failed-before-change";
}
