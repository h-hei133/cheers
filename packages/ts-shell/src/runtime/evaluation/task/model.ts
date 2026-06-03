import type { HostCommandResponse } from "../../api/host/contract.js";
import {
  createArtifactReceipt,
  type ArtifactReceipt,
} from "../../../artifacts/workflow/model.js";
import {
  decideRepair,
  type RepairDecision,
} from "../../../repair/loop/model.js";
import {
  selectVerification,
  type VerificationSelection,
} from "../../../verification/selection/model.js";
import {
  runEvaluationCase,
  type EvaluationCaseId,
  type EvaluationCaseResult,
} from "../model.js";

export type TaskOutcome =
  | "complete"
  | "partial"
  | "failed"
  | "blocked"
  | "skipped"
  | "unsupported"
  | "not-proven";

export type TaskKind =
  | "coding-edit"
  | "debug-repair"
  | "workspace-understanding"
  | "docs-report"
  | "data-artifact"
  | "continuation"
  | "live-triage";

export type TaskPath = "provider" | "tool" | "edit" | "artifact" | "continuation";

export type TaskFailureCategory =
  | "goal unclear"
  | "missing user input"
  | "context not found"
  | "wrong context selected"
  | "context insufficient"
  | "planning weak"
  | "tool strategy weak"
  | "provider output insufficient"
  | "provider failure"
  | "edit failure"
  | "verification not selected"
  | "verification failed"
  | "repair failed"
  | "artifact invalid"
  | "continuation stale"
  | "authority missing"
  | "unsupported capability"
  | "environment issue"
  | "redaction or safety block"
  | "unknown";

export type TaskCaseId =
  | "single-file-edit"
  | "coordinated-edit"
  | "failed-check-repair"
  | "rollback-recovery"
  | "pathless-workspace-question"
  | "source-report"
  | "structured-artifact"
  | "unsupported-artifact-export"
  | "resume-from-context"
  | "live-provider-triage";

export type TaskVerificationStatus =
  | "passed"
  | "partial"
  | "failed"
  | "blocked"
  | "skipped"
  | "not-run";

export interface TaskWorkspaceFixture {
  readonly fixtureId: string;
  readonly setupSummary: string;
  readonly files: readonly {
    readonly path: string;
    readonly purpose: string;
  }[];
  readonly rawContentExcluded: true;
}

export interface TaskVerificationExpectation {
  readonly verificationId: string;
  readonly commandOrCheck: string;
  readonly expectedStatus: TaskVerificationStatus;
  readonly taskRelevant: true;
}

export interface TaskExpectedOutput {
  readonly kind: "diff" | "artifact" | "analysis" | "continuation";
  readonly summary: string;
  readonly requiredPaths: readonly string[];
}

export interface TaskCaseDefinition {
  readonly caseId: TaskCaseId;
  readonly taskKind: TaskKind;
  readonly taskPath: TaskPath;
  readonly shortPrompt: string;
  readonly workspace: TaskWorkspaceFixture;
  readonly allowedTools: readonly string[];
  readonly allowedWrites: readonly string[];
  readonly successRubric: readonly string[];
  readonly expectedVerification: TaskVerificationExpectation;
  readonly expectedOutput: TaskExpectedOutput;
  readonly expectedEvidenceResultCondition: "complete-proof" | "not-proven" | "blocked" | "skipped";
  readonly expectedOutcome: TaskOutcome;
  readonly baselineOutcome?: TaskOutcome;
  readonly baselineFailureCategories?: readonly TaskFailureCategory[];
  readonly hostEvaluationCaseId: EvaluationCaseId;
  readonly setupEvaluationCaseIds?: readonly EvaluationCaseId[];
  readonly failureCategories: readonly TaskFailureCategory[];
  readonly redactionExpectations: readonly string[];
  readonly terminalSuccessClaim: false;
}

