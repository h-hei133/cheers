import type { CodingResultSummary } from "../../../orchestration/types.js";
import { projectRepairContinuationStrategy } from "../../../repair/iteration/projection.js";
import type { ToolActionKind } from "../../../tools/policy/strategy.js";
import { projectTaskStateVerificationPlan } from "../../../verification/command/plan.js";

export type QueryRuntimeTaskStateSource = "replay" | "compact";
export type QueryRuntimeTaskStateSafety = "safe" | "stale" | "unsafe";

export interface QueryRuntimeTaskStateRepairAttempt {
  readonly attempt: number;
  readonly signature: string;
  readonly reason: string;
  readonly changedFiles: readonly string[];
}

export interface QueryRuntimeTaskStateVerificationPlan {
  readonly command?: string;
  readonly targetFiles: readonly string[];
  readonly failedFiles: readonly string[];
  readonly status?: string;
  readonly nextAction?: string;
}

export interface QueryRuntimeTaskStateArtifactPendingState {
  readonly claims: readonly string[];
  readonly evidenceIds: readonly string[];
  readonly missingClaims: readonly string[];
}

export interface QueryRuntimeTaskStateContinuationSafety {
  readonly status: QueryRuntimeTaskStateSafety;
  readonly reasons: readonly string[];
}

export interface QueryRuntimeTaskState {
  readonly source: QueryRuntimeTaskStateSource;
  readonly pendingAction?: ToolActionKind;
  readonly proofGap: readonly string[];
  readonly changedFiles: readonly string[];
  readonly verifiedFiles: readonly string[];
  readonly unverifiedFiles: readonly string[];
  readonly failureCategories: readonly string[];
  readonly originalFailureClassification?: string;
  readonly repairAttempts: readonly QueryRuntimeTaskStateRepairAttempt[];
  readonly nextVerificationPlan: QueryRuntimeTaskStateVerificationPlan;
  readonly artifactPendingState: QueryRuntimeTaskStateArtifactPendingState;
  readonly continuationSafety: QueryRuntimeTaskStateContinuationSafety;
}

export interface QueryRuntimeTaskStateObservationPatch {
  readonly contextPaths: readonly string[];
  readonly changedFiles: readonly string[];
  readonly verificationTargets: readonly string[];
  readonly failedVerificationTargets: readonly string[];
  readonly restoredProofGap: readonly string[];
  readonly failureCategories: readonly string[];
  readonly repairAttempts: readonly {
    readonly action: ToolActionKind;
    readonly signature: string;
    readonly reason: string;
  }[];
  readonly toolFailures: readonly {
    readonly action: ToolActionKind;
    readonly signature: string;
    readonly reason: string;
  }[];
  readonly artifactClaims: readonly string[];
  readonly artifactClaimEvidence: readonly {
    readonly claim: string;
    readonly evidenceId?: string;
  }[];
  readonly continuationFacts: readonly string[];
  readonly pendingAction?: ToolActionKind;
}

export function projectQueryRuntimeTaskStateFromOutputs(input: {
  readonly source: QueryRuntimeTaskStateSource;
  readonly outputs: readonly { readonly codingResult?: CodingResultSummary }[];
  readonly continuationSafety: QueryRuntimeTaskStateContinuationSafety;
}): QueryRuntimeTaskState | undefined {
  const result = latestCodingResult(input.outputs);
  return result
    ? projectQueryRuntimeTaskStateFromResult({
        source: input.source,
        result,
        continuationSafety: input.continuationSafety,
      })
    : undefined;
}

