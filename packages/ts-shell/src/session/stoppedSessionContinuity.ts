import type {
  CodingResultSummary,
  CodingWriteEffect,
} from "../orchestration/types.js";
import {
  deriveActionableFailureContinuity,
  type ActionableFailureContinuity,
} from "./actionableFailureContinuity.js";

export type StoppedSessionContinuityKind =
  | "writer-started-unknown"
  | "writer-started-unverified"
  | "approval-denied"
  | "stale-read"
  | "patch-generation-failed"
  | "mcp-unavailable"
  | "tool-execution-failed"
  | "verification-failed"
  | "partial-mutation-failed"
  | "unsupported-future-edit"
  | "generic-stopped"
  | "generic-error";

export interface StoppedSessionWriteContinuity {
  readonly writerStarted?: boolean;
  readonly writeEffect?: CodingWriteEffect;
  readonly requiresUserInspection?: boolean;
  readonly target?: string;
}

export interface StoppedSessionContinuitySurface {
  readonly kind?: StoppedSessionContinuityKind;
  readonly writeContinuity?: StoppedSessionWriteContinuity;
  readonly actionableFailure?: ActionableFailureContinuity;
  readonly failureHandoffDiagnostic?: string;
}

export function deriveStoppedSessionContinuitySurface(
  codingResult: CodingResultSummary | undefined,
): StoppedSessionContinuitySurface | undefined {
  if (!codingResult) {
    return undefined;
  }
  const writeContinuity = buildStoppedSessionWriteContinuity(codingResult);
  const actionableFailure = deriveActionableFailureContinuity(codingResult);
  const failureHandoffDiagnostic = buildStoppedSessionFailureHandoffDiagnostic(
    codingResult,
    { writeContinuity, actionableFailure },
  );
  const kind = classifyStoppedSessionContinuityKind(codingResult, {
    writeContinuity,
    actionableFailure,
  });
  if (
    !kind &&
    !writeContinuity &&
    !actionableFailure &&
    !failureHandoffDiagnostic
  ) {
    return undefined;
  }
  return {
    ...(kind ? { kind } : {}),
    ...(writeContinuity ? { writeContinuity } : {}),
    ...(actionableFailure ? { actionableFailure } : {}),
    ...(failureHandoffDiagnostic ? { failureHandoffDiagnostic } : {}),
  };
}

export function buildStoppedSessionWriteContinuity(
  codingResult: CodingResultSummary | undefined,
): StoppedSessionWriteContinuity | undefined {
  if (!codingResult) {
    return undefined;
  }
  const seed = codingResult.lastActionResultSeed;
  const observedWriteEffect =
    seed?.writeEffect ??
    extractWriteEffectFromEvidence(codingResult.evidence) ??
    extractWriteEffectFromEvidence(codingResult.continuation.evidence);
  const writerStartedFromEvidence =
    codingResult.evidence.some((entry) =>
      entry.includes("writer-started-no-success"),
    ) ||
    codingResult.continuation.evidence.some((entry) =>
      entry.includes("writer-started-stopped"),
    );
  const writerStarted =
    seed?.writerStarted ?? (writerStartedFromEvidence ? true : undefined);
  const writeEffect = writerStarted ? observedWriteEffect : undefined;
  const requiresUserInspectionFromEvidence = codingResult.evidence.some(
    (entry) => entry.includes("user-inspection-required"),
  );
  const requiresUserInspection =
    seed?.requiresUserInspection ??
    (requiresUserInspectionFromEvidence ? true : undefined);
  if (
    writerStarted === undefined &&
    writeEffect === undefined &&
    requiresUserInspection === undefined
  ) {
    return undefined;
  }
  const target =
    seed?.target ??
    codingResult.failedFiles[0]?.path ??
    codingResult.unverifiedFiles[0]?.path ??
    codingResult.changeSet.attemptedFiles[0];
  return {
    ...(writerStarted !== undefined ? { writerStarted } : {}),
    ...(writeEffect ? { writeEffect } : {}),
    ...(requiresUserInspection !== undefined
      ? { requiresUserInspection }
      : {}),
    ...(target ? { target } : {}),
  };
}

