import type { TaskVerdict } from "../../../result/task/verdict.js";
import type { ContextSelection } from "../../../context/selection/model.js";
import type { VerificationExecution } from "../../../verification/execution/model.js";
import type { EvaluationCaseResult } from "../model.js";
import type { VerificationSelection } from "../../../verification/selection/model.js";
import type { ArtifactCorrection, ArtifactReceipt } from "../../../artifacts/workflow/types.js";
import type { RepairAction, RepairDecision } from "../../../repair/loop/model.js";
import type {
  TaskAssessmentResult,
  TaskBlockerSummary,
  TaskCaseDefinition,
  TaskCaseId,
  TaskCaseResult,
  TaskFailureCategory,
  TaskHostEvaluationSummary,
  TaskLiveExecution,
  TaskLiveExecutionStatus,
  TaskLiveGateObservation,
  TaskLiveReadiness,
  TaskOutcome,
  TaskVerificationStatus,
} from "./types.js";


/**
 * Live execution projection and host evaluation summary.
 *
 * Projects a completed (or not-run) task result into the live execution shape,
 * the host evaluation summary, and the triage view the report renders.
 */

export function projectTaskLiveExecution(input: {
  readonly result: TaskCaseResult;
  readonly observation?: TaskLiveGateObservation;
}): TaskLiveExecution {
  const readiness = input.result.liveReadiness;
  const observation = input.observation;
  if (!observation) {
    return freeze({
      caseId: input.result.caseId,
      gate: readiness.gate,
      status: liveNotRunStatus(readiness),
      executed: false,
      providerAttempted: false,
      providerOutcome: "not-run",
      noMutation: input.result.allowedWrites.length === 0,
      changedFiles: freeze([]),
      noApply: true,
      redactionStatus: "not-run",
      verificationStatus: "not-run",
      artifactValidationStatus: "not-run",
      proofStatus: "missing",
      blockers: freeze(liveNotRunBlockers(readiness)),
      proofItems: freeze([]),
      notProvenClaims: freeze([
        "live-task-not-executed",
        "terminal-success",
      ]),
      defaultOff: true,
      optInRequired: true,
      terminalSuccessClaim: false,
    });
  }

  const blockers = liveExecutionBlockers(input.result, observation);
  const executed = blockers.length === 0 && observation.explicitOptIn === true;
  const proofItems = liveExecutionProofItems(input.result, observation, executed);
  return freeze({
    caseId: input.result.caseId,
    gate: readiness.gate,
    status: liveExecutionStatus(input.result, observation, blockers, proofItems),
    executed,
    providerAttempted: observation.providerAttempted,
    providerOutcome: observation.providerOutcome,
    noMutation: observation.noMutation,
    changedFiles: freeze([...observation.changedFiles]),
    noApply: observation.noApply,
    redactionStatus: observation.redactionStatus,
    verificationStatus: observation.verificationStatus,
    artifactValidationStatus: observation.artifactValidationStatus ?? "not-run",
    proofStatus: proofItems.length > 0
      ? (input.result.taskVerdict.completeProof ? "complete" : "partial")
      : "missing",
    blockers: freeze(blockers),
    proofItems: freeze(proofItems),
    notProvenClaims: freeze(unique([
      "provider-call-is-not-task-success",
      "live-gate-pass-is-not-task-success",
      "host-output-is-not-task-success",
      "terminal-success",
      ...(input.result.taskVerdict.completeProof ? [] : input.result.taskVerdict.notProvenClaims),
    ])),
    defaultOff: true,
    optInRequired: true,
    terminalSuccessClaim: false,
  });
}

function liveNotRunStatus(readiness: TaskLiveReadiness): TaskLiveExecutionStatus {
  if (readiness.status === "unsupported") return "unsupported";
  if (readiness.status === "unsafe") return "unsafe";
  if (readiness.status === "manual-review-required") return "manual-review-required";
  if (readiness.blockers.includes("missing provider config")) return "provider-readiness-missing";
  if (readiness.blockers.includes("missing auth readiness")) return "auth-readiness-missing";
  if (readiness.blockers.includes("verification unavailable")) return "verification-unavailable";
  if (readiness.blockers.includes("artifact validation unavailable")) return "artifact-validation-unavailable";
  if (readiness.blockers.includes("provider output insufficient")) return "provider-output-insufficient";
  if (readiness.blockers.includes("redaction blocked")) return "redaction-blocked";
  if (readiness.blockers.length > 0) return "blocked";
  return "not-run";
}

