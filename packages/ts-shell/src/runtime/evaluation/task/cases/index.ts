import type {
  TaskCaseDefinition,
  TaskCaseId,
  TaskExpectedOutput,
  TaskFailureCategory,
  TaskVerificationExpectation,
  TaskVerificationStatus,
  TaskWorkspaceFixture,
} from "../types.js";

/**
 * The built-in task case catalogue.
 *
 * These are data: every builder returns one frozen `TaskCaseDefinition`, and the
 * helpers at the bottom only assemble that shape. They live apart from
 * `../model.js` so the type contract, the live-execution projection, and the case
 * data can be read and changed separately - the model module was a single
 * 2,298-line file holding all three.
 */

export function listTaskCases(): readonly TaskCaseDefinition[] {
  return freeze([
    singleFileEdit(),
    coordinatedEdit(),
    failedCheckRepair(),
    rollbackRecovery(),
    retryDiagnosisRepair(),
    pathlessWorkspaceQuestion(),
    testImpactQuestion(),
    ownerContextQuestion(),
    packageScriptImpactQuestion(),
    sourceReport(),
    structuredArtifact(),
    incidentSummaryReport(),
    csvSummaryArtifact(),
    releaseNoteReport(),
    metricsSummaryArtifact(),
    ownerRiskSummary(),
    unsupportedArtifactExport(),
    resumeFromContext(),
    resumeAfterCompaction(),
    liveProviderTriage(),
  ]);
}

export function taskCaseDefinition(caseId: TaskCaseId): TaskCaseDefinition | undefined {
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
    expectedEvidenceResultCondition: "complete-proof",
    expectedOutcome: "complete",
    baselineOutcome: "failed",
    baselineFailureCategories: ["verification failed", "repair failed"],
    repairValidationEvidence: {
      status: "passed",
      check: "post-repair focused check",
      originalFailurePreserved: true,
    },
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
      "uses final rollback validation before completion",
      "requires post-repair verification before success",
    ],
    expectedVerification: verification("rollback-repair-check", "post-repair rollback check", "failed"),
    expectedOutput: output("diff", "rollback repair evidence", ["src/alpha.ts", "src/beta.ts"]),
    expectedEvidenceResultCondition: "complete-proof",
    expectedOutcome: "complete",
    baselineOutcome: "failed",
    baselineFailureCategories: ["verification failed", "repair failed"],
    repairValidationEvidence: {
      status: "passed",
      check: "post-repair rollback check",
      originalFailurePreserved: true,
    },
    hostEvaluationCaseId: "parallel-tool-partial-failure",
    failureCategories: ["repair failed", "verification failed"],
  });
}

function retryDiagnosisRepair(): TaskCaseDefinition {
  return baseTask({
    caseId: "retry-diagnosis-repair",
    taskKind: "debug-repair",
    taskPath: "edit",
    shortPrompt: "Diagnose the retry failure and apply the bounded fix.",
    workspace: fixture("retry-diagnosis-repair", [
      ["src/retry.ts", "repair target"],
      ["src/retry.test.ts", "focused failure check"],
      ["src/backoff.ts", "related context"],
    ]),
    allowedTools: ["read", "edit", "verify", "repair"],
    allowedWrites: ["src/retry.ts"],
    successRubric: [
      "preserves the original failed retry check",
      "applies one bounded repair to the retry target",
      "requires post-repair verification before completion",
    ],
    expectedVerification: verification("retry-repair-check", "post-repair retry check", "failed"),
    expectedOutput: output("diff", "retry repair evidence", ["src/retry.ts"]),
    expectedEvidenceResultCondition: "complete-proof",
    expectedOutcome: "complete",
    baselineOutcome: "failed",
    baselineFailureCategories: ["verification failed", "repair failed"],
    repairValidationEvidence: {
      status: "passed",
      check: "post-repair retry check",
      originalFailurePreserved: true,
    },
    hostEvaluationCaseId: "apply-only-negative",
    failureCategories: ["verification failed", "repair failed"],
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
    expectedEvidenceResultCondition: "complete-proof",
    expectedOutcome: "complete",
    baselineOutcome: "blocked",
    baselineFailureCategories: ["context insufficient", "authority missing"],
    hostEvaluationCaseId: "provider-blocked",
    failureCategories: ["context insufficient", "authority missing"],
  });
}