export function buildStoppedSessionFailureHandoffDiagnostic(
  codingResult: CodingResultSummary | undefined,
  options: {
    readonly writeContinuity?: StoppedSessionWriteContinuity;
    readonly actionableFailure?: ActionableFailureContinuity;
  } = {},
): string | undefined {
  if (!codingResult) {
    return undefined;
  }
  const seed = codingResult.lastActionResultSeed;
  const status =
    seed?.verification?.status ?? codingResult.verification.status;
  const isFailureStatus = status === "failed" || status === "blocked";
  const failedFile = codingResult.failedFiles.find((entry) =>
    entry.reason.trim(),
  );
  const actionableFailure =
    options.actionableFailure ?? deriveActionableFailureContinuity(codingResult);
  const blockerKind =
    actionableFailure?.blockerKind ??
    seed?.verification?.blockerKind ??
    seed?.blockerKind ??
    codingResult.verification.blockerKind;
  if (!isFailureStatus && !failedFile && !blockerKind) {
    return undefined;
  }

  const command =
    seed?.verification?.command ?? codingResult.verification.command;
  const target =
    seed?.target ??
    failedFile?.path ??
    codingResult.changedFiles[0] ??
    codingResult.verifiedFiles[0] ??
    codingResult.unverifiedFiles[0]?.path;
  const reason =
    seed?.verification?.reason ??
    seed?.reason ??
    codingResult.verification.reason ??
    failedFile?.reason ??
    codingResult.taskSatisfaction.reasons[0] ??
    codingResult.failureBoundary;
  const nextFocus =
    actionableFailure?.nextAction ??
    codingResult.verification.nextAction ??
    (status === "blocked"
      ? "resolve the blocker and rerun the intended verification"
      : "inspect the failure and rerun verification");
  const parts = [`Failure handoff: status=${status ?? "failed"}`];
  const discoverySummary = extractDiscoveryEditContinuationSummary(codingResult);
  const targetSetSummary = extractTargetSetEditContinuationSummary(codingResult);
  const editRecoverySummary = extractEditRecoveryApplyContinuationSummary(codingResult);
  if (target) {
    parts.push(`target=${target}`);
  }
  if (command) {
    parts.push(`command=${command}`);
  }
  if (reason) {
    parts.push(`reason=${compactText(reason, 140)}`);
  }
  if (blockerKind) {
    parts.push(`blocker=${blockerKind}`);
  }
  const writeContinuity =
    options.writeContinuity ?? buildStoppedSessionWriteContinuity(codingResult);
  if (writeContinuity?.writerStarted) {
    parts.push("writer-started=yes");
  }
  if (writeContinuity?.writeEffect) {
    parts.push(`write-effect=${writeContinuity.writeEffect}`);
  }
  if (writeContinuity?.requiresUserInspection) {
    parts.push("requires-user-inspection=yes");
  }
  if (codingResult.recoverySurface?.explicitRestoreAvailable) {
    parts.push("restore-preview=available");
  }
  if (codingResult.recoverySurface) {
    parts.push("automatic-rollback=no");
  }
  if (discoverySummary) {
    parts.push(discoverySummary);
  }
  if (targetSetSummary) {
    parts.push(targetSetSummary);
  }
  if (editRecoverySummary) {
    parts.push(editRecoverySummary);
  }
  parts.push(`next=${compactText(nextFocus, 140).replace(/[.]+$/, "")}`);
  return `${parts.join("; ")}.`;
}

function classifyStoppedSessionContinuityKind(
  codingResult: CodingResultSummary,
  input: {
    readonly writeContinuity?: StoppedSessionWriteContinuity;
    readonly actionableFailure?: ActionableFailureContinuity;
  },
): StoppedSessionContinuityKind | undefined {
  if (input.writeContinuity?.writerStarted) {
    if (input.writeContinuity.writeEffect === "unknown") {
      return "writer-started-unknown";
    }
    if (input.writeContinuity.writeEffect === "unverified") {
      return "writer-started-unverified";
    }
  }

  switch (input.actionableFailure?.blockerKind) {
    case "approval-denied":
    case "stale-read":
    case "patch-generation-failed":
    case "mcp-unavailable":
    case "verification-failed":
    case "partial-mutation-failed":
    case "unsupported-future-edit":
      return input.actionableFailure.blockerKind;
    default:
      break;
  }

  const lastToolExecution =
    codingResult.provenance?.toolExecutions?.[
      codingResult.provenance.toolExecutions.length - 1
    ];
  if (lastToolExecution && lastToolExecution.kind !== "executed-succeeded") {
    return "tool-execution-failed";
  }

  const status =
    codingResult.lastActionResultSeed?.verification?.status ??
    codingResult.verification.status;
  if (status === "blocked") {
    return "generic-stopped";
  }
  if (status === "failed") {
    return "generic-error";
  }
  return undefined;
}

function extractWriteEffectFromEvidence(
  evidence: readonly string[],
): CodingWriteEffect | undefined {
  for (const entry of evidence) {
    const value = entry.match(/write-effect:(none|unknown|unverified|verified)\b/)
      ?.[1];
    if (
      value === "none" ||
      value === "unknown" ||
      value === "unverified" ||
      value === "verified"
    ) {
      return value;
    }
  }
  return undefined;
}

function extractDiscoveryEditContinuationSummary(
  codingResult: CodingResultSummary,
): string | undefined {
  const summary = codingResult.continuation.evidence.find((entry) =>
    entry.startsWith("discovery-edit manifest="),
  );
  if (!summary) {
    return undefined;
  }
  return `discovery=${compactText(summary, 300)}`;
}

function extractTargetSetEditContinuationSummary(
  codingResult: CodingResultSummary,
): string | undefined {
  const summary = codingResult.continuation.evidence.find((entry) =>
    entry.startsWith("target-set-edit transaction="),
  ) ?? codingResult.continuation.evidence.find((entry) =>
    entry.startsWith("target-set-edit manifest="),
  );
  if (!summary) {
    return undefined;
  }
  return `target-set=${compactText(summary, 300)}`;
}

function extractEditRecoveryApplyContinuationSummary(
  codingResult: CodingResultSummary,
): string | undefined {
  const summary = codingResult.continuation.evidence.find((entry) =>
    entry.startsWith("edit-recovery-apply plan="),
  );
  if (!summary) {
    return undefined;
  }
  return `edit-recovery=${compactText(summary, 300)}`;
}

function compactText(input: string, max: number = 220): string {
  const normalized = input.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) {
    return normalized;
  }
  return `${normalized.slice(0, max)}...`;
}
