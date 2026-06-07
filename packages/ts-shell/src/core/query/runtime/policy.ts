import { projectArtifactClaimEvidence } from "../../../artifacts/workflow/model.js";
import { sourceFactsForTargets } from "../../../context/acquisition/code/source.js";
import { selectContext } from "../../../context/selection/model.js";
import { buildExecutionPlan } from "../../../planning/execution/model.js";
import { buildTaskRequestPacket } from "../../../provider/request/packet.js";
import { classifyRepairHypothesis } from "../../../repair/flow/hypothesis.js";
import type {
  AgentExecutionOutput,
  CodingResultSummary,
} from "../../../orchestration/types.js";
import {
  chooseToolStrategy,
  type ToolActionKind,
  type ToolStrategy,
} from "../../../tools/policy/strategy.js";
import { harnessObservationPatch } from "./harness.js";
import type { QueryRuntimeActionDecision } from "./decision.js";
import { ensureQueryRuntimeHarnessState, ensureQueryRuntimeObservationState, type QueryRuntimeState } from "./state.js";

export function decideQueryRuntimeAction(state: QueryRuntimeState): QueryRuntimeActionDecision {
  const taskIntent = compact(state.config.initialPrompt);
  const latestCodingResult = latestResult(state.transcript);
  const observations = ensureQueryRuntimeObservationState(state);
  const harness = ensureQueryRuntimeHarnessState(state);
  const harnessPatch = harnessObservationPatch(harness);
  const taskKind = taskKindFor(taskIntent, latestCodingResult);
  const changedFiles = uniqueStrings([
    ...observations.changedFiles,
    ...(harnessPatch.changedFiles ?? []),
    ...(latestCodingResult?.changedFiles ?? []),
    ...(latestCodingResult?.changeSet.changedFiles ?? []),
  ]);
  const failedFiles = uniqueStrings([
    ...observations.failedVerificationTargets,
    ...(harnessPatch.failedVerificationTargets ?? []),
    ...(latestCodingResult?.failedFiles.map((file) => file.path) ?? []),
  ]);
  const unverifiedFiles = uniqueStrings([
    ...observations.failedVerificationTargets,
    ...(harnessPatch.failedVerificationTargets ?? []),
    ...(latestCodingResult?.unverifiedFiles.map((file) => file.path) ?? []),
  ]);
  const verificationTargets = uniqueStrings([
    ...(latestCodingResult?.diagnosis?.evidenceFiles.filter(isVerificationPath) ?? []),
    ...observations.verificationTargets,
    ...(harnessPatch.verificationTargets ?? []),
    ...changedFiles,
    ...unverifiedFiles,
    ...(latestCodingResult?.verifiedFiles ?? []),
  ]);
  const failureCategories = uniqueStrings([
    ...failureCategoriesFor(latestCodingResult, taskIntent),
    ...observations.failureCategories,
    ...(harnessPatch.failureCategories ?? []),
  ]);
  const pendingAction = harnessPatch.pendingAction ?? observations.pendingAction ?? pendingActionFor(state, latestCodingResult);
  const continuationFacts = uniqueStrings([
    ...observations.continuationFacts,
    ...continuationFactsFor(state, latestCodingResult),
  ]);
  const observedContextPaths = uniqueStrings([
    ...observations.contextPaths,
    ...(harnessPatch.contextPaths ?? []),
  ]);
  const requiredPaths = requiredPathsFor(taskKind, changedFiles, failedFiles, taskIntent, observedContextPaths);
  const proofGap = proofGapFor(state, latestCodingResult, {
    changedFiles,
    failedFiles,
    unverifiedFiles,
    restoredProofGap: observations.restoredProofGap,
    continuationFacts,
    pendingAction,
    taskKind,
  });
  const artifactContract = artifactContractFor(taskKind, latestCodingResult, observations);
  const context = selectContext({
    taskKind,
    taskPath: taskKind === "data-artifact" ? "artifact" : "runtime",
    shortPrompt: taskIntent,
    workspaceFiles: workspaceFilesFor({
      changedFiles,
      failedFiles,
      unverifiedFiles,
      verificationTargets,
      latestCodingResult,
      observationPaths: observedContextPaths,
      requiredPaths,
    }),
    requiredPaths,
    continuationAvailable: continuationFacts.length > 0,
    failureCategories,
    observedPaths: observedContextPaths,
  });
  const outputKind = taskKind === "data-artifact"
    ? "artifact"
    : changedFiles.length > 0 || writeIntentFor(taskIntent, taskKind)
      ? "diff"
      : "verified-result";
  const allowedTools = ["read", "search", "edit", "repair", "verify", "artifact", "continue", "write"];
  const plan = buildExecutionPlan({
    taskKind,
    outputKind,
    allowedTools,
    allowedWrites: changedFiles,
    successRubric: latestCodingResult?.taskSatisfaction.requiredEvidence ?? ["task-relevant proof"],
    context,
    observedGaps: proofGap,
  });
  const request = buildTaskRequestPacket({
    shortPrompt: taskIntent,
    taskKind,
    context,
    plan,
  });
  const strategy = chooseToolStrategy({
    allowedTools,
    plan,
    request,
    proofGap: uniqueStrings([...context.proofGap, ...proofGap]),
    changedFiles,
    observedContextPaths,
    completedActions: observations.completedActions,
    taskIntent,
    pendingAction,
    continuationFacts,
    artifactContract,
    observationFailures: [...observations.toolFailures, ...(harnessPatch.toolFailures ?? [])],
    repairAttempts: [...observations.repairAttempts, ...(harnessPatch.repairAttempts ?? [])],
    failureHistory: [
      ...failureHistoryFor(state.transcript, taskIntent),
      ...observations.toolFailures,
      ...observations.repairAttempts,
    ],
    budget: { remainingSteps: Math.max(0, state.config.maxTurns - state.turn + 1) },
  });

  return decisionFromStrategy(strategy, {
    harness,
    changedFiles,
    selectedPaths: context.selectedPaths,
    ownerPaths: context.ownerPaths,
    verificationTargets,
    taskIntent,
    taskKind,
    outputKind,
    contextState: context.state,
    planState: plan.state,
    requestState: request.state,
    toolStrategyState: strategy.state,
    pendingAction,
    artifactRequired: Boolean(artifactContract),
  });
}