function testImpactQuestion(): TaskCaseDefinition {
  return baseTask({
    caseId: "test-impact-question",
    taskKind: "workspace-understanding",
    taskPath: "tool",
    shortPrompt: "Find the focused check for the flaky cache behavior.",
    workspace: fixture("test-impact-question", [
      ["package.json", "script map"],
      ["src/cache/store.ts", "likely target without prompt path hint"],
      ["src/cache/store.test.ts", "focused verification candidate"],
      ["src/http/client.ts", "nearby but non-target implementation"],
    ]),
    allowedTools: ["read", "search", "verify"],
    allowedWrites: [],
    successRubric: [
      "selects the likely implementation and focused test without a path hint",
      "records nearby context as selected evidence",
      "does not treat target discovery as mutation authority",
    ],
    expectedVerification: verification("cache-test-impact", "context sufficiency check", "blocked"),
    expectedOutput: output("analysis", "ranked cache target and focused check", ["src/cache/store.ts"]),
    expectedEvidenceResultCondition: "complete-proof",
    expectedOutcome: "complete",
    baselineOutcome: "blocked",
    baselineFailureCategories: ["context insufficient", "authority missing"],
    hostEvaluationCaseId: "provider-blocked",
    failureCategories: ["context insufficient", "authority missing"],
  });
}

function ownerContextQuestion(): TaskCaseDefinition {
  return baseTask({
    caseId: "owner-context-question",
    taskKind: "workspace-understanding",
    taskPath: "tool",
    shortPrompt: "Which owner handles report-safe execution receipts?",
    workspace: fixture("owner-context-question", [
      ["src/runtime/execution/executionService.ts", "execution boundary owner"],
      ["src/runtime/execution/receipt.ts", "report-safe receipt owner"],
      ["src/tools/policy/effects.ts", "tool effect policy"],
    ]),
    allowedTools: ["read", "search", "verify"],
    allowedWrites: [],
    successRubric: [
      "resolves the owner domain from workspace evidence",
      "keeps execution receipts separate from task success",
      "reports the verification check needed before completion",
    ],
    expectedVerification: verification("execution-owner-review", "context sufficiency check", "blocked"),
    expectedOutput: output("analysis", "owner domain and receipt boundary", ["src/runtime/execution/receipt.ts"]),
    expectedEvidenceResultCondition: "complete-proof",
    expectedOutcome: "complete",
    baselineOutcome: "blocked",
    baselineFailureCategories: ["context insufficient"],
    hostEvaluationCaseId: "provider-blocked",
    failureCategories: ["context insufficient"],
  });
}

function packageScriptImpactQuestion(): TaskCaseDefinition {
  return baseTask({
    caseId: "package-script-impact-question",
    taskKind: "workspace-understanding",
    taskPath: "tool",
    shortPrompt: "Find which focused script proves the package boundary change.",
    workspace: fixture("package-script-impact-question", [
      ["package.json", "script inventory"],
      ["src/runtime/evaluation/model.ts", "likely implementation target"],
      ["src/runtime/evaluation/model.ts", "focused verification candidate"],
      ["src/runtime/events/projection.ts", "adjacent surface check"],
    ]),
    allowedTools: ["read", "search", "verify"],
    allowedWrites: [],
    successRubric: [
      "discovers the likely owner without a prompt path",
      "selects the focused package script evidence",
      "keeps script discovery separate from write authority",
    ],
    expectedVerification: verification("host-runtime-script-impact", "context sufficiency check", "blocked"),
    expectedOutput: output("analysis", "ranked owner and focused package check", ["src/runtime/evaluation/model.ts"]),
    expectedEvidenceResultCondition: "complete-proof",
    expectedOutcome: "complete",
    baselineOutcome: "blocked",
    baselineFailureCategories: ["context insufficient", "verification not selected"],
    hostEvaluationCaseId: "provider-blocked",
    failureCategories: ["context insufficient", "verification not selected"],
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
    expectedEvidenceResultCondition: "complete-proof",
    expectedOutcome: "complete",
    baselineOutcome: "failed",
    baselineFailureCategories: ["artifact invalid"],
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
    expectedEvidenceResultCondition: "complete-proof",
    expectedOutcome: "complete",
    baselineOutcome: "failed",
    baselineFailureCategories: ["artifact invalid", "verification failed", "repair failed"],
    hostEvaluationCaseId: "read-only-tool-loop",
    failureCategories: ["artifact invalid", "verification failed"],
  });
}