export function projectQueryRuntimeTaskStateFromResult(input: {
  readonly source: QueryRuntimeTaskStateSource;
  readonly result: CodingResultSummary;
  readonly continuationSafety: QueryRuntimeTaskStateContinuationSafety;
}): QueryRuntimeTaskState {
  const result = input.result;
  const changedFiles = uniqueStrings([
    ...result.changedFiles,
    ...result.changeSet.changedFiles,
  ]);
  const failedFiles = result.failedFiles.map((file) => file.path);
  const unverifiedFiles = result.unverifiedFiles.map((file) => file.path);
  const nextVerificationPlan = projectTaskStateVerificationPlan(result);
  const originalFailureClassification =
    sanitizeOptional(result.verification.blockerKind) ??
    (result.verification.status === "failed" || result.verification.status === "blocked"
      ? result.verification.status
      : undefined);
  const proofGap = proofGapForResult(result, {
    changedFiles,
    failedFiles,
    unverifiedFiles,
  });
  const artifactClaims = uniqueStrings(result.taskSatisfaction.requiredEvidence ?? []);
  const observedEvidence = uniqueStrings(result.taskSatisfaction.observedEvidence ?? []);

  return Object.freeze({
    source: input.source,
    pendingAction: pendingActionForResult(result, proofGap),
    proofGap,
    changedFiles,
    verifiedFiles: uniqueStrings(result.verifiedFiles),
    unverifiedFiles,
    failureCategories: failureCategoriesForResult(result),
    originalFailureClassification,
    repairAttempts: repairAttemptsForResult(result, changedFiles, failedFiles),
    nextVerificationPlan,
    artifactPendingState: {
      claims: artifactClaims,
      evidenceIds: observedEvidence,
      missingClaims: artifactClaims.filter((claim) => !observedEvidence.includes(claim)),
    },
    continuationSafety: input.continuationSafety,
  });
}

export function decodeQueryRuntimeTaskState(value: unknown): QueryRuntimeTaskState | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const source = record.source === "replay" || record.source === "compact"
    ? record.source
    : undefined;
  if (!source) return undefined;
  const safetyRecord = objectRecord(record.continuationSafety);
  const safetyStatus = safetyRecord?.status === "safe" ||
    safetyRecord?.status === "stale" ||
    safetyRecord?.status === "unsafe"
    ? safetyRecord.status
    : "unsafe";
  const pendingAction = decodeAction(record.pendingAction);
  const verificationPlan = objectRecord(record.nextVerificationPlan);
  const artifact = objectRecord(record.artifactPendingState);
  return {
    source,
    ...(pendingAction ? { pendingAction } : {}),
    proofGap: stringList(record.proofGap),
    changedFiles: stringList(record.changedFiles),
    verifiedFiles: stringList(record.verifiedFiles),
    unverifiedFiles: stringList(record.unverifiedFiles),
    failureCategories: stringList(record.failureCategories),
    ...(sanitizeOptional(record.originalFailureClassification)
      ? { originalFailureClassification: sanitizeOptional(record.originalFailureClassification) }
      : {}),
    repairAttempts: arrayRecords(record.repairAttempts).map((attempt, index) => ({
      attempt: numberValue(attempt.attempt, index + 1),
      signature: sanitizeOptional(attempt.signature) ?? "repair",
      reason: sanitizeOptional(attempt.reason) ?? "repair attempt restored",
      changedFiles: stringList(attempt.changedFiles),
    })),
    nextVerificationPlan: {
      ...(sanitizeOptional(verificationPlan?.command)
        ? { command: sanitizeOptional(verificationPlan?.command) }
        : {}),
      targetFiles: stringList(verificationPlan?.targetFiles),
      failedFiles: stringList(verificationPlan?.failedFiles),
      ...(sanitizeOptional(verificationPlan?.status)
        ? { status: sanitizeOptional(verificationPlan?.status) }
        : {}),
      ...(sanitizeOptional(verificationPlan?.nextAction)
        ? { nextAction: sanitizeOptional(verificationPlan?.nextAction) }
        : {}),
    },
    artifactPendingState: {
      claims: stringList(artifact?.claims),
      evidenceIds: stringList(artifact?.evidenceIds),
      missingClaims: stringList(artifact?.missingClaims),
    },
    continuationSafety: {
      status: safetyStatus,
      reasons: stringList(safetyRecord?.reasons),
    },
  };
}

