import type { HostCommandBlocker, HostCommandResponse } from "../api/host/contract.js";
import {
  caseDefinition,
  forbiddenRedactionValue,
  listEvaluationCases,
} from "./cases/index.js";

export { listEvaluationCases };

import type {
  EvaluationCaseId,
  EvaluationCaseStatus,
  EvaluationCaseDefinition,
  EvaluationCaseResult,
  EvaluationSuiteResult,
} from "./types.js";


export type {
  EvaluationCaseId,
  EvaluationCaseStatus,
  EvaluationCaseDefinition,
  EvaluationCaseResult,
  EvaluationSuiteResult,
} from "./types.js";

export async function runEvaluationCase(input: {
  readonly caseId: string;
  readonly dispatch: (command: unknown) => Promise<HostCommandResponse>;
}): Promise<EvaluationCaseResult> {
  const definition = caseDefinition(input.caseId);
  if (!definition) {
    const response = await input.dispatch({ action: "get-status" });
    return freeze({
      scenarioId: "unsupported-provider-mode",
      status: "blocked",
      hostResponse: response,
      expectedStatus: "known-case",
      observedStatus: "unknown-case",
      expectedNextAction: "select known evaluation case",
      observedNextAction: response.status.nextAction,
      expectedTerminalSuccessClaim: false,
      observedTerminalSuccessClaim: false,
      expectedEvidenceVerdict: "not-proven",
      observedEvidenceVerdict: response.result.evidenceVerdictStatus,
      eventCount: response.events.length,
      eventCategories: [],
      replaySafeFacts: [],
      redactionChecks: [],
      blockers: [
        {
          kind: "invalid-envelope",
          code: "evaluation.case.unknown",
          detail: "evaluation case is not known",
          terminalSuccessClaim: false,
        },
      ],
      terminalSuccessClaim: false,
      notProvenClaims: ["terminal-success", "evaluation-case-executed-is-not-success"],
    });
  }

  const response = await input.dispatch(definition.hostCommand);
  return projectEvaluationResult(definition, response);
}

export async function runEvaluationSuite(input: {
  readonly dispatch: (command: unknown) => Promise<HostCommandResponse>;
  readonly caseIds?: readonly EvaluationCaseId[];
}): Promise<EvaluationSuiteResult> {
  const caseIds = input.caseIds ?? [
    "read-only-tool-loop",
    "parallel-tool-happy",
    "parallel-tool-dependency",
    "parallel-tool-blocked",
    "parallel-tool-partial-failure",
    "provider-blocked",
    "provider-compatibility-happy",
    "provider-readiness-blocked",
    "provider-fallback",
    "provider-fallback-failed",
    "provider-redaction",
    "optional-live-gate-skipped",
    "unsupported-provider-mode",
    "multi-target-mutation-success",
    "mutation-recovery-success",
    "apply-only-negative",
    "branch-compaction-continuation",
    "missing-proof",
  ];
  const results = [];
  for (const caseId of caseIds) {
    results.push(await runEvaluationCase({ caseId, dispatch: input.dispatch }));
  }
  return freeze({
    suiteId: "deterministic-host-evaluation",
    results,
    passedCount: results.filter((result) => result.status === "passed").length,
    blockedCount: results.filter((result) => result.status === "blocked").length,
    unsupportedCount: results.filter((result) => result.status === "unsupported").length,
    skippedCount: results.filter((result) => result.status === "skipped").length,
    notProvenCount: results.filter((result) => result.status === "not-proven").length,
    failedCount: results.filter((result) => result.status === "failed").length,
    terminalSuccessClaim: false,
    notProvenClaims: unique([
      "terminal-success",
      "evaluation-suite-executed-is-not-success",
      ...results.flatMap((result) => result.notProvenClaims),
    ]),
  });
}

function projectEvaluationResult(
  definition: EvaluationCaseDefinition,
  response: HostCommandResponse,
): EvaluationCaseResult {
  const eventCategories = Array.from(
    new Set(response.events.map((event) => categoryFor(event.eventType))),
  ).sort();
  const serialized = JSON.stringify(response);
  const redactionChecks = definition.redactionChecks.map((label) => ({
    label,
    passed: !serialized.includes(forbiddenRedactionValue(label)),
  }));
  const replaySafeFacts = response.details.replayFacts?.retainedFactIds ?? [];
  const passed = response.status.lifecycle === definition.expectedStatus &&
    response.terminalSuccessClaim === false &&
    response.result.evidenceVerdictStatus === definition.expectedEvidenceVerdict &&
    definition.expectedEventCategories.every((category) =>
      eventCategories.includes(category)
    ) &&
    redactionChecks.every((check) => check.passed);
  const status = passed
    ? definition.expectedCaseStatus ?? "passed"
    : response.blockers.length > 0 ? "blocked" : "failed";
  return freeze({
    scenarioId: definition.scenarioId,
    status,
    hostResponse: response,
    expectedStatus: definition.expectedStatus,
    observedStatus: response.status.lifecycle,
    expectedNextAction: definition.expectedNextAction,
    observedNextAction: response.status.nextAction,
    expectedTerminalSuccessClaim: false,
    observedTerminalSuccessClaim: false,
    expectedEvidenceVerdict: definition.expectedEvidenceVerdict,
    observedEvidenceVerdict: response.result.evidenceVerdictStatus,
    eventCount: response.events.length,
    eventCategories,
    replaySafeFacts,
    redactionChecks,
    blockers: response.blockers,
    terminalSuccessClaim: false,
    notProvenClaims: unique([
      "terminal-success",
      "evaluation-case-executed-is-not-success",
      ...response.notProvenClaims,
    ]),
  });
}

function categoryFor(type: string): string {
  if (type.includes("session") || type.includes("continuation") || type.includes("replay")) return "session";
  if (type.includes("provider") || type.includes("model")) return "provider";
  if (type.includes("tool")) return "tool";
  if (type.includes("mutation")) return "mutation";
  if (type.includes("verification") || type.includes("repair")) return "verification";
  if (type.includes("result") || type.includes("verdict") || type.includes("completion")) return "result";
  return "runtime";
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values)).sort();
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      freeze(child);
    }
  }
  return value;
}