function liveNotRunBlockers(readiness: TaskLiveReadiness): readonly string[] {
  if (readiness.blockers.length > 0) {
    return readiness.blockers;
  }
  if (readiness.status === "ready") {
    return [`explicit opt-in gate not executed: ${readiness.gate}`];
  }
  return readiness.hardBlocker ? [readiness.hardBlocker] : ["live execution not run"];
}

function liveExecutionBlockers(
  result: TaskCaseResult,
  observation: TaskLiveGateObservation,
): readonly string[] {
  const blockers: string[] = [];
  if (observation.gate !== result.liveReadiness.gate) {
    blockers.push("gate mismatch");
  }
  if (result.liveReadiness.status === "unsupported") {
    blockers.push("unsupported task path");
  }
  if (result.liveReadiness.status === "unsafe") {
    blockers.push("write safety gate missing for live task execution");
  }
  if (observation.redactionStatus !== "passed") {
    blockers.push("redaction blocked");
  }
  if (!observation.noMutation || observation.changedFiles.length > 0) {
    blockers.push("no-mutation check failed");
  }
  if (!observation.noApply) {
    blockers.push("no-apply check failed");
  }
  if (observation.providerOutcome === "provider-network-inconclusive") {
    blockers.push(observation.fallbackConfigured === false
      ? "provider network inconclusive and no configured fallback provider"
      : "provider network inconclusive");
  }
  if (observation.providerOutcome === "config-or-skip") {
    blockers.push("provider config or opt-in gate missing");
  }
  if (observation.providerOutcome === "failed") {
    blockers.push("provider or product execution failed");
  }
  if (observation.providerOutcome === "skipped") {
    blockers.push("explicit opt-in gate skipped");
  }
  if (
    result.taskPath === "artifact" &&
    observation.artifactValidationStatus !== "passed"
  ) {
    blockers.push("artifact validation unavailable");
  }
  return unique(blockers);
}

function liveExecutionProofItems(
  result: TaskCaseResult,
  observation: TaskLiveGateObservation,
  executed: boolean,
): readonly string[] {
  if (!executed) return [];
  const items = [
    "explicit-opt-in-gate",
    "redaction-check",
    "no-mutation-check",
  ];
  if (observation.providerAttempted) {
    items.push("provider-attempt");
  }
  if (observation.noApply) {
    items.push("no-apply-check");
  }
  if (observation.verificationStatus === "passed" || observation.verificationStatus === "partial") {
    items.push("verification-check");
  }
  if (observation.artifactValidationStatus === "passed") {
    items.push("artifact-validation");
  }
  if (result.taskVerdict.completeProof) {
    items.push("task-proof");
  }
  return unique(items);
}

function liveExecutionStatus(
  result: TaskCaseResult,
  observation: TaskLiveGateObservation,
  blockers: readonly string[],
  proofItems: readonly string[],
): TaskLiveExecutionStatus {
  if (blockers.includes("unsupported task path")) return "unsupported";
  if (blockers.includes("write safety gate missing for live task execution")) return "unsafe";
  if (blockers.includes("redaction blocked")) return "redaction-blocked";
  if (blockers.includes("artifact validation unavailable")) return "artifact-validation-unavailable";
  if (blockers.includes("provider config or opt-in gate missing")) return "provider-readiness-missing";
  if (blockers.includes("explicit opt-in gate skipped")) return "skipped";
  if (blockers.length > 0 && observation.providerOutcome === "provider-network-inconclusive") return "blocked";
  if (blockers.length > 0) return "failed";
  if (result.taskVerdict.completeProof && proofItems.includes("task-proof")) {
    return result.taskPath === "artifact" && observation.artifactValidationStatus !== "passed"
      ? "useful-partial"
      : "complete";
  }
  return proofItems.length > 0 ? "useful-partial" : "provider-output-insufficient";
}

