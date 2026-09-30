import type { CommandContext, CommandExecutionResult } from "../../core/commands/types.js";
import type { SidebarEvent } from "../../presentation/sidebar/sidebarEventModel.js";

export type AgentScenarioStatus = "passed" | "failed" | "blocked" | "skipped";
export type AgentScenarioStepKind =
  | "command"
  | "simulated-user-turn"
  | "assertion"
  | "fixture"
  | "checkpoint";

export interface AgentScenario {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly metadata?: AgentScenarioMetadata;
  readonly steps: readonly AgentScenarioStep[];
  readonly expectedOutcome?: AgentScenarioExpectedOutcome;
  readonly continueOnFailure?: boolean;
}

export interface AgentScenarioMetadata {
  readonly route?: string;
  readonly capability?: readonly string[];
  readonly references?: readonly string[];
}

export type AgentScenarioStep =
  | AgentScenarioCommandStep
  | AgentScenarioUserTurnStep
  | AgentScenarioAssertionStep
  | AgentScenarioFixtureStep
  | AgentScenarioCheckpointStep;

export interface AgentScenarioStepBase {
  readonly id: string;
  readonly name?: string;
  readonly kind: AgentScenarioStepKind;
}

export interface AgentScenarioCommandStep extends AgentScenarioStepBase {
  readonly kind: "command";
  readonly input: string;
}

export interface AgentScenarioUserTurnStep extends AgentScenarioStepBase {
  readonly kind: "simulated-user-turn";
  readonly userInput?: string;
  readonly maxCompactContextChars?: number;
  readonly maxMemoryContextChars?: number;
}

export interface AgentScenarioAssertionStep extends AgentScenarioStepBase {
  readonly kind: "assertion";
  readonly assertion: AgentScenarioAssertion;
}

export interface AgentScenarioFixtureStep extends AgentScenarioStepBase {
  readonly kind: "fixture";
  readonly fixture: "seed-memory-record" | "validation-evidence" | "route-metadata";
  readonly recordId?: string;
}

export interface AgentScenarioCheckpointStep extends AgentScenarioStepBase {
  readonly kind: "checkpoint";
  readonly label: string;
}

export type AgentScenarioAssertionKind =
  | "output-contains"
  | "output-not-contains"
  | "output-has-section"
  | "output-line-count-under"
  | "sidebar-event-emitted"
  | "compact-injected-once"
  | "memory-injected-once"
  | "memory-record-saved"
  | "invalidated-deleted-memory-excluded"
  | "browser-dry-run-executed-no"
  | "next-action-exists"
  | "validation-status-exists";

export interface AgentScenarioAssertion {
  readonly id: string;
  readonly kind: AgentScenarioAssertionKind;
  readonly stepId?: string;
  readonly text?: string;
  readonly section?: string;
  readonly maxLines?: number;
  readonly eventTitle?: string;
  readonly recordId?: string;
}

export interface AgentScenarioExpectedOutcome {
  readonly status: AgentScenarioStatus;
  readonly assertions?: readonly AgentScenarioAssertion[];
}

export interface AgentScenarioContext {
  readonly cwd: string;
  readonly sessionId: string;
  readonly sessionScopeId: string;
  readonly commandContext: CommandContext;
  readonly now: () => string;
  readonly nextId: (prefix: string) => string;
  readonly cleanup?: () => void;
}

export interface AgentScenarioStepResult {
  readonly stepId: string;
  readonly kind: AgentScenarioStepKind;
  readonly status: AgentScenarioStatus;
  readonly output?: string;
  readonly commandResult?: CommandExecutionResult | null;
  readonly assertions: readonly AgentScenarioAssertionResult[];
  readonly evidence: readonly string[];
  readonly warnings: readonly string[];
  readonly blockers: readonly string[];
}

export interface AgentScenarioAssertionResult {
  readonly assertionId: string;
  readonly kind: AgentScenarioAssertionKind | "safety";
  readonly status: AgentScenarioStatus;
  readonly message: string;
  readonly evidence: readonly string[];
}

export interface AgentScenarioResult {
  readonly scenarioId: string;
  readonly name: string;
  readonly status: AgentScenarioStatus;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly steps: readonly AgentScenarioStepResult[];
  readonly outputs: readonly AgentScenarioOutputSummary[];
  readonly assertions: readonly AgentScenarioAssertionResult[];
  readonly safetyChecks: readonly AgentScenarioAssertionResult[];
  readonly sidebarEvents: readonly SidebarEvent[];
  readonly evidence: readonly string[];
  readonly warnings: readonly string[];
  readonly blockers: readonly string[];
  readonly nextAction?: string;
  readonly redactions: readonly string[];
}

export interface AgentScenarioOutputSummary {
  readonly stepId: string;
  readonly kind: AgentScenarioStepKind;
  readonly lineCount: number;
  readonly preview: string;
}

export function deterministicScenarioTimestamp(index = 0): string {
  return new Date(Date.UTC(2026, 4, 17, 0, 0, index)).toISOString();
}

export function scenarioSessionScopeId(sessionId: string): string {
  return `session:${sessionId}`;
}

export function summarizeScenarioOutput(input: {
  readonly stepId: string;
  readonly kind: AgentScenarioStepKind;
  readonly output?: string;
}): AgentScenarioOutputSummary {
  const output = input.output ?? "";
  return {
    stepId: input.stepId,
    kind: input.kind,
    lineCount: output ? output.split(/\r?\n/).length : 0,
    preview: output.split(/\r?\n/).filter(Boolean).slice(0, 4).join(" | "),
  };
}

export function mergeScenarioEvidence(
  values: readonly (readonly string[] | undefined)[],
): readonly string[] {
  return Array.from(new Set(values.flatMap((value) => value ?? [])));
}
