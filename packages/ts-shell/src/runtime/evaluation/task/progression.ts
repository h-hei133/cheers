import type { TaskLiveRunObservation, TaskLiveEntry, TaskLiveRunEntryResult } from "./liveRun.js";
import type { TaskCaseResult, TaskOutcome, TaskVerificationStatus } from "./model.js";

export type TaskProgressionMode = "deterministic" | "live";

export type TaskProgressionModelSource =
  | "deterministic-evaluation"
  | "explicit-live-gate"
  | "not-run";

export type TaskProgressionStageName =
  | "goal"
  | "state"
  | "context"
  | "plan"
  | "request"
  | "provider-turn"
  | "action"
  | "observation"
  | "verification"
  | "repair"
  | "proof"
  | "verdict";

export type TaskProgressionStageStatus =
  | "ready"
  | "passed"
  | "partial"
  | "failed"
  | "blocked"
  | "skipped"
  | "unsupported"
  | "manual-review-required"
  | "not-run"
  | "not-proven";

export interface TaskProgressionStage {
  readonly stage: TaskProgressionStageName;
  readonly owner: string;
  readonly status: TaskProgressionStageStatus;
  readonly evidence: readonly string[];
  readonly terminalSuccessClaim: false;
}

export interface TaskProgression {
  readonly mode: TaskProgressionMode;
  readonly modelSource: TaskProgressionModelSource;
  readonly stages: readonly TaskProgressionStage[];
  readonly completeProof: boolean;
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export function projectCaseProgression(result: Omit<TaskCaseResult, "progression">): TaskProgression {
  const completeProof = result.taskVerdict.completeProof === true;
  return freeze({
    mode: "deterministic",
    modelSource: "deterministic-evaluation",
    stages: freeze([
      stage("goal", "runtime/evaluation/task", statusFromOutcome(result.beforeOutcome), [
        result.caseId,
        result.taskKind,
        result.taskPath,
      ]),
      stage("state", "runtime/evaluation/task", statusFromOutcome(result.outcome), [
        `before:${result.beforeOutcome}`,
        `after:${result.outcome}`,
      ]),
      stage("context", "context/selection", statusFromState(result.contextSelection.state), [
        `selected:${result.contextSelection.selectedPaths.length}`,
        `refreshed:${result.contextSelection.refreshed}`,
      ]),
      stage("plan", "planning/execution", statusFromState(result.executionPlan.state), [
        `steps:${result.executionPlan.steps.length}`,
      ]),
      stage("request", "provider/request", statusFromState(result.requestPacket.state), [
        `contextPaths:${result.requestPacket.contextPaths.length}`,
        `planSteps:${result.requestPacket.planSteps.length}`,
      ]),
      stage("provider-turn", "runtime/evaluation", statusFromHost(result.hostEvaluation.observedStatus), [
        result.hostEvaluation.scenarioId,
        result.hostEvaluation.observedEvidenceVerdict,
      ]),
      stage("action", "tools/policy", statusFromState(result.toolStrategy.state), [
        `actions:${result.toolStrategy.actions.length}`,
      ]),
      stage("observation", "runtime/evaluation/task", statusFromVerification(result.observedVerification.status), [
        result.observedVerification.evidenceVerdict,
      ]),
      stage("verification", "verification/execution", statusFromState(result.verificationExecution.state), [
        `eligible:${result.verificationExecution.evidenceInputEligible}`,
      ]),
      stage("repair", "repair/loop", result.repairAction.attempted ? statusFromState(result.repairAction.postValidation) : "not-run", [
        `attempted:${result.repairAction.attempted}`,
        `originalFailurePreserved:${result.repairAction.originalFailurePreserved}`,
      ]),
      stage("proof", "evidence/task", completeProof ? "passed" : statusFromState(result.taskProof.status), [
        `missing:${result.taskProof.missingProof.length}`,
      ]),
      stage("verdict", "result/task", completeProof ? "passed" : "not-proven", [
        result.taskVerdict.verdictId,
      ]),
    ]),
    completeProof,
    terminalSuccessClaim: false,
    notProvenClaims: freeze(unique([
      "progression-is-not-task-success",
      "terminal-success",
      ...result.notProvenClaims,
    ])),
  });
}

export function projectLiveEntryProgression(input: {
  readonly entry: TaskLiveEntry;
  readonly result: Omit<TaskLiveRunEntryResult, "progression">;
  readonly observation?: TaskLiveRunObservation;
}): TaskProgression {
  const observation = input.observation;
  const result = input.result;
  const providerStatus = observation ? statusFromProviderOutcome(observation.providerOutcome) : "not-run";
  const completeProof = result.status === "complete" && result.proofStatus === "complete";
  return freeze({
    mode: "live",
    modelSource: observation ? "explicit-live-gate" : "not-run",
    stages: freeze([
      stage("goal", "runtime/evaluation/task", "ready", [
        input.entry.entryId,
        input.entry.entryKind,
        input.entry.writePolicy,
      ]),
      stage("state", "runtime/evaluation/task", statusFromState(result.status), [
        `executed:${result.executed}`,
        `defaultOff:${result.defaultOff}`,
      ]),
      stage("context", "context/selection", observation ? "ready" : "not-run", [
        input.entry.gate,
      ]),
      stage("plan", "planning/execution", statusFromState(result.safePlanStatus), [
        input.entry.validationPlan,
      ]),
      stage("request", "provider/request", observation ? "ready" : "not-run", [
        `providerAttempted:${result.providerAttempted}`,
      ]),
      stage("provider-turn", "provider/response", providerStatus, [
        `providerOutcome:${result.providerOutcome}`,
        `fallbackAttempted:${observation?.fallbackAttempted === true}`,
      ]),
      stage("action", actionOwner(input.entry), statusFromAction(result), [
        `patchIntent:${result.patchIntentStatus}`,
        `dryRunDiff:${result.dryRunDiffStatus}`,
        `apply:${result.applyStatus}`,
      ]),
      stage("observation", "runtime/evaluation/task", result.executed ? "passed" : statusFromState(result.status), [
        `changedFiles:${result.changedFiles.length}`,
        `noMutation:${result.noMutation}`,
        `noApply:${result.noApply}`,
      ]),
      stage("verification", "verification/execution", statusFromState(result.verificationStatus), [
        `postApply:${result.postApplyVerificationStatus}`,
      ]),
      stage("repair", "repair/loop", result.rollbackStatus === "not-run" ? "not-run" : statusFromState(result.rollbackStatus), [
        `rollback:${result.rollbackStatus}`,
      ]),
      stage("proof", "evidence/task", statusFromState(result.proofStatus), [
        `proofItems:${result.proofItems.length}`,
      ]),
      stage("verdict", "result/task", completeProof ? "passed" : "not-proven", [
        `status:${result.status}`,
      ]),
    ]),
    completeProof,
    terminalSuccessClaim: false,
    notProvenClaims: freeze(unique([
      "progression-is-not-task-success",
      "terminal-success",
      ...result.notProvenClaims,
    ])),
  });
}

function actionOwner(entry: TaskLiveEntry): string {
  if (entry.entryKind === "report-artifact" || entry.entryKind === "data-artifact") return "artifacts/workflow";
  if (
    entry.entryKind === "write-edit" ||
    entry.entryKind === "write-repair" ||
    entry.entryKind === "write-rollback" ||
    entry.entryKind === "write-planning"
  ) return "edit";
  return "tools/policy";
}

function statusFromAction(result: Omit<TaskLiveRunEntryResult, "progression">): TaskProgressionStageStatus {
  if (result.applyStatus === "applied") return "passed";
  if (result.dryRunDiffStatus === "produced") return "partial";
  if (result.executed) return "passed";
  return statusFromState(result.status);
}

function statusFromOutcome(outcome: TaskOutcome): TaskProgressionStageStatus {
  return statusFromState(outcome);
}

function statusFromVerification(status: TaskVerificationStatus): TaskProgressionStageStatus {
  return statusFromState(status);
}

function statusFromHost(status: string): TaskProgressionStageStatus {
  if (status === "complete" || status === "passed") return "passed";
  return statusFromState(status);
}

function statusFromProviderOutcome(status: string): TaskProgressionStageStatus {
  if (status === "passed") return "passed";
  if (status === "provider-network-inconclusive") return "blocked";
  if (status === "config-or-skip" || status === "skipped") return "skipped";
  return statusFromState(status);
}

function statusFromState(status: string): TaskProgressionStageStatus {
  if (
    status === "ready" ||
    status === "passed" ||
    status === "partial" ||
    status === "failed" ||
    status === "blocked" ||
    status === "skipped" ||
    status === "unsupported" ||
    status === "manual-review-required" ||
    status === "not-run" ||
    status === "not-proven"
  ) return status;
  if (status === "complete" || status === "complete-proof" || status === "validation-passed") return "passed";
  if (status === "useful-partial") return "partial";
  if (status === "missing" || status === "not-selected" || status === "not-needed") return "not-run";
  if (status === "unsafe" || status === "redaction-blocked" || status.endsWith("-unavailable")) return "blocked";
  return "not-proven";
}

function stage(
  stageName: TaskProgressionStageName,
  owner: string,
  status: TaskProgressionStageStatus,
  evidence: readonly string[],
): TaskProgressionStage {
  return freeze({
    stage: stageName,
    owner,
    status,
    evidence: freeze([...evidence]),
    terminalSuccessClaim: false,
  });
}

function unique<T extends string>(values: readonly T[]): readonly T[] {
  return Array.from(new Set(values));
}

function freeze<T>(value: T): Readonly<T> {
  return Object.freeze(value);
}
