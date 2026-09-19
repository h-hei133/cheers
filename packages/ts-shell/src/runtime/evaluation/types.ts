import type { HostCommandBlocker, HostCommandResponse } from "../api/host/contract.js";

/**
 * Evaluation case contract.
 *
 * The case ids, definitions, and result shapes shared by the run loop and the case
 * catalogue. A leaf module, so the catalogue depends on the contract rather than on
 * the run loop that consumes it - a type-only import back into `./model.js` is
 * erased at emit, but it becomes a runtime cycle the moment one is a value import.
 */

export type EvaluationCaseId =
  | "read-only-tool-loop"
  | "parallel-tool-happy"
  | "parallel-tool-dependency"
  | "parallel-tool-blocked"
  | "parallel-tool-partial-failure"
  | "provider-blocked"
  | "provider-compatibility-happy"
  | "provider-readiness-blocked"
  | "provider-fallback"
  | "provider-fallback-failed"
  | "provider-redaction"
  | "optional-live-gate-skipped"
  | "unsupported-provider-mode"
  | "multi-target-mutation-success"
  | "mutation-recovery-success"
  | "apply-only-negative"
  | "branch-compaction-continuation"
  | "missing-proof";

export type EvaluationCaseStatus =
  | "passed"
  | "failed"
  | "blocked"
  | "unsupported"
  | "skipped"
  | "not-proven";

export interface EvaluationCaseDefinition {
  readonly scenarioId: EvaluationCaseId;
  readonly input: string;
  readonly hostCommand: unknown;
  readonly expectedStatus: string;
  readonly expectedNextAction: string;
  readonly expectedTerminalSuccessClaim: false;
  readonly expectedEvidenceVerdict: string;
  readonly expectedCaseStatus?: EvaluationCaseStatus;
  readonly expectedEventCategories: readonly string[];
  readonly expectedReplaySafeFacts: readonly string[];
  readonly redactionChecks: readonly string[];
  readonly terminalSuccessClaim: false;
}

export interface EvaluationCaseResult {
  readonly scenarioId: EvaluationCaseId;
  readonly status: EvaluationCaseStatus;
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
  readonly unsupportedCount: number;
  readonly skippedCount: number;
  readonly notProvenCount: number;
  readonly failedCount: number;
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}