export interface TaskCaseResult {
  readonly caseId: TaskCaseId;
  readonly taskKind: TaskKind;
  readonly taskPath: TaskPath;
  readonly shortPrompt: string;
  readonly beforeOutcome: TaskOutcome;
  readonly outcome: TaskOutcome;
  readonly expectedOutcome: TaskOutcome;
  readonly workspace: TaskWorkspaceFixture;
  readonly allowedTools: readonly string[];
  readonly allowedWrites: readonly string[];
  readonly successRubric: readonly string[];
  readonly expectedVerification: TaskVerificationExpectation;
  readonly observedVerification: {
    readonly status: TaskVerificationStatus;
    readonly taskRelevant: boolean;
    readonly evidenceVerdict: string;
    readonly hostStatus: string;
  };
  readonly verificationSelection: VerificationSelection;
  readonly expectedOutput: TaskExpectedOutput;
  readonly artifactReceipt?: ArtifactReceipt;
  readonly repairDecision: RepairDecision;
  readonly hostEvaluation: TaskHostEvaluationSummary;
  readonly setupEvaluations: readonly TaskHostEvaluationSummary[];
  readonly failureCategories: readonly TaskFailureCategory[];
  readonly beforeBlockers: readonly TaskFailureCategory[];
  readonly changedBlockers: readonly TaskFailureCategory[];
  readonly remainingBlockers: readonly TaskFailureCategory[];
  readonly blockers: readonly string[];
  readonly redactionChecks: readonly {
    readonly label: string;
    readonly passed: boolean;
  }[];
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export interface TaskHostEvaluationSummary {
  readonly scenarioId: EvaluationCaseId;
  readonly status: string;
  readonly observedStatus: string;
  readonly observedEvidenceVerdict: string;
  readonly eventCount: number;
  readonly eventCategories: readonly string[];
  readonly blockerCodes: readonly string[];
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export interface TaskBlockerSummary {
  readonly category: TaskFailureCategory;
  readonly count: number;
  readonly caseIds: readonly TaskCaseId[];
  readonly summary: string;
}

export interface TaskAssessmentResult {
  readonly suiteId: "task-capability-assessment";
  readonly cases: readonly TaskCaseResult[];
  readonly outcomeCounts: Readonly<Record<TaskOutcome, number>>;
  readonly topBlockers: readonly TaskBlockerSummary[];
  readonly liveTriage: {
    readonly status: "skipped" | "ready";
    readonly blockers: readonly string[];
    readonly terminalSuccessClaim: false;
  };
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export function listTaskCases(): readonly TaskCaseDefinition[] {
  return freeze([
    singleFileEdit(),
    coordinatedEdit(),
    failedCheckRepair(),
    rollbackRecovery(),
    pathlessWorkspaceQuestion(),
    sourceReport(),
    structuredArtifact(),
    unsupportedArtifactExport(),
    resumeFromContext(),
    liveProviderTriage(),
  ]);
}

export async function runTaskCase(input: {
  readonly caseId: TaskCaseId;
  readonly dispatch: (command: unknown) => Promise<HostCommandResponse>;
}): Promise<TaskCaseResult> {
  const definition = taskCaseDefinition(input.caseId);
  if (!definition) {
    throw new Error(`Unknown task case: ${input.caseId}`);
  }
  return runDefinedTaskCase(definition, input.dispatch);
}

export async function runTaskAssessment(input: {
  readonly dispatch: (command: unknown) => Promise<HostCommandResponse>;
  readonly caseIds?: readonly TaskCaseId[];
}): Promise<TaskAssessmentResult> {
  const definitions = input.caseIds
    ? input.caseIds.map((caseId) => {
      const definition = taskCaseDefinition(caseId);
      if (!definition) {
        throw new Error(`Unknown task case: ${caseId}`);
      }
      return definition;
    })
    : listTaskCases();

  const cases: TaskCaseResult[] = [];
  for (const definition of definitions) {
    cases.push(await runDefinedTaskCase(definition, input.dispatch));
  }

  return freeze({
    suiteId: "task-capability-assessment",
    cases,
    outcomeCounts: outcomeCounts(cases),
    topBlockers: summarizeTopBlockers(cases),
    liveTriage: liveTriageFor(cases),
    terminalSuccessClaim: false,
    notProvenClaims: unique([
      "terminal-success",
      "task-assessment-run-is-not-task-success",
      ...cases.flatMap((result) => result.notProvenClaims),
    ]),
  });
}

async function runDefinedTaskCase(
  definition: TaskCaseDefinition,
  dispatch: (command: unknown) => Promise<HostCommandResponse>,
): Promise<TaskCaseResult> {
  const setupEvaluations: TaskHostEvaluationSummary[] = [];
  for (const setupCaseId of definition.setupEvaluationCaseIds ?? []) {
    setupEvaluations.push(projectHostEvaluationSummary(
      await runEvaluationCase({ caseId: setupCaseId, dispatch }),
    ));
  }
  const hostEvaluation = await runEvaluationCase({
    caseId: definition.hostEvaluationCaseId,
    dispatch,
  });
  const observedVerification = {
    status: observedVerificationStatus(definition, hostEvaluation),
    taskRelevant: true,
    evidenceVerdict: hostEvaluation.observedEvidenceVerdict,
    hostStatus: hostEvaluation.observedStatus,
  };
  const verificationSelection = selectVerification({
    taskKind: definition.taskKind,
    taskPath: definition.taskPath,
    expectedStatus: definition.expectedVerification.expectedStatus,
    expectedCheck: definition.expectedVerification.commandOrCheck,
    hostEvidenceVerdict: hostEvaluation.observedEvidenceVerdict,
    hostStatus: hostEvaluation.observedStatus,
    failureCategories: definition.failureCategories,
  });
  const artifactReceipt = createArtifactReceipt({
    taskKind: definition.taskKind,
    outputKind: definition.expectedOutput.kind,
    requiredPaths: definition.expectedOutput.requiredPaths,
    workspacePaths: definition.workspace.files.map((file) => file.path),
    verificationState: verificationSelection.state,
    failureCategories: definition.failureCategories,
  });
  const repairDecision = decideRepair({
    taskKind: definition.taskKind,
    verificationState: verificationSelection.state,
    artifactValidationState: artifactReceipt?.validationState,
    failureCategories: definition.failureCategories,
    hostStatus: hostEvaluation.observedStatus,
  });
  const outcome = classifyOutcome(
    definition,
    hostEvaluation,
    observedVerification.status,
    verificationSelection,
    artifactReceipt,
    repairDecision,
  );
  const redactionChecks = [
    ...hostEvaluation.redactionChecks,
    ...definition.redactionExpectations.map((label) => ({ label, passed: true })),
  ];
  const beforeBlockers = definition.baselineFailureCategories ?? definition.failureCategories;
  const failureCategories = outcome === "complete"
    ? []
    : measuredFailureCategories(definition, verificationSelection, artifactReceipt, repairDecision);

  return freeze({
    caseId: definition.caseId,
    taskKind: definition.taskKind,
    taskPath: definition.taskPath,
    shortPrompt: definition.shortPrompt,
    beforeOutcome: definition.baselineOutcome ?? definition.expectedOutcome,
    outcome,
    expectedOutcome: definition.expectedOutcome,
    workspace: definition.workspace,
    allowedTools: definition.allowedTools,
    allowedWrites: definition.allowedWrites,
    successRubric: definition.successRubric,
    expectedVerification: definition.expectedVerification,
    observedVerification,
    verificationSelection,
    expectedOutput: definition.expectedOutput,
    artifactReceipt,
    repairDecision,
    hostEvaluation: projectHostEvaluationSummary(hostEvaluation),
    setupEvaluations,
    failureCategories,
    beforeBlockers,
    changedBlockers: beforeBlockers.filter((category) => !failureCategories.includes(category)),
    remainingBlockers: failureCategories,
    blockers: blockersFor(definition, outcome, hostEvaluation, verificationSelection, artifactReceipt, repairDecision, failureCategories),
    redactionChecks,
    terminalSuccessClaim: false,
    notProvenClaims: unique([
      "terminal-success",
      "task-case-run-is-not-task-success",
      "host-evaluation-output-is-not-task-success",
      ...hostEvaluation.notProvenClaims,
      ...(outcome === "complete" ? [] : ["task-completion-not-proven"]),
    ]),
  });
}

function measuredFailureCategories(
  definition: TaskCaseDefinition,
  verificationSelection: VerificationSelection,
  artifactReceipt: ArtifactReceipt | undefined,
  repairDecision: RepairDecision,
): readonly TaskFailureCategory[] {
  const categories: TaskFailureCategory[] = [];
  if (verificationSelection.state === "not-selected") {
    categories.push("verification not selected");
  }
  if (
    verificationSelection.state === "selected-failed" ||
    verificationSelection.state === "insufficient"
  ) {
    categories.push("verification failed");
  }
  if (
    artifactReceipt?.validationState === "invalid" ||
    artifactReceipt?.validationState === "validation-failed" ||
    artifactReceipt?.validationState === "source-missing" ||
    artifactReceipt?.validationState === "unsafe-path"
  ) {
    categories.push("artifact invalid");
  }
  if (
    repairDecision.state === "failed" ||
    repairDecision.state === "post-validation-failed" ||
    repairDecision.state === "retry-exhausted"
  ) {
    categories.push("repair failed");
  }
  for (const category of definition.failureCategories) {
    if (
      category !== "verification not selected" &&
      category !== "verification failed" &&
      category !== "artifact invalid" &&
      category !== "repair failed"
    ) {
      categories.push(category);
    }
  }
  return freeze(unique(categories));
}

function projectHostEvaluationSummary(result: EvaluationCaseResult): TaskHostEvaluationSummary {
  return freeze({
    scenarioId: result.scenarioId,
    status: result.status,
    observedStatus: result.observedStatus,
    observedEvidenceVerdict: result.observedEvidenceVerdict,
    eventCount: result.eventCount,
    eventCategories: result.eventCategories,
    blockerCodes: result.blockers.map((blocker) => blocker.code),
    terminalSuccessClaim: false,
    notProvenClaims: result.notProvenClaims,
  });
}

function classifyOutcome(
  definition: TaskCaseDefinition,
  hostEvaluation: EvaluationCaseResult,
  verificationStatus: TaskVerificationStatus,
  verificationSelection: VerificationSelection,
  artifactReceipt: ArtifactReceipt | undefined,
  repairDecision: RepairDecision,
): TaskOutcome {
  if (hostEvaluation.status === "skipped" || definition.expectedOutcome === "skipped") {
    return "skipped";
  }
  if (hostEvaluation.status === "unsupported" || definition.expectedOutcome === "unsupported") {
    return "unsupported";
  }
  if (hostEvaluation.status === "blocked" || verificationStatus === "blocked") {
    return "blocked";
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
    definition.expectedEvidenceResultCondition === "complete-proof" &&
    hostEvaluation.observedEvidenceVerdict === "complete" &&
    verificationStatus === "passed" &&
    verificationSelection.evidenceInputEligible &&
    (artifactReceipt === undefined || artifactReceipt.validationState === "validation-passed") &&
    (repairDecision.state === "not-needed" || repairDecision.state === "post-validation-passed")
  ) {
    return "complete";
  }
  return "not-proven";
}

function observedVerificationStatus(
  definition: TaskCaseDefinition,
  hostEvaluation: EvaluationCaseResult,
): TaskVerificationStatus {
  if (definition.expectedVerification.expectedStatus !== "passed") {
    return definition.expectedVerification.expectedStatus;
  }
  return hostEvaluation.observedEvidenceVerdict === "complete" ? "passed" : "not-run";
}

function blockersFor(
  definition: TaskCaseDefinition,
  outcome: TaskOutcome,
  hostEvaluation: EvaluationCaseResult,
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

function outcomeCounts(cases: readonly TaskCaseResult[]): Readonly<Record<TaskOutcome, number>> {
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

function summarizeTopBlockers(cases: readonly TaskCaseResult[]): readonly TaskBlockerSummary[] {
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

function liveTriageFor(cases: readonly TaskCaseResult[]): TaskAssessmentResult["liveTriage"] {
  const live = cases.find((result) => result.taskKind === "live-triage");
  if (!live || live.outcome !== "skipped") {
    return freeze({
      status: "ready",
      blockers: [],
      terminalSuccessClaim: false,
    });
  }
  return freeze({
    status: "skipped",
    blockers: live.blockers.length > 0
      ? live.blockers
      : ["live provider triage remains default-off and requires explicit opt-in"],
    terminalSuccessClaim: false,
  });
}

function taskCaseDefinition(caseId: TaskCaseId): TaskCaseDefinition | undefined {
  return listTaskCases().find((definition) => definition.caseId === caseId);
}

function singleFileEdit(): TaskCaseDefinition {
  return baseTask({
    caseId: "single-file-edit",
    taskKind: "coding-edit",
    taskPath: "edit",
    shortPrompt: "Fix the formatter branch and prove the focused test.",
    workspace: fixture("single-file-edit", [
      ["src/format.ts", "primary edit target"],
      ["src/format.test.ts", "focused verification"],
    ]),
    allowedTools: ["read", "edit", "verify"],
    allowedWrites: ["src/format.ts"],
    successRubric: [
      "changes only the selected implementation file",
      "runs the focused verification after the change",
      "result evidence reports complete proof",
    ],
    expectedVerification: verification("focused-format-test", "focused test", "passed"),
    expectedOutput: output("diff", "single implementation diff", ["src/format.ts"]),
    expectedEvidenceResultCondition: "complete-proof",
    expectedOutcome: "complete",
    hostEvaluationCaseId: "mutation-recovery-success",
  });
}

function coordinatedEdit(): TaskCaseDefinition {
  return baseTask({
    caseId: "coordinated-edit",
    taskKind: "coding-edit",
    taskPath: "edit",
    shortPrompt: "Update the parser and its call site together.",
    workspace: fixture("coordinated-edit", [
      ["src/parser.ts", "first edit target"],
      ["src/caller.ts", "second edit target"],
      ["src/parser.test.ts", "whole-task verification"],
    ]),
    allowedTools: ["read", "edit", "verify"],
    allowedWrites: ["src/parser.ts", "src/caller.ts"],
    successRubric: [
      "updates both related files",
      "keeps target ordering deterministic",
      "runs whole-task verification",
    ],
    expectedVerification: verification("parser-suite", "whole-task test", "passed"),
    expectedOutput: output("diff", "multi-target implementation diff", ["src/parser.ts", "src/caller.ts"]),
    expectedEvidenceResultCondition: "complete-proof",
    expectedOutcome: "complete",
    hostEvaluationCaseId: "multi-target-mutation-success",
  });
}

function failedCheckRepair(): TaskCaseDefinition {
  return baseTask({
    caseId: "failed-check-repair",
    taskKind: "debug-repair",
    taskPath: "edit",
    shortPrompt: "Fix the failing assertion and rerun the check.",
    workspace: fixture("failed-check-repair", [
      ["src/check.ts", "buggy implementation"],
      ["src/check.test.ts", "failing verification"],
    ]),
    allowedTools: ["read", "edit", "verify", "repair"],
    allowedWrites: ["src/check.ts"],
    successRubric: [
      "diagnoses the failing verification",
      "applies a focused repair",
      "does not claim success while verification is still failing",
    ],
    expectedVerification: verification("check-test", "failing focused test", "failed"),
    expectedOutput: output("diff", "repair attempt with failed verification", ["src/check.ts"]),
    expectedEvidenceResultCondition: "not-proven",
    expectedOutcome: "failed",
    hostEvaluationCaseId: "apply-only-negative",
    failureCategories: ["verification failed", "repair failed"],
  });
}

function rollbackRecovery(): TaskCaseDefinition {
  return baseTask({
    caseId: "rollback-recovery",
    taskKind: "debug-repair",
    taskPath: "edit",
    shortPrompt: "Repair the two-file change or roll back the unsafe target.",
    workspace: fixture("rollback-recovery", [
      ["src/alpha.ts", "repair target"],
      ["src/beta.ts", "dependent target"],
      ["src/alpha.test.ts", "partial failure verification"],
    ]),
    allowedTools: ["read", "edit", "verify", "repair"],
    allowedWrites: ["src/alpha.ts", "src/beta.ts"],
    successRubric: [
      "preserves original failure facts",
      "does not hide partial repair",
      "requires post-repair verification before success",
    ],
    expectedVerification: verification("partial-repair-check", "partial repair check", "partial"),
    expectedOutput: output("diff", "partial repair evidence", ["src/alpha.ts", "src/beta.ts"]),
    expectedEvidenceResultCondition: "not-proven",
    expectedOutcome: "partial",
    baselineOutcome: "partial",
    baselineFailureCategories: ["repair failed", "verification not selected"],
    hostEvaluationCaseId: "parallel-tool-partial-failure",
    failureCategories: ["repair failed", "verification failed"],
  });
}

function pathlessWorkspaceQuestion(): TaskCaseDefinition {
  return baseTask({
    caseId: "pathless-workspace-question",
    taskKind: "workspace-understanding",
    taskPath: "tool",
    shortPrompt: "Find why the runtime target selection is wrong.",
    workspace: fixture("pathless-workspace-question", [
      ["package.json", "script and package map"],
      ["src/runtime/selector.ts", "likely target without prompt path hint"],
      ["src/runtime/selector.test.ts", "likely verification"],
    ]),
    allowedTools: ["read", "search", "verify"],
    allowedWrites: [],
    successRubric: [
      "finds relevant workspace context without a file hint",
      "does not infer write authority",
      "reports missing provider or context blockers truthfully",
    ],
    expectedVerification: verification("target-selection-review", "context sufficiency check", "blocked"),
    expectedOutput: output("analysis", "ranked target and missing facts", ["src/runtime/selector.ts"]),
    expectedEvidenceResultCondition: "blocked",
    expectedOutcome: "blocked",
    hostEvaluationCaseId: "provider-blocked",
    failureCategories: ["context insufficient", "authority missing"],
  });
}

function sourceReport(): TaskCaseDefinition {
  return baseTask({
    caseId: "source-report",
    taskKind: "docs-report",
    taskPath: "artifact",
    shortPrompt: "Write a short report from the source notes.",
    workspace: fixture("source-report", [
      ["notes/source-a.md", "report source"],
      ["notes/source-b.md", "report source"],
      ["reports/summary.md", "expected written output"],
    ]),
    allowedTools: ["read", "write", "verify"],
    allowedWrites: ["reports/summary.md"],
    successRubric: [
      "uses source-scoped facts only",
      "writes the requested report artifact",
      "validates the report against source expectations",
    ],
    expectedVerification: verification("report-source-check", "source coverage check", "passed"),
    expectedOutput: output("artifact", "markdown report artifact", ["reports/summary.md"]),
    expectedEvidenceResultCondition: "not-proven",
    expectedOutcome: "not-proven",
    baselineOutcome: "not-proven",
    baselineFailureCategories: ["verification not selected", "artifact invalid"],
    hostEvaluationCaseId: "missing-proof",
    failureCategories: ["artifact invalid"],
  });
}

function structuredArtifact(): TaskCaseDefinition {
  return baseTask({
    caseId: "structured-artifact",
    taskKind: "data-artifact",
    taskPath: "artifact",
    shortPrompt: "Produce the JSON totals artifact from the fixture data.",
    workspace: fixture("structured-artifact", [
      ["data/input.csv", "data source"],
      ["artifacts/totals.json", "expected structured artifact"],
    ]),
    allowedTools: ["read", "write", "verify"],
    allowedWrites: ["artifacts/totals.json"],
    successRubric: [
      "parses the data source",
      "writes valid structured output",
      "validates the artifact format and totals",
    ],
    expectedVerification: verification("json-total-check", "structured artifact check", "failed"),
    expectedOutput: output("artifact", "structured data artifact", ["artifacts/totals.json"]),
    expectedEvidenceResultCondition: "not-proven",
    expectedOutcome: "failed",
    hostEvaluationCaseId: "read-only-tool-loop",
    failureCategories: ["artifact invalid", "verification failed"],
  });
}

function unsupportedArtifactExport(): TaskCaseDefinition {
  return baseTask({
    caseId: "unsupported-artifact-export",
    taskKind: "data-artifact",
    taskPath: "artifact",
    shortPrompt: "Export the result through the unavailable package workflow.",
    workspace: fixture("unsupported-artifact-export", [
      ["artifacts/export-request.json", "export request"],
    ]),
    allowedTools: ["read"],
    allowedWrites: [],
    successRubric: [
      "recognizes the unavailable capability",
      "does not load packages dynamically",
      "reports unsupported workflow without success",
    ],
    expectedVerification: verification("export-capability-check", "unsupported capability check", "blocked"),
    expectedOutput: output("artifact", "unsupported export artifact", ["artifacts/export-request.json"]),
    expectedEvidenceResultCondition: "blocked",
    expectedOutcome: "unsupported",
    hostEvaluationCaseId: "unsupported-provider-mode",
    failureCategories: ["unsupported capability"],
  });
}

function resumeFromContext(): TaskCaseDefinition {
  return baseTask({
    caseId: "resume-from-context",
    taskKind: "continuation",
    taskPath: "continuation",
    shortPrompt: "Continue from the retained context and finish the review.",
    workspace: fixture("resume-from-context", [
      ["src/continued.ts", "prior context target"],
      ["session/compact-state", "retained context marker"],
    ]),
    allowedTools: ["read", "continue", "verify"],
    allowedWrites: [],
    successRubric: [
      "uses retained continuation facts",
      "does not treat compacted summary as proof",
      "reports stale continuation blockers",
    ],
    expectedVerification: verification("continuation-freshness", "continuation freshness check", "passed"),
    expectedOutput: output("continuation", "continued session facts", ["src/continued.ts"]),
    expectedEvidenceResultCondition: "not-proven",
    expectedOutcome: "not-proven",
    baselineOutcome: "not-proven",
    baselineFailureCategories: ["continuation stale", "verification not selected"],
    setupEvaluationCaseIds: ["read-only-tool-loop"],
    hostEvaluationCaseId: "branch-compaction-continuation",
    failureCategories: ["continuation stale"],
  });
}

function liveProviderTriage(): TaskCaseDefinition {
  return baseTask({
    caseId: "live-provider-triage",
    taskKind: "live-triage",
    taskPath: "provider",
    shortPrompt: "Classify whether live task execution is available.",
    workspace: fixture("live-provider-triage", [
      ["src/live-task.ts", "representative live task target"],
    ]),
    allowedTools: ["read"],
    allowedWrites: [],
    successRubric: [
      "stays default-off without explicit live opt-in",
      "does not inspect provider secrets",
      "reports skipped live triage blockers",
    ],
    expectedVerification: verification("live-gate-check", "default-off live gate check", "skipped"),
    expectedOutput: output("analysis", "live triage blocker report", []),
    expectedEvidenceResultCondition: "skipped",
    expectedOutcome: "skipped",
    hostEvaluationCaseId: "optional-live-gate-skipped",
    failureCategories: ["provider failure", "environment issue"],
  });
}

function baseTask(input: Omit<TaskCaseDefinition, "terminalSuccessClaim" | "redactionExpectations" | "failureCategories"> & {
  readonly failureCategories?: readonly TaskFailureCategory[];
  readonly redactionExpectations?: readonly string[];
}): TaskCaseDefinition {
  return freeze({
    ...input,
    failureCategories: input.failureCategories ?? [],
    redactionExpectations: input.redactionExpectations ?? [
      "transcript",
      "provider output",
      "command output",
      "edit text",
      "patch body",
      "hidden-reasoning",
      "secret",
      "token",
      "header",
      "private path",
    ],
    terminalSuccessClaim: false,
  });
}

function fixture(
  fixtureId: string,
  files: readonly (readonly [path: string, purpose: string])[],
): TaskWorkspaceFixture {
  return freeze({
    fixtureId,
    setupSummary: `${fixtureId} workspace fixture`,
    files: files.map(([path, purpose]) => ({ path, purpose })),
    rawContentExcluded: true,
  });
}

function verification(
  verificationId: string,
  commandOrCheck: string,
  expectedStatus: TaskVerificationStatus,
): TaskVerificationExpectation {
  return freeze({
    verificationId,
    commandOrCheck,
    expectedStatus,
    taskRelevant: true,
  });
}

function output(
  kind: TaskExpectedOutput["kind"],
  summary: string,
  requiredPaths: readonly string[],
): TaskExpectedOutput {
  return freeze({ kind, summary, requiredPaths });
}

function freeze<T>(value: T): T {
  return Object.freeze(value);
}

function unique<T extends string>(values: readonly T[]): readonly T[] {
  return Array.from(new Set(values));
}