export function hasOpenRuntimeProofGap(output: AgentExecutionOutput): boolean {
  const result = output.codingResult;
  if (!result) return false;
  if (result.taskSatisfaction.verdict !== "satisfied") return true;
  if (result.changedFiles.length > 0 && result.verification.status !== "passed") return true;
  if (result.unverifiedFiles.length > 0) return true;
  if (result.failedFiles.length > 0) return true;
  if (result.repair.status === "failed") return true;
  return false;
}

function decisionFromStrategy(
  strategy: ToolStrategy,
  input: {
    readonly harness: ReturnType<typeof ensureQueryRuntimeHarnessState>;
    readonly changedFiles: readonly string[];
    readonly selectedPaths: readonly string[];
    readonly ownerPaths: readonly string[];
    readonly verificationTargets: readonly string[];
    readonly taskIntent: string;
    readonly taskKind: string;
    readonly outputKind: string;
    readonly contextState: string;
    readonly planState: string;
    readonly requestState: string;
    readonly toolStrategyState: string;
    readonly pendingAction?: ToolActionKind;
    readonly artifactRequired: boolean;
  },
): QueryRuntimeActionDecision {
  const selectedAction = strategy.nextAction ?? "stop-not-proven";
  const repairPlan = selectedAction === "repair" ? repairPlanFor(input.harness) : undefined;
  const nextAction = repairPlan?.blockedRepeat ? "stop-not-proven" : selectedAction;
  return Object.freeze({
    nextAction,
    actions: strategy.actions,
    proofGap: repairPlan?.blockedRepeat
      ? uniqueStrings([...(strategy.proofGap ?? []), "repair source facts missing"])
      : strategy.proofGap ?? [],
    changedFiles: input.changedFiles,
    selectedPaths: input.selectedPaths,
    ownerPaths: input.ownerPaths,
    verificationTargets: input.verificationTargets,
    taskIntent: input.taskIntent,
    taskKind: input.taskKind,
    outputKind: input.outputKind,
    contextState: input.contextState,
    planState: input.planState,
    requestState: input.requestState,
    toolStrategyState: input.toolStrategyState,
    pendingAction: input.pendingAction,
    ...(repairPlan && !repairPlan.blockedRepeat ? { repairPlan } : {}),
    artifactRequired: input.artifactRequired,
    reason: reasonFor(nextAction, strategy.proofGap ?? []),
    terminalSuccessClaim: false as const,
  });
}