function incidentSummaryReport(): TaskCaseDefinition {
  return baseTask({
    caseId: "incident-summary-report",
    taskKind: "docs-report",
    taskPath: "artifact",
    shortPrompt: "Write the incident summary from the two safe notes.",
    workspace: fixture("incident-summary-report", [
      ["notes/timeline.md", "incident source"],
      ["notes/impact.md", "incident source"],
      ["reports/incident.md", "expected report output"],
    ]),
    allowedTools: ["read", "write", "verify"],
    allowedWrites: ["reports/incident.md"],
    successRubric: [
      "uses only source-scoped incident facts",
      "writes the requested report path",
      "validates source coverage after correction",
    ],
    expectedVerification: verification("incident-source-check", "source coverage check", "passed"),
    expectedOutput: output("artifact", "markdown incident report", ["reports/incident.md"]),
    expectedEvidenceResultCondition: "complete-proof",
    expectedOutcome: "complete",
    baselineOutcome: "failed",
    baselineFailureCategories: ["artifact invalid"],
    hostEvaluationCaseId: "missing-proof",
    failureCategories: ["artifact invalid"],
  });
}

function csvSummaryArtifact(): TaskCaseDefinition {
  return baseTask({
    caseId: "csv-summary-artifact",
    taskKind: "data-artifact",
    taskPath: "artifact",
    shortPrompt: "Create the JSON summary from the CSV fixture.",
    workspace: fixture("csv-summary-artifact", [
      ["data/orders.csv", "data source"],
      ["artifacts/orders-summary.json", "expected structured artifact"],
    ]),
    allowedTools: ["read", "write", "verify"],
    allowedWrites: ["artifacts/orders-summary.json"],
    successRubric: [
      "parses the CSV source",
      "writes valid JSON at the requested path",
      "validates the summary fields",
    ],
    expectedVerification: verification("orders-json-check", "structured artifact check", "failed"),
    expectedOutput: output("artifact", "orders summary JSON artifact", ["artifacts/orders-summary.json"]),
    expectedEvidenceResultCondition: "complete-proof",
    expectedOutcome: "complete",
    baselineOutcome: "failed",
    baselineFailureCategories: ["artifact invalid", "verification failed"],
    hostEvaluationCaseId: "read-only-tool-loop",
    failureCategories: ["artifact invalid", "verification failed"],
  });
}

function releaseNoteReport(): TaskCaseDefinition {
  return baseTask({
    caseId: "release-note-report",
    taskKind: "docs-report",
    taskPath: "artifact",
    shortPrompt: "Draft the release note from the accepted change notes.",
    workspace: fixture("release-note-report", [
      ["notes/change-summary.md", "release source"],
      ["notes/validation.md", "validation source"],
      ["reports/release-note.md", "expected report output"],
    ]),
    allowedTools: ["read", "write", "verify"],
    allowedWrites: ["reports/release-note.md"],
    successRubric: [
      "uses only accepted source notes",
      "writes the requested release note path",
      "validates scope and required sections",
    ],
    expectedVerification: verification("release-note-source-check", "source coverage check", "passed"),
    expectedOutput: output("artifact", "markdown release note report", ["reports/release-note.md"]),
    expectedEvidenceResultCondition: "complete-proof",
    expectedOutcome: "complete",
    baselineOutcome: "failed",
    baselineFailureCategories: ["artifact invalid"],
    hostEvaluationCaseId: "missing-proof",
    failureCategories: ["artifact invalid"],
  });
}

function metricsSummaryArtifact(): TaskCaseDefinition {
  return baseTask({
    caseId: "metrics-summary-artifact",
    taskKind: "data-artifact",
    taskPath: "artifact",
    shortPrompt: "Create the JSON metrics summary from the fixture rows.",
    workspace: fixture("metrics-summary-artifact", [
      ["data/metrics.csv", "data source"],
      ["data/thresholds.json", "validation source"],
      ["artifacts/metrics-summary.json", "expected structured artifact"],
    ]),
    allowedTools: ["read", "write", "verify"],
    allowedWrites: ["artifacts/metrics-summary.json"],
    successRubric: [
      "parses the metric rows",
      "checks the threshold source",
      "validates the JSON summary format",
    ],
    expectedVerification: verification("metrics-json-check", "structured artifact check", "failed"),
    expectedOutput: output("artifact", "metrics summary JSON artifact", ["artifacts/metrics-summary.json"]),
    expectedEvidenceResultCondition: "complete-proof",
    expectedOutcome: "complete",
    baselineOutcome: "failed",
    baselineFailureCategories: ["artifact invalid", "verification failed"],
    hostEvaluationCaseId: "read-only-tool-loop",
    failureCategories: ["artifact invalid", "verification failed"],
  });
}

