import type { HostCommandResponse } from "../../api/host/contract.js";
import {
  projectTaskLiveExecution,
  runTaskAssessment,
  type TaskCaseId,
  type TaskLiveExecutionStatus,
  type TaskLiveGate,
  type TaskLiveGateObservation,
  type TaskLiveGateOutcome,
  type TaskLivePolicy,
  type TaskLiveSafetyClass,
} from "./model.js";

export type TaskLiveEntryId =
  | "pathless-workspace-question"
  | "owner-context-question"
  | "test-impact-question"
  | "incident-summary-report"
  | "metrics-summary-artifact"
  | "resume-from-context"
  | "readonly-coding-check"
  | "write-planning-dry-run";

export type TaskLiveEntryKind =
  | "pathless-context"
  | "report-artifact"
  | "data-artifact"
  | "continuation"
  | "readonly-coding"
  | "write-planning";

export interface TaskLiveEntry {
  readonly entryId: TaskLiveEntryId;
  readonly taskCaseId?: TaskCaseId;
  readonly entryKind: TaskLiveEntryKind;
  readonly shortPrompt: string;
  readonly gate: TaskLiveGate;
  readonly safetyClass: TaskLiveSafetyClass;
  readonly writePolicy: TaskLivePolicy;
  readonly requirements: readonly string[];
  readonly validationPlan: string;
  readonly defaultOff: true;
  readonly optInRequired: true;
  readonly terminalSuccessClaim: false;
}

export interface TaskLiveRunObservation {
  readonly entryId: TaskLiveEntryId;
  readonly gate: TaskLiveGate;
  readonly explicitOptIn: true;
  readonly providerAttempted: boolean;
  readonly providerOutcome: TaskLiveGateOutcome;
  readonly noMutation: boolean;
  readonly changedFiles: readonly string[];
  readonly noApply: boolean;
  readonly redactionStatus: "passed" | "failed";
  readonly verificationStatus: "passed" | "partial" | "failed" | "not-run";
  readonly artifactValidationStatus?: "passed" | "partial" | "failed" | "not-run";
  readonly proofStatus: "complete" | "partial" | "missing";
  readonly fallbackConfigured?: boolean;
  readonly fallbackAttempted?: boolean;
  readonly fallbackOutcome?: "passed" | "failed" | "skipped" | "inconclusive";
}