function repairPlanFor(
  harness: ReturnType<typeof ensureQueryRuntimeHarnessState>,
): QueryRuntimeActionDecision["repairPlan"] | undefined {
  const repair = harness.pendingRepair.find((item) => item.hypothesisState);
  if (!repair?.hypothesisState) return undefined;
  const sourceFacts = sourceFactsForTargets({
    facts: harness.sourceFacts,
    targetFiles: repair.targetFiles,
    sourceFactIds: repair.hypothesisState.sourceFactIds,
  });
  const hypothesis = sourceFacts.length > 0 && repair.hypothesisState.sourceFactIds.length === 0
    ? classifyRepairHypothesis({
        failureClass: repair.failureClass,
        failureSummary: repair.failureSummary,
        targetFiles: repair.targetFiles,
        sourceFactIds: sourceFacts.map((fact) => fact.factId),
      })
    : repair.hypothesisState;
  return Object.freeze({
    hypothesis,
    sourceFacts,
    blockedRepeat: sourceFacts.length === 0 && repair.hypothesisState.sourceFactIds.length > 0,
  });
}

function latestResult(transcript: readonly AgentExecutionOutput[]): CodingResultSummary | undefined {
  for (let index = transcript.length - 1; index >= 0; index -= 1) {
    const result = transcript[index]?.codingResult;
    if (result) return result;
  }
  return undefined;
}

function taskKindFor(taskIntent: string, latestCodingResult: CodingResultSummary | undefined): string {
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

function writeIntentFor(taskIntent: string, taskKind: string): boolean {
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

function failureCategoriesFor(result: CodingResultSummary | undefined, taskIntent: string): readonly string[] {
  return uniqueStrings([
    ...(includesAny(taskIntent, ["missing context", "not enough context"]) ? ["missing context"] : []),
    ...(result?.diagnosis?.disposition === "insufficient-evidence" ? ["context insufficient"] : []),
    ...(result?.failedFiles.some((file) => file.reason.toLowerCase().includes("context")) ? ["missing context"] : []),
    ...(result?.verification.status === "failed" ? ["verification failed"] : []),
    ...(result?.verification.status === "blocked" ? ["verification blocked"] : []),
  ]);
}

function pendingActionFor(
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

function continuationFactsFor(
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

function proofGapFor(
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

function artifactContractFor(
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

function workspaceFilesFor(input: {
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

function isVerificationPath(path: string): boolean {
  const normalized = path.toLowerCase();
  return /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(normalized) ||
    normalized.includes("/test/") ||
    normalized.includes("/tests/");
}

function requiredPathsFor(
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

function failureHistoryFor(
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

function reasonFor(nextAction: ToolActionKind, proofGap: readonly string[]): string {
  if (nextAction === "stop-not-proven") return "no safe action remains for the current proof gap";
  if (proofGap.length > 0) return proofGap[0] ?? "proof gap remains";
  return "runtime policy selected next action";
}

function includesAny(value: string, needles: readonly string[]): boolean {
  const normalized = value.toLowerCase();
  return needles.some((needle) => normalized.includes(needle));
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.map(compact).filter(Boolean))]);
}

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 180);
}
