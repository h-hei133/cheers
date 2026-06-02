import type { HostCommandBlocker, HostCommandResponse } from "../api/host/contract.js";

export type EvaluationCaseId =
  | "read-only-tool-loop"
  | "provider-blocked"
  | "provider-fallback"
  | "mutation-recovery-success"
  | "apply-only-negative"
  | "branch-compaction-continuation"
  | "missing-proof";

export interface EvaluationCaseDefinition {
  readonly scenarioId: EvaluationCaseId;
  readonly input: string;
  readonly hostCommand: unknown;
  readonly expectedStatus: string;
  readonly expectedNextAction: string;
  readonly expectedTerminalSuccessClaim: false;
  readonly expectedEvidenceVerdict: string;
  readonly expectedEventCategories: readonly string[];
  readonly expectedReplaySafeFacts: readonly string[];
  readonly redactionChecks: readonly string[];
  readonly terminalSuccessClaim: false;
}

export interface EvaluationCaseResult {
  readonly scenarioId: EvaluationCaseId;
  readonly status: "passed" | "failed" | "blocked";
  readonly hostResponse: HostCommandResponse;
  readonly expectedStatus: string;
  readonly observedStatus: string;
  readonly expectedNextAction: string;
  readonly observedNextAction: string;
  readonly expectedTerminalSuccessClaim: false;
  readonly observedTerminalSuccessClaim: false;
  readonly expectedEvidenceVerdict: string;
  readonly observedEvidenceVerdict: string;
  readonly eventCount: number;
  readonly eventCategories: readonly string[];
  readonly replaySafeFacts: readonly string[];
  readonly redactionChecks: readonly {
    readonly label: string;
    readonly passed: boolean;
  }[];
  readonly blockers: readonly HostCommandBlocker[];
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export interface EvaluationSuiteResult {
  readonly suiteId: "deterministic-host-evaluation";
  readonly results: readonly EvaluationCaseResult[];
  readonly passedCount: number;
  readonly blockedCount: number;
  readonly failedCount: number;
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export async function runEvaluationCase(input: {
  readonly caseId: string;
  readonly dispatch: (command: unknown) => Promise<HostCommandResponse>;
}): Promise<EvaluationCaseResult> {
  const definition = caseDefinition(input.caseId);
  if (!definition) {
    const response = await input.dispatch({ action: "get-status" });
    return freeze({
      scenarioId: "provider-blocked",
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
    "provider-blocked",
    "provider-fallback",
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
    failedCount: results.filter((result) => result.status === "failed").length,
    terminalSuccessClaim: false,
    notProvenClaims: unique([
      "terminal-success",
      "evaluation-suite-executed-is-not-success",
      ...results.flatMap((result) => result.notProvenClaims),
    ]),
  });
}

export function listEvaluationCases(): readonly EvaluationCaseDefinition[] {
  return freeze([
    readOnlyToolLoop(),
    providerBlocked(),
    providerFallback(),
    mutationRecoverySuccess(),
    applyOnlyNegative(),
    branchCompactionContinuation(),
    missingProof(),
  ]);
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
  return freeze({
    scenarioId: definition.scenarioId,
    status: passed ? "passed" : response.blockers.length > 0 ? "blocked" : "failed",
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

function caseDefinition(caseId: string): EvaluationCaseDefinition | undefined {
  return listEvaluationCases().find((definition) => definition.scenarioId === caseId);
}

function readOnlyToolLoop(): EvaluationCaseDefinition {
  return base({
    scenarioId: "read-only-tool-loop",
    input: "read a safe file and continue",
    hostCommand: {
      action: "start-turn",
      inputText: "read a safe file and continue",
      mode: "read-only",
      providerMode: "synthetic",
      correlationId: "eval-read-only",
    },
    expectedStatus: "stopped",
    expectedNextAction: "preserve structured host facts",
    expectedEvidenceVerdict: "not-proven",
    expectedEventCategories: ["provider", "tool"],
  });
}

function providerBlocked(): EvaluationCaseDefinition {
  return base({
    scenarioId: "provider-blocked",
    input: "provider should stay default off",
    hostCommand: {
      action: "start-turn",
      inputText: "provider should stay default off",
      mode: "read-only",
      providerMode: "default-off",
      correlationId: "eval-provider-blocked",
    },
    expectedStatus: "stopped",
    expectedNextAction: "preserve structured host facts",
    expectedEvidenceVerdict: "not-proven",
    expectedEventCategories: ["provider"],
  });
}

function providerFallback(): EvaluationCaseDefinition {
  return base({
    scenarioId: "provider-fallback",
    input: "observe provider fallback facts without live call",
    hostCommand: {
      action: "start-turn",
      inputText: "observe provider fallback facts without live call",
      mode: "read-only",
      providerMode: "synthetic",
      correlationId: "eval-provider-fallback",
    },
    expectedStatus: "stopped",
    expectedNextAction: "preserve structured host facts",
    expectedEvidenceVerdict: "not-proven",
    expectedEventCategories: ["provider"],
  });
}

function mutationRecoverySuccess(): EvaluationCaseDefinition {
  return base({
    scenarioId: "mutation-recovery-success",
    input: "apply controlled mutation with complete proof",
    hostCommand: {
      action: "start-turn",
      inputText: "apply controlled mutation with complete proof",
      mode: "mutation",
      providerMode: "synthetic",
      correlationId: "eval-mutation-success",
    },
    expectedStatus: "completed",
    expectedNextAction: "preserve structured host facts",
    expectedEvidenceVerdict: "complete",
    expectedEventCategories: ["mutation", "verification", "result"],
  });
}

function applyOnlyNegative(): EvaluationCaseDefinition {
  return base({
    scenarioId: "apply-only-negative",
    input: "apply controlled mutation missing proof oldText:RAW newText:RAW",
    hostCommand: {
      action: "start-turn",
      inputText: "apply controlled mutation missing proof oldText:RAW newText:RAW",
      mode: "mutation",
      providerMode: "synthetic",
      correlationId: "eval-apply-negative",
    },
    expectedStatus: "blocked",
    expectedNextAction: "resolve blockers",
    expectedEvidenceVerdict: "not-proven",
    expectedEventCategories: ["mutation", "verification"],
  });
}

function branchCompactionContinuation(): EvaluationCaseDefinition {
  return base({
    scenarioId: "branch-compaction-continuation",
    input: "continue active branch with retained compaction facts",
    hostCommand: {
      action: "continue-session",
      sessionId: "host-session-1",
      inputText: "continue active branch with retained compaction facts",
      mode: "read-only",
      continuationChoice: "active-leaf",
      providerMode: "synthetic",
      correlationId: "eval-continuation",
    },
    expectedStatus: "stopped",
    expectedNextAction: "preserve structured host facts",
    expectedEvidenceVerdict: "not-proven",
    expectedEventCategories: ["session", "provider"],
  });
}

function missingProof(): EvaluationCaseDefinition {
  return base({
    scenarioId: "missing-proof",
    input: "missing proof stays not proven",
    hostCommand: {
      action: "start-turn",
      inputText: "missing proof stays not proven",
      mode: "read-only",
      providerMode: "synthetic",
      correlationId: "eval-missing-proof",
    },
    expectedStatus: "stopped",
    expectedNextAction: "preserve structured host facts",
    expectedEvidenceVerdict: "not-proven",
    expectedEventCategories: ["provider"],
  });
}

function base(input: Omit<EvaluationCaseDefinition, "expectedTerminalSuccessClaim" | "expectedReplaySafeFacts" | "redactionChecks" | "terminalSuccessClaim">): EvaluationCaseDefinition {
  return freeze({
    ...input,
    expectedTerminalSuccessClaim: false,
    expectedReplaySafeFacts: ["active-leaf"],
    redactionChecks: [
      "real-provider-home",
      "raw-old-text",
      "raw-new-text",
      "inline-old-text",
      "inline-new-text",
      "hidden-reasoning",
    ],
    terminalSuccessClaim: false,
  });
}

function forbiddenRedactionValue(label: string): string {
  if (label === "real-provider-home") return "/home/wang/.private-agents-real";
  if (label === "raw-old-text") return "RAW_OLD_TEXT_SHOULD_NOT_LEAK";
  if (label === "raw-new-text") return "RAW_NEW_TEXT_SHOULD_NOT_LEAK";
  if (label === "inline-old-text") return "oldText:RAW";
  if (label === "inline-new-text") return "newText:RAW";
  if (label === "hidden-reasoning") return "hidden reasoning";
  return label;
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
