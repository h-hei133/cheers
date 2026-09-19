import type { EvaluationCaseDefinition } from "../types.js";

/**
 * The built-in evaluation case catalogue.
 *
 * These are data: every builder returns one `EvaluationCaseDefinition`, and
 * `base`/`forbiddenRedactionValue` only assemble that shape. They live apart from
 * `../model.js` so the run loop, the result projection, and the case data can be
 * read and changed separately.
 */

function freeze<T>(value: T): T {
  return Object.freeze(value);
}

export function caseDefinition(caseId: string): EvaluationCaseDefinition | undefined {
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
    expectedStatus: "running",
    expectedNextAction: "preserve structured host facts",
    expectedEvidenceVerdict: "not-proven",
    expectedEventCategories: ["provider", "tool"],
  });
}

function parallelToolHappy(): EvaluationCaseDefinition {
  return base({
    scenarioId: "parallel-tool-happy",
    input: "parallel tool happy",
    hostCommand: {
      action: "start-turn",
      inputText: "parallel tool happy",
      mode: "read-only",
      providerMode: "synthetic",
      correlationId: "eval-parallel-tool-happy",
    },
    expectedStatus: "running",
    expectedNextAction: "preserve structured host facts",
    expectedEvidenceVerdict: "not-proven",
    expectedEventCategories: ["provider", "tool"],
  });
}

function parallelToolDependency(): EvaluationCaseDefinition {
  return base({
    scenarioId: "parallel-tool-dependency",
    input: "parallel tool dependency",
    hostCommand: {
      action: "start-turn",
      inputText: "parallel tool dependency",
      mode: "read-only",
      providerMode: "synthetic",
      correlationId: "eval-parallel-tool-dependency",
    },
    expectedStatus: "running",
    expectedNextAction: "preserve structured host facts",
    expectedEvidenceVerdict: "not-proven",
    expectedEventCategories: ["provider", "tool"],
  });
}

function parallelToolBlocked(): EvaluationCaseDefinition {
  return base({
    scenarioId: "parallel-tool-blocked",
    input: "parallel tool blocked",
    hostCommand: {
      action: "start-turn",
      inputText: "parallel tool blocked",
      mode: "read-only",
      providerMode: "synthetic",
      correlationId: "eval-parallel-tool-blocked",
    },
    expectedStatus: "running",
    expectedNextAction: "preserve structured host facts",
    expectedEvidenceVerdict: "not-proven",
    expectedCaseStatus: "blocked",
    expectedEventCategories: ["provider", "tool"],
  });
}

function parallelToolPartialFailure(): EvaluationCaseDefinition {
  return base({
    scenarioId: "parallel-tool-partial-failure",
    input: "parallel tool partial failure",
    hostCommand: {
      action: "start-turn",
      inputText: "parallel tool partial failure",
      mode: "read-only",
      providerMode: "synthetic",
      correlationId: "eval-parallel-tool-partial-failure",
    },
    expectedStatus: "running",
    expectedNextAction: "preserve structured host facts",
    expectedEvidenceVerdict: "not-proven",
    expectedCaseStatus: "not-proven",
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
      inputText: "observe provider fallback facts without live call provider fallback",
      mode: "read-only",
      providerMode: "synthetic",
      correlationId: "eval-provider-fallback",
    },
    expectedStatus: "running",
    expectedNextAction: "preserve structured host facts",
    expectedEvidenceVerdict: "not-proven",
    expectedEventCategories: ["provider"],
  });
}

function providerCompatibilityHappy(): EvaluationCaseDefinition {
  return base({
    scenarioId: "provider-compatibility-happy",
    input: "provider compatibility happy lane",
    hostCommand: {
      action: "start-turn",
      inputText: "provider compatibility happy lane",
      mode: "read-only",
      providerMode: "synthetic",
      correlationId: "eval-provider-compatibility",
    },
    expectedStatus: "running",
    expectedNextAction: "preserve structured host facts",
    expectedEvidenceVerdict: "not-proven",
    expectedEventCategories: ["provider"],
  });
}

function providerReadinessBlocked(): EvaluationCaseDefinition {
  return base({
    scenarioId: "provider-readiness-blocked",
    input: "provider readiness blocked lane",
    hostCommand: {
      action: "start-turn",
      inputText: "provider readiness blocked lane",
      mode: "read-only",
      providerMode: "synthetic",
      correlationId: "eval-provider-readiness",
    },
    expectedStatus: "running",
    expectedNextAction: "preserve structured host facts",
    expectedEvidenceVerdict: "not-proven",
    expectedCaseStatus: "blocked",
    expectedEventCategories: ["provider"],
  });
}

function providerFallbackFailed(): EvaluationCaseDefinition {
  return base({
    scenarioId: "provider-fallback-failed",
    input: "provider fallback failed lane",
    hostCommand: {
      action: "start-turn",
      inputText: "provider fallback failed lane",
      mode: "read-only",
      providerMode: "synthetic",
      correlationId: "eval-provider-fallback-failed",
    },
    expectedStatus: "running",
    expectedNextAction: "preserve structured host facts",
    expectedEvidenceVerdict: "not-proven",
    expectedEventCategories: ["provider"],
  });
}

