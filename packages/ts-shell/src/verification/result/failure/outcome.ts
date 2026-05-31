import type { ToolLifecycleProjection } from "../../../core/tools/toolLifecycleProjection.js";
import type { CodingVerificationBlockerKind } from "../../../orchestration/types.js";

export interface ToolExecutionOutcomeInput {
  readonly output?: string;
  readonly error?: string;
  readonly metadata?: Record<string, unknown>;
  readonly projection: ToolLifecycleProjection;
}

export interface VerificationFailureProjection {
  readonly status: "failed" | "blocked";
  readonly reason: string;
  readonly blockerKind?: CodingVerificationBlockerKind;
  readonly nextAction?: string;
}

export function classifyVerificationFailure(
  input: ToolExecutionOutcomeInput,
): VerificationFailureProjection {
  const reason = truncate(
    input.projection.reason ?? input.error ?? input.output ?? "verify command failed",
  );
  const blockerKind =
    input.projection.verificationBlockerKind ??
    inferVerificationBlockerKind(input, reason);
  if (!blockerKind) {
    return { status: "failed", reason };
  }

  return {
    status: "blocked",
    reason,
    blockerKind,
    nextAction: input.projection.nextAction ?? blockerNextAction(blockerKind),
  };
}

export function inferVerificationBlockerKind(
  input: { readonly metadata?: Record<string, unknown> },
  reason: string,
): CodingVerificationBlockerKind | undefined {
  const normalizedReason = reason.toLowerCase();
  const wasEscalated = input.metadata?.wasEscalated === true;
  if (wasEscalated) {
    return "approval-denied";
  }

  const failureKind = String(input.metadata?.failureKind ?? "").toLowerCase();
  if (failureKind === "sandbox_preflight") {
    return "environment-not-ready";
  }
  if (failureKind === "timeout" || failureKind === "cancelled") {
    return "environment-not-ready";
  }

  if (
    normalizedReason.includes(
      "is not recognized as an internal or external command",
    ) ||
    normalizedReason.includes("command not found") ||
    normalizedReason.includes("not found") ||
    normalizedReason.includes("enoent")
  ) {
    return "missing-command";
  }

  if (
    normalizedReason.includes("econnreset") ||
    normalizedReason.includes("timed out") ||
    normalizedReason.includes("network") ||
    normalizedReason.includes("tls")
  ) {
    return "environment-not-ready";
  }

  return undefined;
}

export function blockerNextAction(kind: CodingVerificationBlockerKind): string {
  switch (kind) {
    case "approval-denied":
      return "Re-run and approve escalation for verify command execution.";
    case "missing-command":
      return "Install or expose the verify command in PATH, then rerun verify.";
    case "environment-not-ready":
      return "Resolve environment/network readiness (dependencies, connectivity, shell), then rerun verify.";
    case "no-verify-strategy":
      return "Provide an explicit verify intent (test/build/check) so the workflow can select a command.";
    default:
      return "Inspect verify stderr and rerun with an explicit verification command.";
  }
}

function truncate(value: string, maxLength = 220): string {
  const normalized = value.trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength)}...`;
}
