import type {
  CodingResultSummary,
  CodingVerificationSummary,
  OrchestrationResult,
} from "./types.js";
import {
  classifyVerificationCommandFailure,
  type VerificationFailureClassification,
} from "../verification/result/failure/classifier.js";
import type { ToolLifecycleResult } from "./flowDispatch.js";
import { projectRuntimeReceiptEvidence } from "./flowDispatch.js";
import type { VerificationCommandPlan } from "../verification/command/plan.js";

export type VerificationCommandOutcome =
  | "success"
  | "failed"
  | "blocked"
  | "skipped"
  | "timeout"
  | "error";

export interface VerificationCommandResult {
  readonly verificationId: string;
  readonly commandPlanId: string;
  readonly commandSafeLabel?: string;
  readonly outcome: VerificationCommandOutcome;
  readonly verification: CodingVerificationSummary;
  readonly runtimeReceiptMarkers: readonly string[];
  readonly exitCode?: number;
  readonly durationMs?: number;
  readonly timeoutStatus: "not-timed-out" | "timed-out" | "unknown";
  readonly stdoutBudgetStatus: "absent" | "budgeted" | "redacted";
  readonly stderrBudgetStatus: "absent" | "budgeted" | "redacted";
  readonly failureSummary?: string;
  readonly failureClassification?: VerificationFailureClassification;
  readonly redactionStatus: "clean" | "redacted" | "failed";
  readonly repairEligible: boolean;
  readonly mutation: "not-run";
  readonly providerCall: "not-run";
  readonly evidence: readonly string[];
  readonly transcriptSummary: string;
}

export function buildVerificationCommandResult(input: {
  readonly plan: VerificationCommandPlan;
  readonly result?: Pick<ToolLifecycleResult, "success" | "error" | "output" | "metadata" | "projection">;
}): VerificationCommandResult {
  const runtimeReceiptMarkers = input.result
    ? projectRuntimeReceiptEvidence(input.result)
    : [];
  const failureClassification =
    input.result?.success === false || input.plan.state !== "ready"
      ? classifyVerificationCommandFailure({
          plan: input.plan,
          result: input.result,
          runtimeReceiptMarkers,
        })
      : undefined;
  const outcome = classifyOutcome({
    plan: input.plan,
    result: input.result,
    failureClassification,
  });
  const verification: CodingVerificationSummary = {
    status:
      outcome === "success"
        ? "passed"
        : outcome === "failed" || outcome === "timeout"
          ? "failed"
          : outcome === "blocked"
            ? "blocked"
            : "skipped",
    ...(input.plan.command ? { command: input.plan.command } : {}),
    reason:
      outcome === "success"
        ? "verification command succeeded"
        : failureClassification?.reason ?? input.plan.reason,
    selectionScope: "focused",
    selectionSource:
      input.plan.source === "explicit" ? "explicit-user" : "auto-from-changes",
    ...(outcome === "blocked" ? { blockerKind: "environment-not-ready" as const } : {}),
    nextAction:
      outcome === "success"
        ? "Continue with the verified result."
        : failureClassification?.nextAction ?? input.plan.nextAction,
  };
  const redactionStatus = deriveRedactionStatus(runtimeReceiptMarkers);
  const timeoutStatus =
    outcome === "timeout"
      ? "timed-out"
      : runtimeReceiptMarkers.some((entry) => entry.startsWith("runtime-receipt-timeout:"))
        ? "timed-out"
        : runtimeReceiptMarkers.length > 0
          ? "not-timed-out"
          : "unknown";
  const verificationId = `${input.plan.verificationPlanId}:result:${outcome}`;
  const evidence = [
    ...input.plan.evidence,
    ...runtimeReceiptMarkers,
    ...(failureClassification?.evidence ?? []),
    `verification-command-result:id:${verificationId}`,
    `verification-command-result:plan:${input.plan.verificationPlanId}`,
    `verification-command-result:outcome:${outcome}`,
    `verification-command-result:repair-eligible:${failureClassification?.repairEligible ? "yes" : "no"}`,
    `verification-command-result:runtime-receipts:${runtimeReceiptMarkers.length}`,
    `verification-command-result:redaction:${redactionStatus}`,
    "verification-command-result:mutation:not-run",
    "verification-command-result:provider-call:not-run",
    "verification-command-result:raw-content-excluded",
  ];

  return {
    verificationId,
    commandPlanId: input.plan.verificationPlanId,
    ...(input.plan.commandSafeLabel ? { commandSafeLabel: input.plan.commandSafeLabel } : {}),
    outcome,
    verification,
    runtimeReceiptMarkers,
    exitCode: readExitCode(input.result?.metadata),
    durationMs: readNumber(input.result?.metadata?.durationMs),
    timeoutStatus,
    stdoutBudgetStatus: markerBudgetStatus(runtimeReceiptMarkers, "runtime-receipt-stdout:"),
    stderrBudgetStatus: markerBudgetStatus(runtimeReceiptMarkers, "runtime-receipt-stderr:"),
    ...(failureClassification ? { failureSummary: failureClassification.reason } : {}),
    ...(failureClassification ? { failureClassification } : {}),
    redactionStatus,
    repairEligible: failureClassification?.repairEligible ?? false,
    mutation: "not-run",
    providerCall: "not-run",
    evidence,
    transcriptSummary: [
      `verification-command id=${verificationId}`,
      `plan=${input.plan.verificationPlanId}`,
      input.plan.commandSafeLabel ? `command=${input.plan.commandSafeLabel}` : undefined,
      `outcome=${outcome}`,
      failureClassification ? `failureClass=${failureClassification.failureClass}` : undefined,
      `runtimeReceipts=${runtimeReceiptMarkers.length}`,
      `repairEligible=${failureClassification?.repairEligible ? "yes" : "no"}`,
      "mutation:not-run",
      "raw-content-excluded",
    ].filter(Boolean).join("; "),
  };
}