function ownerRiskSummary(): TaskCaseDefinition {
  return baseTask({
    caseId: "owner-risk-summary",
    taskKind: "docs-report",
    taskPath: "artifact",
    shortPrompt: "Summarize owner risk from the two review notes.",
    workspace: fixture("owner-risk-summary", [
      ["notes/owner-map.md", "owner source"],
      ["notes/risk-log.md", "risk source"],
      ["reports/owner-risk.md", "expected report output"],
    ]),
    allowedTools: ["read", "write", "verify"],
    allowedWrites: ["reports/owner-risk.md"],
    successRubric: [
      "keeps owner facts source-scoped",
      "writes a concise risk report",
      "validates that every risk has a source receipt",
    ],
    expectedVerification: verification("owner-risk-source-check", "source coverage check", "passed"),
    expectedOutput: output("artifact", "markdown owner risk report", ["reports/owner-risk.md"]),
    expectedEvidenceResultCondition: "complete-proof",
    expectedOutcome: "complete",
    baselineOutcome: "failed",
    baselineFailureCategories: ["artifact invalid"],
    hostEvaluationCaseId: "missing-proof",
    failureCategories: ["artifact invalid"],
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
    expectedEvidenceResultCondition: "complete-proof",
    expectedOutcome: "complete",
    baselineOutcome: "not-proven",
    baselineFailureCategories: ["continuation stale"],
    setupEvaluationCaseIds: ["read-only-tool-loop"],
    hostEvaluationCaseId: "branch-compaction-continuation",
    failureCategories: ["continuation stale"],
  });
}

function resumeAfterCompaction(): TaskCaseDefinition {
  return baseTask({
    caseId: "resume-after-compaction",
    taskKind: "continuation",
    taskPath: "continuation",
    shortPrompt: "Resume from compacted context and finish the owner review.",
    workspace: fixture("resume-after-compaction", [
      ["src/ownerReview.ts", "retained target"],
      ["session/compacted-context", "retained context marker"],
      ["session/open-blockers", "continuation blocker summary"],
    ]),
    allowedTools: ["read", "continue", "verify"],
    allowedWrites: [],
    successRubric: [
      "rebuilds fresh context from retained markers",
      "keeps compacted summary as context rather than proof",
      "reports remaining blockers after freshness check",
    ],
    expectedVerification: verification("compaction-freshness", "continuation freshness check", "passed"),
    expectedOutput: output("continuation", "fresh resumed review facts", ["src/ownerReview.ts"]),
    expectedEvidenceResultCondition: "complete-proof",
    expectedOutcome: "complete",
    baselineOutcome: "not-proven",
    baselineFailureCategories: ["continuation stale"],
    setupEvaluationCaseIds: ["branch-compaction-continuation"],
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

export function claimEvidenceForDefinition(definition: TaskCaseDefinition): readonly {
  readonly claim: string;
  readonly evidenceId?: string;
  readonly sourcePath?: string;
  readonly verificationEvidenceId?: string;
}[] {
  const requiredPaths = new Set(definition.expectedOutput.requiredPaths);
  const sourcePaths = definition.workspace.files
    .filter((file) => !requiredPaths.has(file.path))
    .map((file) => file.path);
  let sourceClaimIndex = 0;
  return definition.successRubric.map((claim) => {
    const normalized = claim.toLowerCase();
    if (normalized.includes("verification") || normalized.includes("validat") || normalized.includes("check")) {
      return {
        claim,
        evidenceId: definition.expectedVerification.verificationId,
        verificationEvidenceId: definition.expectedVerification.verificationId,
      };
    }
    if (normalized.includes("source") && sourcePaths.length > 0) {
      const sourcePath = sourcePaths[Math.min(sourceClaimIndex, sourcePaths.length - 1)];
      sourceClaimIndex += 1;
      return { claim, evidenceId: sourcePath, sourcePath };
    }
    return { claim, evidenceId: `${definition.expectedVerification.verificationId}:${claim}` };
  });
}

function freeze<T>(value: T): T {
  return Object.freeze(value);
}

