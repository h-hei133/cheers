import type { ToolLifecycleResult } from "./flowDispatch.js";
import type { VerificationCommandPlan } from "./verificationCommandPlan.js";

export type VerificationFailureClass =
  | "test-failed"
  | "typecheck-failed"
  | "build-failed"
  | "lint-failed"
  | "command-not-allowlisted"
  | "command-timed-out"
  | "command-blocked-by-policy"
  | "command-unavailable"
  | "environment-failed"
  | "no-verification-command"
  | "invalid-runtime-receipt"
  | "unknown";

export interface VerificationFailureClassification {
  readonly failureClass: VerificationFailureClass;
  readonly repairEligible: boolean;
  readonly reason: string;
  readonly nextAction: string;
  readonly evidence: readonly string[];
}

export function classifyVerificationCommandFailure(input: {
  readonly plan: VerificationCommandPlan;
  readonly result?: Pick<ToolLifecycleResult, "success" | "error" | "output" | "metadata" | "projection">;
  readonly runtimeReceiptMarkers?: readonly string[];
}): VerificationFailureClassification {
  const markers = input.runtimeReceiptMarkers ?? [];
  const result = input.result;
  if (input.plan.state === "missing-command") {
    return classification({
      failureClass: "no-verification-command",
      repairEligible: false,
      reason: "No verification command candidate was available.",
      nextAction: "Attach an allowlisted verification command before repair planning.",
      plan: input.plan,
    });
  }
  if (input.plan.state === "not-allowlisted") {
    return classification({
      failureClass: "command-not-allowlisted",
      repairEligible: false,
      reason: input.plan.reason,
      nextAction: input.plan.nextAction,
      plan: input.plan,
    });
  }
  if (input.plan.state === "blocked-by-policy" || result?.projection.kind === "permission-blocked" || result?.projection.kind === "approval-denied" || result?.projection.kind === "environment-blocked") {
    return classification({
      failureClass: "command-blocked-by-policy",
      repairEligible: false,
      reason: result?.projection.reason ?? input.plan.reason,
      nextAction: result?.projection.nextAction ?? input.plan.nextAction,
      plan: input.plan,
    });
  }
  if (input.plan.state === "permission-required") {
    return classification({
      failureClass: "command-blocked-by-policy",
      repairEligible: false,
      reason: input.plan.reason,
      nextAction: input.plan.nextAction,
      plan: input.plan,
    });
  }
  if (!result) {
    return classification({
      failureClass: "invalid-runtime-receipt",
      repairEligible: false,
      reason: "Verification command did not produce a runtime result.",
      nextAction: "Run through the existing runtime dispatcher and capture receipt evidence.",
      plan: input.plan,
    });
  }
  if (result.projection.kind === "tool-unavailable") {
    return classification({
      failureClass: "command-unavailable",
      repairEligible: false,
      reason: result.projection.reason ?? "Verification command runtime is unavailable.",
      nextAction: result.projection.nextAction ?? "Resolve runtime availability before verification.",
      plan: input.plan,
    });
  }
  if (isTimeout(result, markers)) {
    return classification({
      failureClass: "command-timed-out",
      repairEligible: false,
      reason: result.projection.reason ?? result.error ?? "Verification command timed out.",
      nextAction: "Resolve environment readiness or rerun the allowlisted command manually.",
      plan: input.plan,
    });
  }
  if (markers.length === 0) {
    return classification({
      failureClass: "invalid-runtime-receipt",
      repairEligible: false,
      reason: "Verification command result did not include runtime receipt markers.",
      nextAction: "Capture runtime receipt evidence before opening the repair loop.",
      plan: input.plan,
    });
  }

  const command = input.plan.command ?? "";
  const reason = result.projection.reason ?? result.error ?? result.output ?? "Verification command failed.";
  if (
    markers.some((entry) => entry.includes("daemon-unavailable")) ||
    /daemon execution failed|stream was destroyed|environment failed/i.test(reason)
  ) {
    return classification({
      failureClass: "environment-failed",
      repairEligible: false,
      reason,
      nextAction: "Resolve verification runtime environment readiness before opening the repair loop.",
      plan: input.plan,
    });
  }
  if (/\bnpm\s+test\b/i.test(command)) {
    return classification({
      failureClass: "test-failed",
      repairEligible: true,
      reason,
      nextAction: "Create a review-gated repair context from the failed test command.",
      plan: input.plan,
    });
  }
  if (/\bnpm\s+run\s+build\b/i.test(command)) {
    return classification({
      failureClass: "build-failed",
      repairEligible: true,
      reason,
      nextAction: "Create a review-gated repair context from the failed build command.",
      plan: input.plan,
    });
  }
  if (/\b(?:tsc|typecheck)\b/i.test(command)) {
    return classification({
      failureClass: "typecheck-failed",
      repairEligible: true,
      reason,
      nextAction: "Create a review-gated repair context from the failed typecheck/build command.",
      plan: input.plan,
    });
  }
  if (/\b(?:lint|eslint)\b/i.test(command)) {
    return classification({
      failureClass: "lint-failed",
      repairEligible: true,
      reason,
      nextAction: "Create a review-gated repair context from the failed lint command.",
      plan: input.plan,
    });
  }
  return classification({
    failureClass: "unknown",
    repairEligible: true,
    reason,
    nextAction: "Create a review-gated repair context from the failed verification command.",
    plan: input.plan,
  });
}

function isTimeout(
  result: Pick<ToolLifecycleResult, "error" | "metadata" | "projection">,
  markers: readonly string[],
): boolean {
  const failureKind = String(result.metadata?.failureKind ?? "").toLowerCase();
  const reason = `${result.projection.reason ?? ""} ${result.error ?? ""}`.toLowerCase();
  return (
    failureKind === "timeout" ||
    markers.some((entry) => entry.includes("runtime-receipt-timeout:")) ||
    reason.includes("timed out") ||
    reason.includes("timeout")
  );
}

function classification(input: {
  readonly failureClass: VerificationFailureClass;
  readonly repairEligible: boolean;
  readonly reason: string;
  readonly nextAction: string;
  readonly plan: VerificationCommandPlan;
}): VerificationFailureClassification {
  return {
    failureClass: input.failureClass,
    repairEligible: input.repairEligible,
    reason: compact(input.reason, 260),
    nextAction: compact(input.nextAction, 260),
    evidence: [
      `verification-command-classifier:class:${input.failureClass}`,
      `verification-command-classifier:repair-eligible:${input.repairEligible ? "yes" : "no"}`,
      `verification-command-classifier:plan:${input.plan.verificationPlanId}`,
      "verification-command-classifier:raw-content-excluded",
    ],
  };
}

function compact(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength)}...`;
}