export function buildVerificationCommandSurfaceResult(input: {
  readonly sessionId: string;
  readonly prompt: string;
  readonly result: VerificationCommandResult;
}): OrchestrationResult {
  const succeeded = input.result.outcome === "success";
  const finalOutput = [
    `verification command ${input.result.outcome}.`,
    `Command: ${input.result.commandSafeLabel ?? "(missing)"}`,
    `Receipt markers: ${input.result.runtimeReceiptMarkers.length}`,
    `Failure class: ${input.result.failureClassification?.failureClass ?? "(none)"}`,
    `Repair eligible: ${input.result.repairEligible ? "yes" : "no"}`,
    "Mutation: no",
    "Raw output: excluded",
  ].join("\n");

  const codingResult: CodingResultSummary = {
    taskKind: "run-command" as const,
    changedFiles: [],
    failedFiles: succeeded
      ? []
      : [{ path: "(verification-command)", reason: input.result.failureSummary ?? input.result.verification.reason ?? "verification command failed" }],
    repair: {
      status: "not-needed" as const,
      attempts: 0,
      recoveredItems: [],
      failedItems: [],
      notes: [],
    },
    continuation: {
      status: succeeded ? "first-pass-success" as const : "failed-after-bounded-continuation" as const,
      attempts: 0,
      evidence: [
        input.result.transcriptSummary,
        ...input.result.evidence,
        buildContinueSummary(input.result),
      ],
    },
    changeSet: {
      gitAware: false,
      preExistingDirtyFiles: [],
      postRunDirtyFiles: [],
      attemptedFiles: [],
      changedFiles: [],
      unchangedAttemptedFiles: [],
    },
    taskSatisfaction: {
      verdict: succeeded ? "satisfied" as const : "insufficient-evidence" as const,
      reasons: [input.result.verification.reason ?? input.result.outcome],
      requiredEvidence: ["verification command runtime receipt"],
      observedEvidence: [...input.result.evidence],
    },
    verifiedFiles: succeeded ? ["(verification-command)"] : [],
    unverifiedFiles: succeeded ? [] : [{ path: "(verification-command)", reason: input.result.verification.reason ?? "verification command failed" }],
    verification: input.result.verification,
    evidence: [...input.result.evidence],
    ...(succeeded ? {} : { failureBoundary: `verification-command-${input.result.outcome}` }),
  };

  return {
    status: succeeded ? "completed" : "stopped_error",
    terminalReason: succeeded ? "completed" : "stopped_error",
    terminalClassification: succeeded ? "success" : "stopped",
    ...(succeeded ? {} : { stopReason: input.result.verification.nextAction ?? input.result.failureSummary }),
    transcript: [
      {
        role: "coder",
        content: finalOutput,
        codingResult,
      },
    ],
    sharedContext: {
      sessionId: input.sessionId,
      initialPrompt: input.prompt,
      notes: [],
      handoffs: [],
    },
    finalOutput,
    codingResult,
  };
}

function classifyOutcome(input: {
  readonly plan: VerificationCommandPlan;
  readonly result?: Pick<ToolLifecycleResult, "success" | "metadata" | "projection" | "error">;
  readonly failureClassification?: VerificationFailureClassification;
}): VerificationCommandOutcome {
  if (input.plan.state === "missing-command" || input.plan.state === "context-missing") {
    return "skipped";
  }
  if (input.plan.state !== "ready") {
    return "blocked";
  }
  if (!input.result) {
    return "error";
  }
  if (input.result.success) {
    return "success";
  }
  if (input.failureClassification?.failureClass === "command-timed-out") {
    return "timeout";
  }
  if (input.failureClassification?.repairEligible) {
    return "failed";
  }
  return "blocked";
}

function buildContinueSummary(result: VerificationCommandResult): string {
  return [
    `verification-command id=${result.verificationId}`,
    `plan=${result.commandPlanId}`,
    result.commandSafeLabel ? `command=${result.commandSafeLabel}` : undefined,
    `outcome=${result.outcome}`,
    `failureClass=${result.failureClassification?.failureClass ?? "(none)"}`,
    `runtimeReceipts=${result.runtimeReceiptMarkers.length}`,
    `repairEligible=${result.repairEligible ? "yes" : "no"}`,
    "mutation:not-run",
    "raw-content-excluded",
  ].filter(Boolean).join("; ");
}

function markerBudgetStatus(
  markers: readonly string[],
  prefix: string,
): "absent" | "budgeted" | "redacted" {
  const marker = markers.find((entry) => entry.startsWith(prefix));
  if (!marker) {
    return "absent";
  }
  return marker.includes("[redacted]") ||
    marker.includes("[secret-redacted]") ||
    marker.includes("[long-output-excluded]")
    ? "redacted"
    : "budgeted";
}

function deriveRedactionStatus(markers: readonly string[]): "clean" | "redacted" | "failed" {
  const marker = markers.find((entry) => entry.startsWith("runtime-receipt-redaction:"));
  if (marker?.includes("failed")) {
    return "failed";
  }
  if (marker?.includes("redacted")) {
    return "redacted";
  }
  return "clean";
}

function readExitCode(metadata: Record<string, unknown> | undefined): number | undefined {
  const value = metadata?.exitCode;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