export interface TaskLiveRunEntryResult {
  readonly entryId: TaskLiveEntryId;
  readonly entryKind: TaskLiveEntryKind;
  readonly gate: TaskLiveGate;
  readonly status: TaskLiveExecutionStatus;
  readonly executed: boolean;
  readonly providerAttempted: boolean;
  readonly providerOutcome: TaskLiveGateOutcome | "not-run";
  readonly noMutation: boolean;
  readonly changedFiles: readonly string[];
  readonly noApply: boolean;
  readonly redactionStatus: "passed" | "failed" | "not-run";
  readonly verificationStatus: "passed" | "partial" | "failed" | "not-run";
  readonly artifactValidationStatus: "passed" | "partial" | "failed" | "not-run";
  readonly proofStatus: "complete" | "partial" | "missing";
  readonly blockers: readonly string[];
  readonly proofItems: readonly string[];
  readonly requirements: readonly string[];
  readonly validationPlan: string;
  readonly writePolicy: TaskLivePolicy;
  readonly defaultOff: true;
  readonly optInRequired: true;
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export interface TaskLiveRunSummary {
  readonly entryCount: number;
  readonly executedCount: number;
  readonly completeOrUsefulPartialCount: number;
  readonly pathlessOrContextExecuted: boolean;
  readonly reportArtifactOrDataExecuted: boolean;
  readonly continuationExecutedOrExactPartial: boolean;
  readonly readonlyCodingExecuted: boolean;
  readonly writeEntrySafe: boolean;
  readonly hardGateStatus: "passed" | "not-passed";
  readonly blockers: readonly string[];
  readonly terminalSuccessClaim: false;
}

export interface TaskLiveRunReport {
  readonly reportId: "task-live-run";
  readonly entries: readonly TaskLiveEntry[];
  readonly results: readonly TaskLiveRunEntryResult[];
  readonly summary: TaskLiveRunSummary;
  readonly defaultOff: true;
  readonly optInRequired: true;
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export function listTaskLiveEntries(): readonly TaskLiveEntry[] {
  return freeze([
    liveEntry({
      entryId: "pathless-workspace-question",
      taskCaseId: "pathless-workspace-question",
      entryKind: "pathless-context",
      shortPrompt: "Find the owner and focused check without a path.",
      gate: "read-only-provider",
      safetyClass: "safe-no-write",
      writePolicy: "no-write",
      validationPlan: "safe context packet, no mutation check, redaction, and target-resolution proof",
      requirements: ["context packet", "request packet", "provider auth readiness", "no mutation", "task proof"],
    }),
    liveEntry({
      entryId: "owner-context-question",
      taskCaseId: "owner-context-question",
      entryKind: "pathless-context",
      shortPrompt: "Explain the owner boundary without writing files.",
      gate: "read-only-provider",
      safetyClass: "safe-no-write",
      writePolicy: "no-write",
      validationPlan: "safe owner context, no mutation check, redaction, and target-resolution proof",
      requirements: ["owner context", "request packet", "provider auth readiness", "no mutation", "task proof"],
    }),
    liveEntry({
      entryId: "test-impact-question",
      taskCaseId: "test-impact-question",
      entryKind: "pathless-context",
      shortPrompt: "Select the focused test impact without a path.",
      gate: "read-only-provider",
      safetyClass: "safe-no-write",
      writePolicy: "no-write",
      validationPlan: "verification candidate selection, no mutation check, redaction, and target-resolution proof",
      requirements: ["verification candidates", "request packet", "provider auth readiness", "no mutation", "task proof"],
    }),
    liveEntry({
      entryId: "incident-summary-report",
      taskCaseId: "incident-summary-report",
      entryKind: "report-artifact",
      shortPrompt: "Draft an incident summary from provided source notes.",
      gate: "artifact-dry-run",
      safetyClass: "manual-review",
      writePolicy: "manual-review-required",
      validationPlan: "source receipts, no write, artifact validation, and manual review before any write",
      requirements: ["source receipts", "artifact validation", "provider auth readiness", "no write", "manual review"],
    }),
    liveEntry({
      entryId: "metrics-summary-artifact",
      taskCaseId: "metrics-summary-artifact",
      entryKind: "data-artifact",
      shortPrompt: "Create a metrics summary shape from source rows without writing.",
      gate: "artifact-dry-run",
      safetyClass: "manual-review",
      writePolicy: "manual-review-required",
      validationPlan: "structured format validation, no write, and manual review before any write",
      requirements: ["source receipts", "schema validation", "provider auth readiness", "no write", "manual review"],
    }),
    liveEntry({
      entryId: "resume-from-context",
      taskCaseId: "resume-from-context",
      entryKind: "continuation",
      shortPrompt: "Resume from fresh context and report remaining blockers.",
      gate: "anchored-provider",
      safetyClass: "safe-no-write",
      writePolicy: "no-write",
      validationPlan: "fresh continuation context, anchored no-apply result, redaction, and task proof",
      requirements: ["fresh continuation", "anchored output validation", "provider auth readiness", "no apply", "task proof"],
    }),
    liveEntry({
      entryId: "readonly-coding-check",
      entryKind: "readonly-coding",
      shortPrompt: "Answer a coding question from fixture context without changing files.",
      gate: "read-only-provider",
      safetyClass: "safe-no-write",
      writePolicy: "no-write",
      validationPlan: "read-only coding gate, changedFiles empty visibility, no mutation, redaction, and answer proof",
      requirements: ["read-only coding gate", "changedFiles empty visible", "provider auth readiness", "no mutation", "task proof"],
    }),
    liveEntry({
      entryId: "write-planning-dry-run",
      entryKind: "write-planning",
      shortPrompt: "Plan a write-capable coding change without applying it.",
      gate: "anchored-provider",
      safetyClass: "manual-review",
      writePolicy: "dry-run-only",
      validationPlan: "write-capable planning remains dry-run, no apply, no mutation, redaction, and manual review",
      requirements: ["dry-run planning", "provider auth readiness", "no apply", "no mutation", "manual review"],
    }),
  ]);
}

export async function runTaskLiveReport(input: {
  readonly dispatch: (command: unknown) => Promise<HostCommandResponse>;
  readonly observations?: readonly TaskLiveRunObservation[];
}): Promise<TaskLiveRunReport> {
  const entries = listTaskLiveEntries();
  const taskCaseIds = entries
    .map((entry) => entry.taskCaseId)
    .filter((caseId): caseId is TaskCaseId => Boolean(caseId));
  const assessment = await runTaskAssessment({
    dispatch: input.dispatch,
    caseIds: taskCaseIds,
    liveGateObservations: input.observations
      ?.filter((observation) => taskCaseIds.includes(observation.entryId as TaskCaseId))
      .map((observation): TaskLiveGateObservation => ({
        caseId: observation.entryId as TaskCaseId,
        gate: observation.gate,
        explicitOptIn: observation.explicitOptIn,
        providerAttempted: observation.providerAttempted,
        providerOutcome: observation.providerOutcome,
        noMutation: observation.noMutation,
        changedFiles: observation.changedFiles,
        noApply: observation.noApply,
        redactionStatus: observation.redactionStatus,
        verificationStatus: observation.verificationStatus,
        artifactValidationStatus: observation.artifactValidationStatus,
        fallbackConfigured: observation.fallbackConfigured,
        fallbackAttempted: observation.fallbackAttempted,
        fallbackOutcome: observation.fallbackOutcome,
      })),
  });
  const resultByCaseId = new Map(assessment.cases.map((result) => [result.caseId, result]));
  const executionByCaseId = new Map(assessment.liveExecutions.map((execution) => [execution.caseId, execution]));
  const observationsByEntryId = new Map(input.observations?.map((observation) => [observation.entryId, observation]) ?? []);

  const results = entries.map((entry) => {
    if (entry.taskCaseId) {
      const taskResult = resultByCaseId.get(entry.taskCaseId);
      const execution = executionByCaseId.get(entry.taskCaseId);
      if (!taskResult || !execution) {
        return notRunEntry(entry, ["task case result missing"]);
      }
      return freeze({
        entryId: entry.entryId,
        entryKind: entry.entryKind,
        gate: entry.gate,
        status: execution.status,
        executed: execution.executed,
        providerAttempted: execution.providerAttempted,
        providerOutcome: execution.providerOutcome,
        noMutation: execution.noMutation,
        changedFiles: execution.changedFiles,
        noApply: execution.noApply,
        redactionStatus: execution.redactionStatus,
        verificationStatus: execution.verificationStatus,
        artifactValidationStatus: execution.artifactValidationStatus,
        proofStatus: execution.proofStatus,
        blockers: execution.blockers,
        proofItems: execution.proofItems,
        requirements: entry.requirements,
        validationPlan: entry.validationPlan,
        writePolicy: entry.writePolicy,
        defaultOff: true,
        optInRequired: true,
        terminalSuccessClaim: false,
        notProvenClaims: execution.notProvenClaims,
      } satisfies TaskLiveRunEntryResult);
    }
    return externalEntryResult(entry, observationsByEntryId.get(entry.entryId));
  });
  const summary = summarizeLiveRun(results);
  return freeze({
    reportId: "task-live-run",
    entries,
    results: freeze(results),
    summary,
    defaultOff: true,
    optInRequired: true,
    terminalSuccessClaim: false,
    notProvenClaims: freeze(unique([
      "terminal-success",
      "live-run-report-is-not-task-success",
      ...results.flatMap((result) => result.notProvenClaims),
    ])),
  });
}

function liveEntry(input: Omit<TaskLiveEntry, "defaultOff" | "optInRequired" | "terminalSuccessClaim">): TaskLiveEntry {
  return freeze({
    ...input,
    requirements: freeze(unique([
      ...input.requirements,
      "explicit opt-in",
      "isolated runtime home",
      "redacted output",
    ])),
    defaultOff: true,
    optInRequired: true,
    terminalSuccessClaim: false,
  });
}

function externalEntryResult(
  entry: TaskLiveEntry,
  observation: TaskLiveRunObservation | undefined,
): TaskLiveRunEntryResult {
  if (!observation) {
    return notRunEntry(entry, [`explicit opt-in gate not executed: ${entry.gate}`]);
  }
  const blockers = externalObservationBlockers(entry, observation);
  const executed = blockers.length === 0;
  const proofItems = executed ? externalProofItems(observation) : [];
  return freeze({
    entryId: entry.entryId,
    entryKind: entry.entryKind,
    gate: entry.gate,
    status: externalStatus(entry, observation, blockers, proofItems),
    executed,
    providerAttempted: observation.providerAttempted,
    providerOutcome: observation.providerOutcome,
    noMutation: observation.noMutation,
    changedFiles: freeze([...observation.changedFiles]),
    noApply: observation.noApply,
    redactionStatus: observation.redactionStatus,
    verificationStatus: observation.verificationStatus,
    artifactValidationStatus: observation.artifactValidationStatus ?? "not-run",
    proofStatus: observation.proofStatus,
    blockers: freeze(blockers),
    proofItems: freeze(proofItems),
    requirements: entry.requirements,
    validationPlan: entry.validationPlan,
    writePolicy: entry.writePolicy,
    defaultOff: true,
    optInRequired: true,
    terminalSuccessClaim: false,
    notProvenClaims: freeze([
      "provider-call-is-not-task-success",
      "live-gate-pass-is-not-task-success",
      "terminal-success",
    ]),
  });
}

function notRunEntry(entry: TaskLiveEntry, blockers: readonly string[]): TaskLiveRunEntryResult {
  return freeze({
    entryId: entry.entryId,
    entryKind: entry.entryKind,
    gate: entry.gate,
    status: "not-run",
    executed: false,
    providerAttempted: false,
    providerOutcome: "not-run",
    noMutation: entry.writePolicy === "no-write",
    changedFiles: freeze([]),
    noApply: true,
    redactionStatus: "not-run",
    verificationStatus: "not-run",
    artifactValidationStatus: "not-run",
    proofStatus: "missing",
    blockers: freeze(blockers),
    proofItems: freeze([]),
    requirements: entry.requirements,
    validationPlan: entry.validationPlan,
    writePolicy: entry.writePolicy,
    defaultOff: true,
    optInRequired: true,
    terminalSuccessClaim: false,
    notProvenClaims: freeze(["live-task-not-executed", "terminal-success"]),
  });
}

function externalObservationBlockers(
  entry: TaskLiveEntry,
  observation: TaskLiveRunObservation,
): readonly string[] {
  const blockers: string[] = [];
  if (observation.gate !== entry.gate) blockers.push("gate mismatch");
  if (observation.redactionStatus !== "passed") blockers.push("redaction blocked");
  if (!observation.noMutation || observation.changedFiles.length > 0) blockers.push("no-mutation check failed");
  if (!observation.noApply) blockers.push("no-apply check failed");
  if (observation.providerOutcome === "provider-network-inconclusive") {
    blockers.push(observation.fallbackConfigured === false
      ? "provider network inconclusive and no configured fallback provider"
      : "provider network inconclusive");
  }
  if (observation.providerOutcome === "config-or-skip") blockers.push("provider config or opt-in gate missing");
  if (observation.providerOutcome === "failed") blockers.push("provider or product execution failed");
  if (observation.providerOutcome === "skipped") blockers.push("explicit opt-in gate skipped");
  if (entry.entryKind === "readonly-coding" && observation.proofStatus === "missing") {
    blockers.push("task proof missing");
  }
  return unique(blockers);
}

function externalProofItems(observation: TaskLiveRunObservation): readonly string[] {
  const items = ["explicit-opt-in-gate", "redaction-check", "no-mutation-check"];
  if (observation.providerAttempted) items.push("provider-attempt");
  if (observation.noApply) items.push("no-apply-check");
  if (observation.verificationStatus === "passed" || observation.verificationStatus === "partial") {
    items.push("verification-check");
  }
  if (observation.proofStatus !== "missing") items.push("task-proof");
  return unique(items);
}

function externalStatus(
  entry: TaskLiveEntry,
  observation: TaskLiveRunObservation,
  blockers: readonly string[],
  proofItems: readonly string[],
): TaskLiveExecutionStatus {
  if (blockers.includes("redaction blocked")) return "redaction-blocked";
  if (blockers.includes("provider config or opt-in gate missing")) return "provider-readiness-missing";
  if (blockers.includes("explicit opt-in gate skipped")) return "skipped";
  if (blockers.length > 0 && observation.providerOutcome === "provider-network-inconclusive") return "blocked";
  if (blockers.length > 0) return "failed";
  if (entry.entryKind === "write-planning") return "manual-review-required";
  if (observation.proofStatus === "complete" && proofItems.includes("task-proof")) return "complete";
  return proofItems.length > 0 ? "useful-partial" : "provider-output-insufficient";
}

function summarizeLiveRun(results: readonly TaskLiveRunEntryResult[]): TaskLiveRunSummary {
  const executed = results.filter((result) => result.executed);
  const completeOrUseful = executed.filter((result) => result.status === "complete" || result.status === "useful-partial");
  const blockers = [
    ...(results.length >= 6 ? [] : ["fewer than six live task entries"]),
    ...(executed.length >= 4 ? [] : ["fewer than four entries executed through explicit gates"]),
    ...(completeOrUseful.length >= 3 ? [] : ["fewer than three executed entries reached complete or useful partial"]),
    ...(executed.some((result) => result.entryKind === "pathless-context") ? [] : ["pathless or context entry did not execute"]),
    ...(executed.some((result) => result.entryKind === "report-artifact" || result.entryKind === "data-artifact")
      ? []
      : ["report, artifact, or data entry did not execute"]),
    ...(executed.some((result) => result.entryKind === "continuation") ||
      results.some((result) => result.entryKind === "continuation" && result.status === "useful-partial" && result.blockers.length > 0)
      ? []
      : ["continuation entry did not execute or reach exact useful partial"]),
    ...(executed.some((result) => result.entryKind === "readonly-coding") ? [] : ["readonly coding entry did not execute"]),
    ...(results.some((result) =>
      result.entryKind === "write-planning" &&
      (result.status === "manual-review-required" || result.status === "unsafe" || result.status === "blocked" || result.writePolicy === "dry-run-only")
    )
      ? []
      : ["write-capable entry did not remain dry-run or manual-review"]),
  ];
  return freeze({
    entryCount: results.length,
    executedCount: executed.length,
    completeOrUsefulPartialCount: completeOrUseful.length,
    pathlessOrContextExecuted: executed.some((result) => result.entryKind === "pathless-context"),
    reportArtifactOrDataExecuted: executed.some((result) => result.entryKind === "report-artifact" || result.entryKind === "data-artifact"),
    continuationExecutedOrExactPartial: executed.some((result) => result.entryKind === "continuation") ||
      results.some((result) => result.entryKind === "continuation" && result.status === "useful-partial" && result.blockers.length > 0),
    readonlyCodingExecuted: executed.some((result) => result.entryKind === "readonly-coding"),
    writeEntrySafe: results.some((result) =>
      result.entryKind === "write-planning" &&
      (result.status === "manual-review-required" || result.status === "unsafe" || result.status === "blocked" || result.writePolicy === "dry-run-only")
    ),
    hardGateStatus: blockers.length === 0 ? "passed" : "not-passed",
    blockers: freeze(blockers),
    terminalSuccessClaim: false,
  });
}

function unique<T extends string>(values: readonly T[]): readonly T[] {
  return Array.from(new Set(values));
}

function freeze<T>(value: T): Readonly<T> {
  return Object.freeze(value);
}