export function queryRuntimeTaskStateObservationPatch(
  taskState: QueryRuntimeTaskState,
): QueryRuntimeTaskStateObservationPatch {
  if (taskState.continuationSafety.status !== "safe") {
    return {
      contextPaths: [],
      changedFiles: [],
      verificationTargets: [],
      failedVerificationTargets: [],
      restoredProofGap: [],
      failureCategories: ["continuation state rejected"],
      repairAttempts: [],
      toolFailures: [{
        action: "continue",
        signature: taskState.source,
        reason: [
          "missing safe context for restored task state",
          ...taskState.continuationSafety.reasons,
        ].join(": "),
      }],
      artifactClaims: [],
      artifactClaimEvidence: [],
      continuationFacts: ["restored task state rejected"],
      pendingAction: undefined,
    };
  }

  const failedTargets = uniqueStrings([
    ...taskState.nextVerificationPlan.failedFiles,
    ...taskState.unverifiedFiles.filter(() =>
      taskState.failureCategories.some((category) => category.includes("verification"))
    ),
  ]);

  return {
    contextPaths: [],
    changedFiles: taskState.changedFiles,
    verificationTargets: uniqueStrings([
      ...taskState.nextVerificationPlan.targetFiles,
      ...taskState.changedFiles,
      ...taskState.verifiedFiles,
      ...taskState.unverifiedFiles,
    ]),
    failedVerificationTargets: failedTargets,
    restoredProofGap: taskState.proofGap,
    failureCategories: taskState.failureCategories,
    repairAttempts: taskState.repairAttempts.map((attempt) => ({
      action: "repair",
      signature: attempt.signature,
      reason: attempt.reason,
    })),
    toolFailures: taskState.originalFailureClassification || taskState.nextVerificationPlan.failedFiles.length
      ? [{
          action: "verify",
          signature: taskState.nextVerificationPlan.command ??
            taskState.nextVerificationPlan.failedFiles.join(",") ??
            taskState.source,
          reason: uniqueStrings([
            taskState.originalFailureClassification,
            ...taskState.failureCategories,
            ...taskState.proofGap,
          ]).join(": ") || "verification state restored",
        }]
      : [],
    artifactClaims: taskState.artifactPendingState.claims,
    artifactClaimEvidence: taskState.artifactPendingState.evidenceIds.map((evidenceId, index) => ({
      claim: taskState.artifactPendingState.claims[index] ?? evidenceId,
      evidenceId,
    })),
    continuationFacts: [
      `task state restored from ${taskState.source}`,
      ...taskState.continuationSafety.reasons,
    ],
    pendingAction: taskState.pendingAction,
  };
}

export function continuationSafetyForRuntimeState(input: {
  readonly source: QueryRuntimeTaskStateSource;
  readonly safe: boolean;
  readonly reasons?: readonly string[];
}): QueryRuntimeTaskStateContinuationSafety {
  return {
    status: input.safe ? "safe" : "stale",
    reasons: uniqueStrings(input.reasons ?? [
      input.safe ? `${input.source} facts passed safety checks` : `${input.source} facts rejected`,
    ]),
  };
}

function latestCodingResult(
  outputs: readonly { readonly codingResult?: CodingResultSummary }[],
): CodingResultSummary | undefined {
  for (let index = outputs.length - 1; index >= 0; index -= 1) {
    const result = outputs[index]?.codingResult;
    if (result) return result;
  }
  return undefined;
}

function proofGapForResult(
  result: CodingResultSummary,
  input: {
    readonly changedFiles: readonly string[];
    readonly failedFiles: readonly string[];
    readonly unverifiedFiles: readonly string[];
  },
): readonly string[] {
  const requiredEvidence = result.taskSatisfaction.requiredEvidence ?? [];
  const observedEvidence = new Set(result.taskSatisfaction.observedEvidence ?? []);
  return uniqueStrings([
    ...requiredEvidence.filter((item) => !observedEvidence.has(item)).map((item) => `missing proof: ${item}`),
    ...(input.changedFiles.length > 0 && result.verification.status !== "passed"
      ? ["verification proof missing for changed files"]
      : []),
    ...input.failedFiles.map((path) => `verification failed for ${path}`),
    ...input.unverifiedFiles.map((path) => `verification proof missing for ${path}`),
    ...(result.repair.status === "failed" ? ["repair proof missing"] : []),
    ...(result.verification.status === "failed" ? ["verification failed"] : []),
    ...(result.verification.status === "blocked" ? ["verification blocked"] : []),
  ]);
}

