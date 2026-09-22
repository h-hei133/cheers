import { projectArtifactClaimEvidence } from "../../../artifacts/workflow/model.js";
import { sourceFactsForTargets } from "../../../context/acquisition/code/source.js";
import { selectContext } from "../../../context/selection/model.js";
import { buildExecutionPlan } from "../../../planning/execution/model.js";
import { buildTaskRequestPacket } from "../../../provider/request/packet.js";
import { classifyRepairHypothesis } from "../../../repair/flow/hypothesis.js";
import type {
  AgentExecutionOutput,
  CodingResultSummary,
} from "../../../result/types.js";
import {
  chooseToolStrategy,
  type ToolActionKind,
  type ToolStrategy,
} from "../../../tools/policy/strategy.js";
import { harnessObservationPatch } from "./harness.js";
import type { QueryRuntimeActionDecision } from "./decision.js";
import { ensureQueryRuntimeHarnessState, ensureQueryRuntimeObservationState, type QueryRuntimeState } from "./state.js";
import {
  artifactContractFor,
  continuationFactsFor,
  failureCategoriesFor,
  failureHistoryFor,
  isVerificationPath,
  latestResult,
  pendingActionFor,
  proofGapFor,
  requiredPathsFor,
  taskKindFor,
  workspaceFilesFor,
  writeIntentFor,
  compact,
  includesAny,
  uniqueStrings,
} from "./facts.js";

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
  const repair = harness.pendingRepair[0];
  if (!repair) return undefined;
  const repairSourceFactIds = (repair.hypothesisState?.sourceFactIds.length ?? 0) > 0
    ? repair.hypothesisState?.sourceFactIds
    : repair.sourceFactIds;
  const sourceFacts = sourceFactsForTargets({
    facts: harness.sourceFacts,
    targetFiles: repair.targetFiles,
    sourceFactIds: repairSourceFactIds,
  });
  const sourceFactIds = sourceFacts.map((fact) => fact.factId);
  const hypothesis = !repair.hypothesisState && sourceFacts.length > 0
    ? classifyRepairHypothesis({
        failureClass: repair.failureClass,
        failureSummary: repair.failureSummary,
        targetFiles: repair.targetFiles,
        sourceFactIds,
      })
    : sourceFacts.length > 0 && (repair.hypothesisState?.sourceFactIds.length ?? 0) === 0
      ? classifyRepairHypothesis({
          failureClass: repair.failureClass,
          failureSummary: repair.failureSummary,
          targetFiles: repair.targetFiles,
          sourceFactIds,
        })
      : repair.hypothesisState;
  if (!hypothesis) return undefined;
  return Object.freeze({
    hypothesis,
    sourceFacts,
    blockedRepeat: sourceFacts.length === 0 && (repairSourceFactIds?.length ?? 0) > 0,
  });
}

function reasonFor(nextAction: ToolActionKind, proofGap: readonly string[]): string {
  if (nextAction === "stop-not-proven") return "no safe action remains for the current proof gap";
  if (proofGap.length > 0) return proofGap[0] ?? "proof gap remains";
  return "runtime policy selected next action";
}

