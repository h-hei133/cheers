import { projectArtifactClaimEvidence } from "../../../artifacts/workflow/model.js";
import type {
  AgentExecutionOutput,
  CodingResultSummary,
} from "../../../result/types.js";
import type { ToolActionKind } from "../../../tools/policy/strategy.js";
import {
  ensureQueryRuntimeObservationState,
  type QueryRuntimeState,
} from "./state.js";

/**
 * Runtime fact gathering for the query policy.
 *
 * These functions read the transcript and the observation state and derive the
 * facts a decision is made from: task kind, changed and unverified files, proof
 * gaps, artifact contracts, verification targets. They own no decision - the
 * policy in `./policy.js` decides, this module only reports.
 */

export function latestResult(transcript: readonly AgentExecutionOutput[]): CodingResultSummary | undefined {
  for (let index = transcript.length - 1; index >= 0; index -= 1) {
    const result = transcript[index]?.codingResult;
    if (result) return result;
  }
  return undefined;
}

export function taskKindFor(taskIntent: string, latestCodingResult: CodingResultSummary | undefined): string {
  if (
    latestCodingResult?.verification.status === "passed" &&
    includesAny(taskIntent, ["artifact", "report", "writeup"])
  ) {
    return "data-artifact";
  }
  if (latestCodingResult?.taskKind === "run-command" ||
    latestCodingResult?.verification.status === "failed" ||
    latestCodingResult?.repair.status === "failed" ||
    includesAny(taskIntent, ["debug", "repair", "failure"])) {
    return "debug-repair";
  }
  if (includesAny(taskIntent, ["artifact", "report", "writeup"])) {
    return "data-artifact";
  }
  if (includesAny(taskIntent, ["continue", "resume", "pending"])) {
    return "continuation";
  }
  if (writeIntentFor(taskIntent, "coding")) {
    return "coding";
  }
  if (latestCodingResult?.taskKind === "repo-explain" || includesAny(taskIntent, ["inspect", "search", "context"])) {
    return "workspace-understanding";
  }
  return "coding";
}

export function writeIntentFor(taskIntent: string, taskKind: string): boolean {
  if (taskKind === "workspace-understanding" || taskKind === "continuation") {
    return false;
  }
  return taskKind === "debug-repair" ||
    includesAny(taskIntent, [
      "add",
      "apply",
      "change",
      "edit",
      "fix",
      "implement",
      "modify",
      "patch",
      "repair",
      "update",
      "write",
    ]);
}

export function failureCategoriesFor(result: CodingResultSummary | undefined, taskIntent: string): readonly string[] {
  return uniqueStrings([
    ...(includesAny(taskIntent, ["missing context", "not enough context"]) ? ["missing context"] : []),
    ...(result?.diagnosis?.disposition === "insufficient-evidence" ? ["context insufficient"] : []),
    ...(result?.failedFiles.some((file) => file.reason.toLowerCase().includes("context")) ? ["missing context"] : []),
    ...(result?.verification.status === "failed" ? ["verification failed"] : []),
    ...(result?.verification.status === "blocked" ? ["verification blocked"] : []),
  ]);
}

export function pendingActionFor(
  state: QueryRuntimeState,
  result: CodingResultSummary | undefined,
): ToolActionKind | undefined {
  if (state.lastContinuationReason === "retryable-error") return "continue";
  if (Object.keys(state.pendingLifecycle.pendingTools).length > 0) return "continue";
  if (Object.keys(state.pendingLifecycle.pendingApprovals).length > 0) return "continue";
  const nextAction = compact(result?.verification.nextAction ?? "");
  if (nextAction.includes("artifact") || nextAction.includes("source receipt")) return "artifact";
  if (nextAction.includes("rerun") || nextAction.includes("verify")) return "verify";
  if (nextAction.includes("repair")) return "repair";
  if (nextAction.includes("inspect") || nextAction.includes("read")) return "read";
  return undefined;
}

export function continuationFactsFor(
  state: QueryRuntimeState,
  result: CodingResultSummary | undefined,
): readonly string[] {
  return uniqueStrings([
    ...(state.lastContinuationReason === "retryable-error" ? [`continuation reason: ${state.lastContinuationReason}`] : []),
    ...(Object.keys(state.pendingLifecycle.pendingTools).length > 0 ? ["pending tool lifecycle"] : []),
    ...(Object.keys(state.pendingLifecycle.pendingApprovals).length > 0 ? ["pending approval lifecycle"] : []),
    ...(result?.continuation.status === "failed-after-bounded-continuation"
      ? ["bounded continuation did not close proof"]
      : []),
  ]);
}

export function proofGapFor(
  state: QueryRuntimeState,
  result: CodingResultSummary | undefined,
  input: {
    readonly changedFiles: readonly string[];
    readonly failedFiles: readonly string[];
    readonly unverifiedFiles: readonly string[];
    readonly restoredProofGap: readonly string[];
    readonly continuationFacts: readonly string[];
    readonly pendingAction?: ToolActionKind;
    readonly taskKind: string;
  },
): readonly string[] {
  if (!result) {
    return uniqueStrings([
      ...input.restoredProofGap,
      ...(input.taskKind === "workspace-understanding" ? ["context evidence incomplete"] : []),
      ...(state.turn > state.config.maxTurns ? ["runtime budget exhausted"] : []),
    ]);
  }

  const requiredEvidence = result.taskSatisfaction.requiredEvidence ?? [];
  const observedEvidence = new Set(result.taskSatisfaction.observedEvidence ?? []);
  return uniqueStrings([
    ...input.restoredProofGap,
    ...requiredEvidence.filter((item) => !observedEvidence.has(item)).map((item) => `missing proof: ${item}`),
    ...(input.changedFiles.length > 0 && result.verification.status !== "passed"
      ? ["verification proof missing for changed files"]
      : []),
    ...input.failedFiles.map((path) => `verification failed for ${path}`),
    ...input.unverifiedFiles.map((path) => `verification proof missing for ${path}`),
    ...(result.repair.status === "failed" ? ["repair proof missing"] : []),
    ...(result.verification.status === "failed" ? ["verification failed"] : []),
    ...(result.verification.status === "blocked" ? ["verification blocked"] : []),
    ...(input.failedFiles.length > 0 ? ["context needed for failed files"] : []),
    ...(input.continuationFacts.length > 0 && input.pendingAction === "continue" ? ["pending continuation proof"] : []),
  ]);
}