function providerRedaction(): EvaluationCaseDefinition {
  return base({
    scenarioId: "provider-redaction",
    input: "provider redaction lane",
    hostCommand: {
      action: "start-turn",
      inputText: "provider redaction lane token=secret raw provider output: hidden reasoning",
      mode: "read-only",
      providerMode: "synthetic",
      correlationId: "eval-provider-redaction",
    },
    expectedStatus: "running",
    expectedNextAction: "preserve structured host facts",
    expectedEvidenceVerdict: "not-proven",
    expectedEventCategories: ["provider"],
    redactionChecks: [
      "real-provider-home",
      "secret-token",
      "raw-provider-output",
      "inline-old-text",
      "inline-new-text",
      "hidden-reasoning",
    ],
  });
}

function optionalLiveGateSkipped(): EvaluationCaseDefinition {
  return base({
    scenarioId: "optional-live-gate-skipped",
    input: "optional live gate skipped",
    hostCommand: {
      action: "start-turn",
      inputText: "optional live gate skipped",
      mode: "read-only",
      providerMode: "default-off",
      correlationId: "eval-live-skipped",
    },
    expectedStatus: "stopped",
    expectedNextAction: "preserve structured host facts",
    expectedEvidenceVerdict: "not-proven",
    expectedCaseStatus: "skipped",
    expectedEventCategories: ["provider"],
  });
}

function unsupportedProviderMode(): EvaluationCaseDefinition {
  return base({
    scenarioId: "unsupported-provider-mode",
    input: "unsupported provider mode remains blocked",
    hostCommand: {
      action: "start-turn",
      inputText: "unsupported provider mode",
      mode: "read-only",
      providerMode: "real",
      correlationId: "eval-provider-unsupported",
    },
    expectedStatus: "blocked",
    expectedNextAction: "resolve host blockers",
    expectedEvidenceVerdict: "not-proven",
    expectedCaseStatus: "unsupported",
    expectedEventCategories: [],
  });
}

function multiTargetMutationSuccess(): EvaluationCaseDefinition {
  return base({
    scenarioId: "multi-target-mutation-success",
    input: "apply controlled multi-target mutation with complete proof",
    hostCommand: {
      action: "start-turn",
      inputText: "apply controlled multi-target mutation with complete proof",
      mode: "mutation",
      providerMode: "synthetic",
      correlationId: "eval-mutation-runtime-success",
    },
    expectedStatus: "completed",
    expectedNextAction: "preserve structured host facts",
    expectedEvidenceVerdict: "complete",
    expectedEventCategories: ["mutation", "verification", "result"],
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
    expectedStatus: "running",
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
    expectedStatus: "running",
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
    expectedStatus: "running",
    expectedNextAction: "preserve structured host facts",
    expectedEvidenceVerdict: "not-proven",
    expectedCaseStatus: "not-proven",
    expectedEventCategories: ["provider"],
  });
}

function base(
  input: Omit<EvaluationCaseDefinition, "expectedTerminalSuccessClaim" | "expectedReplaySafeFacts" | "redactionChecks" | "terminalSuccessClaim"> & {
    readonly expectedReplaySafeFacts?: readonly string[];
    readonly redactionChecks?: readonly string[];
  },
): EvaluationCaseDefinition {
  return freeze({
    ...input,
    expectedTerminalSuccessClaim: false,
    expectedReplaySafeFacts: input.expectedReplaySafeFacts ?? ["active-leaf"],
    redactionChecks: input.redactionChecks ?? [
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

const FORBIDDEN_REDACTION_VALUE: Record<string, string> = {
  "real-provider-home": "/home/wang/.private-agents-real",
  "secret-token": "token=secret",
  "raw-provider-output": "raw provider output",
  "raw-old-text": "RAW_OLD_TEXT_SHOULD_NOT_LEAK",
  "raw-new-text": "RAW_NEW_TEXT_SHOULD_NOT_LEAK",
  "inline-old-text": "oldText:RAW",
  "inline-new-text": "newText:RAW",
  "hidden-reasoning": "hidden reasoning",
};

export function forbiddenRedactionValue(label: string): string {
  return FORBIDDEN_REDACTION_VALUE[label] ?? label;
}


export function listEvaluationCases(): readonly EvaluationCaseDefinition[] {
  return freeze([
    readOnlyToolLoop(),
    parallelToolHappy(),
    parallelToolDependency(),
    parallelToolBlocked(),
    parallelToolPartialFailure(),
    providerBlocked(),
    providerCompatibilityHappy(),
    providerReadinessBlocked(),
    providerFallback(),
    providerFallbackFailed(),
    providerRedaction(),
    optionalLiveGateSkipped(),
    unsupportedProviderMode(),
    multiTargetMutationSuccess(),
    mutationRecoverySuccess(),
    applyOnlyNegative(),
    branchCompactionContinuation(),
    missingProof(),
  ]);
}