export function measuredFailureCategories(
  definition: TaskCaseDefinition,
  verificationSelection: VerificationSelection,
  artifactReceipt: ArtifactReceipt | undefined,
  artifactCorrection: ArtifactCorrection | undefined,
  repairDecision: RepairDecision,
  repairAction: RepairAction,
  contextSelection: ContextSelection,
  verificationExecution: VerificationExecution,
): readonly TaskFailureCategory[] {
  const categories: TaskFailureCategory[] = [];
  if (contextSelection.state === "blocked") {
    categories.push("context insufficient");
  }
  if (verificationSelection.state === "not-selected") {
    categories.push("verification not selected");
  }
  if (verificationExecution.state === "failed") {
    categories.push("verification failed");
  }
  if (
    artifactCorrection?.validationState !== "validation-passed" &&
    (artifactReceipt?.validationState === "invalid" ||
    artifactReceipt?.validationState === "validation-failed" ||
    artifactReceipt?.validationState === "source-missing" ||
    artifactReceipt?.validationState === "unsafe-path")
  ) {
    categories.push("artifact invalid");
  }
  if (
    artifactCorrection?.validationState !== "validation-passed" &&
    repairAction.postValidation !== "passed" &&
    (
      repairDecision.state === "failed" ||
      repairDecision.state === "post-validation-failed" ||
      repairDecision.state === "retry-exhausted"
    )
  ) {
    categories.push("repair failed");
  }
  if (
    (verificationExecution.state === "partial" || verificationExecution.state === "passed") &&
    definition.expectedOutcome !== "skipped" &&
    definition.expectedOutcome !== "unsupported"
  ) {
    categories.push("completion proof missing");
  }
  for (const category of definition.failureCategories) {
    if (
      category !== "context insufficient" &&
      category !== "verification not selected" &&
      category !== "verification failed" &&
      category !== "artifact invalid" &&
      category !== "repair failed" &&
      category !== "completion proof missing" &&
      category !== "authority missing" &&
      category !== "continuation stale"
    ) {
      categories.push(category);
    }
  }
  return freeze(unique(categories));
}

export function projectHostEvaluationSummary(result: EvaluationCaseResult): TaskHostEvaluationSummary {
  return freeze({
    scenarioId: result.scenarioId,
    status: result.status,
    observedStatus: result.observedStatus,
    observedEvidenceVerdict: result.observedEvidenceVerdict,
    eventCount: result.eventCount,
    eventCategories: result.eventCategories,
    blockerCodes: result.blockers.map((blocker) => blocker.code),
    blockers: result.blockers.map((blocker) => ({ code: blocker.code })),
    redactionChecks: result.redactionChecks,
    terminalSuccessClaim: false,
    notProvenClaims: result.notProvenClaims,
  });
}

export function classifyOutcome(
  definition: TaskCaseDefinition,
  hostEvaluation: TaskHostEvaluationSummary,
  verificationStatus: TaskVerificationStatus,
  verificationSelection: VerificationSelection,
  artifactReceipt: ArtifactReceipt | undefined,
  repairDecision: RepairDecision,
  contextSelection: ContextSelection,
  verificationExecution: VerificationExecution,
  taskVerdict: TaskVerdict,
): TaskOutcome {
  if (hostEvaluation.status === "skipped" || definition.expectedOutcome === "skipped") {
    return "skipped";
  }
  if (hostEvaluation.status === "unsupported" || definition.expectedOutcome === "unsupported") {
    return "unsupported";
  }
  if (taskVerdict.completeProof) {
    return "complete";
  }
  if (hostEvaluation.status === "blocked" || verificationStatus === "blocked") {
    return contextSelection.state === "ready" && verificationExecution.state !== "blocked" ? "partial" : "blocked";
  }
  if (verificationExecution.state === "passed" || verificationExecution.state === "partial") {
    return taskVerdict.completeProof
      ? "complete"
      : "partial";
  }
  if (verificationStatus === "failed") {
    return "failed";
  }
  if (artifactReceipt?.validationState === "validation-failed" || artifactReceipt?.validationState === "invalid") {
    return "failed";
  }
  if (repairDecision.state === "failed" || repairDecision.state === "post-validation-failed") {
    return "failed";
  }
  if (verificationStatus === "partial") {
    return "partial";
  }
  if (
    taskVerdict.completeProof &&
    verificationStatus === "passed" &&
    verificationSelection.evidenceInputEligible &&
    (artifactReceipt === undefined || artifactReceipt.validationState === "validation-passed") &&
    (repairDecision.state === "not-needed" || repairDecision.state === "post-validation-passed")
  ) {
    return "complete";
  }
  return "not-proven";
}