export function artifactContractFor(
  taskKind: string,
  result: CodingResultSummary | undefined,
  observations: ReturnType<typeof ensureQueryRuntimeObservationState>,
): {
  readonly claims: readonly string[];
  readonly evidenceIds: readonly string[];
  readonly missingClaims: readonly string[];
} | undefined {
  if (taskKind !== "data-artifact") return undefined;
  const claims = uniqueStrings([
    ...observations.artifactClaims,
    ...(result?.taskSatisfaction.requiredEvidence ?? []),
    ...(observations.artifactClaims.length === 0 && !result?.taskSatisfaction.requiredEvidence.length
      ? ["artifact claim"]
      : []),
  ]);
  const projection = projectArtifactClaimEvidence({
    claims,
    evidence: uniqueStrings([
      ...observations.artifactClaimEvidence.flatMap((item) => item.evidenceId ? [item.evidenceId] : []),
      ...(result?.taskSatisfaction.observedEvidence ?? []),
    ]),
  });
  return {
    claims,
    evidenceIds: projection.evidenceIds,
    missingClaims: projection.missingClaims,
  };
}

export function workspaceFilesFor(input: {
  readonly changedFiles: readonly string[];
  readonly failedFiles: readonly string[];
  readonly unverifiedFiles: readonly string[];
  readonly verificationTargets: readonly string[];
  readonly latestCodingResult: CodingResultSummary | undefined;
  readonly observationPaths?: readonly string[];
  readonly requiredPaths?: readonly string[];
}): readonly { readonly path: string; readonly purpose: string }[] {
  const hasObservedContext = (input.observationPaths ?? []).length > 0;
  const paths = uniqueStrings([
    ...(hasObservedContext ? (input.requiredPaths ?? []) : []),
    ...input.changedFiles,
    ...input.failedFiles,
    ...input.unverifiedFiles,
    ...input.verificationTargets,
    ...(input.observationPaths ?? []),
    ...(input.latestCodingResult?.diagnosis?.candidateFiles ?? []),
    ...(input.latestCodingResult?.diagnosis?.evidenceFiles ?? []),
  ]);
  return paths.map((path) => ({
    path,
    purpose: purposeFor(path, input),
  }));
}

function purposeFor(
  path: string,
  input: {
    readonly changedFiles: readonly string[];
    readonly failedFiles: readonly string[];
    readonly unverifiedFiles: readonly string[];
    readonly verificationTargets: readonly string[];
  },
): string {
  if (input.changedFiles.includes(path)) return "changed source target";
  if (input.failedFiles.includes(path)) return "failed source target";
  if (input.unverifiedFiles.includes(path)) return "verification target";
  if (input.verificationTargets.includes(path)) return "verification candidate";
  return "related source context";
}

export function isVerificationPath(path: string): boolean {
  const normalized = path.toLowerCase();
  return /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(normalized) ||
    normalized.includes("/test/") ||
    normalized.includes("/tests/");
}

export function requiredPathsFor(
  taskKind: string,
  changedFiles: readonly string[],
  failedFiles: readonly string[],
  taskIntent: string,
  observedContextPaths: readonly string[],
): readonly string[] {
  if (failedFiles.length > 0) return failedFiles;
  if (changedFiles.length > 0) return changedFiles;
  const observedOwnerPaths = observedContextPaths.filter((path) => path.toLowerCase().includes("owner"));
  if (
    taskKind === "workspace-understanding" &&
    observedOwnerPaths.length > 0 &&
    includesAny(taskIntent, ["missing context"])
  ) {
    return observedOwnerPaths;
  }
  const pathMatch = taskIntent.match(/(?:^|\s)([\w./-]+\.(?:ts|tsx|js|json|md|txt))(?:\s|$)/);
  if (pathMatch?.[1]) return [pathMatch[1]];
  if (taskKind === "workspace-understanding" && observedContextPaths.length > 0) {
    return observedContextPaths;
  }
  return taskKind === "workspace-understanding" && includesAny(taskIntent, ["missing context"])
    ? ["missing-context"]
    : [];
}

export function failureHistoryFor(
  transcript: readonly AgentExecutionOutput[],
  taskIntent: string,
): readonly { readonly action: ToolActionKind; readonly signature: string; readonly reason: string }[] {
  return transcript.flatMap((output) => {
    const result = output.codingResult;
    if (!result) return [];
    const entries: { action: ToolActionKind; signature: string; reason: string }[] = [];
    if (result.repair.status === "failed") {
      entries.push({
        action: "repair",
        signature: taskIntent,
        reason: result.repair.notes[0] ?? "repair failed",
      });
    }
    if (result.verification.status === "failed" || result.verification.status === "blocked") {
      entries.push({
        action: "verify",
        signature: taskIntent,
        reason: result.verification.reason ?? result.verification.status,
      });
    }
    return entries;
  });
}

export function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 180);
}
export function includesAny(value: string, needles: readonly string[]): boolean {
  const normalized = value.toLowerCase();
  return needles.some((needle) => normalized.includes(needle));
}

export function uniqueStrings(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.map(compact).filter(Boolean))]);
}