function failureCategoriesForResult(result: CodingResultSummary): readonly string[] {
  return uniqueStrings([
    ...(result.failedFiles.some((file) => file.reason.toLowerCase().includes("context")) ? ["missing context"] : []),
    ...(result.diagnosis?.disposition === "insufficient-evidence" ? ["context insufficient"] : []),
    ...(result.verification.status === "failed" ? ["verification failed"] : []),
    ...(result.verification.status === "blocked" ? ["verification blocked"] : []),
    ...(result.repair.status === "failed" ? ["repair failed"] : []),
    ...(result.verification.reason?.toLowerCase().includes("missing context")
      ? ["missing context"]
      : []),
  ]);
}

function pendingActionForResult(
  result: CodingResultSummary,
  proofGap: readonly string[],
): ToolActionKind | undefined {
  const nextAction = sanitizeString(result.verification.nextAction ?? "").toLowerCase();
  const strategy = projectRepairContinuationStrategy({
    failureOutput: result.verification.reason,
    priorAttemptReasons: result.repair.notes,
    changedFiles: result.repair.status === "recovered" ? result.changedFiles : [],
    verificationStatus: result.verification.status,
    contextQuality: failureCategoriesForResult(result).includes("missing context")
      ? "missing"
      : result.diagnosis?.disposition === "grounded-explanation"
        ? "sufficient"
        : "unknown",
  });
  if (strategy === "verify-after-repair") return "verify";
  if (strategy === "discover-missing-context" || strategy === "change-repair-strategy") return "search";
  if (strategy === "repair-from-failure") return "repair";
  if (nextAction.includes("discover") || nextAction.includes("inspect") || nextAction.includes("read")) return "search";
  if (nextAction.includes("repair")) return "repair";
  if (nextAction.includes("rerun") || nextAction.includes("verify") || nextAction.includes("test")) return "verify";
  if (result.repair.status === "recovered" && result.changedFiles.length > 0) return "verify";
  if (result.verification.status === "failed" && !proofGap.some((gap) => gap.includes("missing context"))) return "repair";
  if (result.verification.status === "failed" || result.verification.status === "blocked") return "search";
  if (result.continuation.status === "failed-after-bounded-continuation") return "continue";
  if (result.taskKind === "write-file" && proofGap.length > 0) return "artifact";
  return undefined;
}

function repairAttemptsForResult(
  result: CodingResultSummary,
  changedFiles: readonly string[],
  failedFiles: readonly string[],
): readonly QueryRuntimeTaskStateRepairAttempt[] {
  if (result.repair.attempts <= 0) return [];
  const reason = sanitizeString(
    result.repair.notes.join(" ") ||
    result.verification.reason ||
    result.repair.status,
  );
  return [{
    attempt: result.repair.attempts,
    signature: uniqueStrings([...changedFiles, ...failedFiles]).join(",") || "repair",
    reason,
    changedFiles,
  }];
}

function decodeAction(value: unknown): ToolActionKind | undefined {
  if (
    value === "read" ||
    value === "search" ||
    value === "edit" ||
    value === "verify" ||
    value === "repair" ||
    value === "artifact" ||
    value === "continue" ||
    value === "stop-not-proven"
  ) {
    return value;
  }
  return undefined;
}

function stringList(value: unknown): readonly string[] {
  return Array.isArray(value) ? uniqueStrings(value.map((item) => String(item))) : [];
}

function arrayRecords(value: unknown): readonly Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === "object" && !Array.isArray(item)
      )
    : [];
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : fallback;
}

function sanitizeOptional(value: unknown): string | undefined {
  const normalized = sanitizeString(String(value ?? ""));
  return normalized || undefined;
}

function sanitizeString(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 240);
}

function uniqueStrings(values: readonly (string | undefined)[]): readonly string[] {
  return [...new Set(values.map((value) => sanitizeString(value ?? "")).filter(Boolean))];
}