export function observedVerificationStatus(
  definition: TaskCaseDefinition,
  hostEvaluation: TaskHostEvaluationSummary,
): TaskVerificationStatus {
  if (definition.expectedVerification.expectedStatus !== "passed") {
    return definition.expectedVerification.expectedStatus;
  }
  return hostEvaluation.observedEvidenceVerdict === "complete" ? "passed" : "not-run";
}

export function blockersFor(
  definition: TaskCaseDefinition,
  outcome: TaskOutcome,
  hostEvaluation: TaskHostEvaluationSummary,
  verificationSelection: VerificationSelection,
  artifactReceipt: ArtifactReceipt | undefined,
  repairDecision: RepairDecision,
  failureCategories: readonly TaskFailureCategory[],
): readonly string[] {
  if (outcome === "complete") {
    return [];
  }
  return freeze(unique([
    ...failureCategories.map((category) => `${category}: ${definition.caseId}`),
    ...verificationSelection.blockers.map((blocker) => `${blocker}: ${definition.caseId}`),
    ...(artifactReceipt?.blockers ?? []).map((blocker) => `${blocker}: ${definition.caseId}`),
    ...repairDecision.blockers.map((blocker) => `${blocker}: ${definition.caseId}`),
    ...hostEvaluation.blockers.map((blocker) => blocker.code),
  ]));
}

export function outcomeCounts(cases: readonly TaskCaseResult[]): Readonly<Record<TaskOutcome, number>> {
  return freeze({
    complete: cases.filter((result) => result.outcome === "complete").length,
    partial: cases.filter((result) => result.outcome === "partial").length,
    failed: cases.filter((result) => result.outcome === "failed").length,
    blocked: cases.filter((result) => result.outcome === "blocked").length,
    skipped: cases.filter((result) => result.outcome === "skipped").length,
    unsupported: cases.filter((result) => result.outcome === "unsupported").length,
    "not-proven": cases.filter((result) => result.outcome === "not-proven").length,
  });
}

export function summarizeTopBlockers(cases: readonly TaskCaseResult[]): readonly TaskBlockerSummary[] {
  const map = new Map<TaskFailureCategory, TaskCaseId[]>();
  for (const result of cases) {
    if (result.outcome === "complete") {
      continue;
    }
    for (const category of result.failureCategories) {
      map.set(category, [...(map.get(category) ?? []), result.caseId]);
    }
  }
  return freeze(
    Array.from(map.entries())
      .map(([category, caseIds]) => ({
        category,
        count: caseIds.length,
        caseIds: freeze(caseIds),
        summary: `${category} blocks ${caseIds.length} task case(s)`,
      }))
      .sort((left, right) => right.count - left.count || left.category.localeCompare(right.category))
      .slice(0, 3),
  );
}

export function liveTriageFor(cases: readonly TaskCaseResult[]): TaskAssessmentResult["liveTriage"] {
  const live = cases.find((result) => result.taskKind === "live-triage");
  if (!live || live.liveReadiness.status === "ready") {
    return freeze({
      status: "ready",
      blockers: live?.liveReadiness.requirements ?? [],
      terminalSuccessClaim: false,
    });
  }
  return freeze({
    status: "skipped",
    blockers: live.liveReadiness.blockers.length > 0
      ? live.liveReadiness.blockers
      : ["live provider triage requires an explicit opt-in gate"],
    terminalSuccessClaim: false,
  });
}

function freeze<T>(value: T): T {
  return Object.freeze(value);
}

function unique<T extends string>(values: readonly T[]): readonly T[] {
  return freeze(Array.from(new Set(values)));
}
