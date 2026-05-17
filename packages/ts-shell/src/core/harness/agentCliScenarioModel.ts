export type AgentCliScenarioStatus = "passed" | "failed" | "blocked" | "skipped";

export interface AgentCliScenario {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly metadata?: AgentCliScenarioMetadata;
  readonly steps: readonly AgentCliScenarioStep[];
  readonly expectedOutcome?: AgentCliExpectedOutcome;
  readonly continueOnFailure?: boolean;
}

export interface AgentCliScenarioMetadata {
  readonly route?: string;
  readonly capability?: readonly string[];
  readonly references?: readonly string[];
}

export type AgentCliScenarioStep = AgentCliCommandStep;

export interface AgentCliCommandStep {
  readonly id: string;
  readonly name?: string;
  readonly kind: "cli-command";
  readonly prompt: string;
  readonly args?: readonly string[];
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly timeoutMs?: number;
  readonly critical?: boolean;
  readonly expectedExit?: AgentCliExpectedExit;
  readonly assertions?: readonly AgentCliAssertion[];
}

export type AgentCliExpectedExit =
  | { readonly kind: "code"; readonly code: number }
  | { readonly kind: "any-zero" }
  | { readonly kind: "non-zero" }
  | { readonly kind: "any" };

export interface AgentCliExpectedOutcome {
  readonly status: AgentCliScenarioStatus;
  readonly assertions?: readonly AgentCliAssertion[];
}

export interface AgentCliProcessSpec {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly stdin?: string;
  readonly timeoutMs: number;
  readonly promptSummary: string;
}

export interface AgentCliOutputCapture {
  readonly stdout: string;
  readonly stderr: string;
  readonly combined: string;
  readonly stdoutLineCount: number;
  readonly stderrLineCount: number;
  readonly combinedLineCount: number;
}

export interface AgentCliProcessResult {
  readonly spec: AgentCliProcessSpec;
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly timedOut: boolean;
  readonly durationMs: number;
  readonly output: AgentCliOutputCapture;
  readonly evidence: readonly string[];
  readonly warnings: readonly string[];
  readonly redactions: readonly string[];
}

export type AgentCliAssertionKind =
  | "exit-code"
  | "stdout-contains"
  | "stdout-not-contains"
  | "stderr-contains"
  | "stderr-not-contains"
  | "output-has-section"
  | "output-line-count-under"
  | "executed-no"
  | "executed-yes"
  | "browser-execution-blocked"
  | "browser-receipt-exists"
  | "browser-receipt-status"
  | "browser-receipt-executed"
  | "browser-receipt-replay-readiness"
  | "browser-receipt-safe"
  | "browser-receipt-decisions"
  | "browser-receipt-local-test-scoped"
  | "browser-receipt-next-action"
  | "sidebar-panel-exists"
  | "no-raw-content-or-secrets"
  | "no-provider-model-browser-network";

export interface AgentCliAssertion {
  readonly id: string;
  readonly kind: AgentCliAssertionKind;
  readonly stepId?: string;
  readonly text?: string;
  readonly section?: string;
  readonly maxLines?: number;
  readonly expectedExit?: AgentCliExpectedExit;
}

export interface AgentCliAssertionResult {
  readonly assertionId: string;
  readonly kind: AgentCliAssertionKind | "safety";
  readonly status: AgentCliScenarioStatus;
  readonly message: string;
  readonly evidence: readonly string[];
}

export interface AgentCliScenarioStepResult {
  readonly stepId: string;
  readonly status: AgentCliScenarioStatus;
  readonly process: AgentCliProcessResult;
  readonly assertions: readonly AgentCliAssertionResult[];
  readonly evidence: readonly string[];
  readonly warnings: readonly string[];
  readonly blockers: readonly string[];
}

export interface AgentCliScenarioResult {
  readonly scenarioId: string;
  readonly name: string;
  readonly status: AgentCliScenarioStatus;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly steps: readonly AgentCliScenarioStepResult[];
  readonly assertions: readonly AgentCliAssertionResult[];
  readonly safetyChecks: readonly AgentCliAssertionResult[];
  readonly evidence: readonly string[];
  readonly warnings: readonly string[];
  readonly blockers: readonly string[];
  readonly nextAction?: string;
  readonly redactions: readonly string[];
}

export function deterministicCliScenarioTimestamp(index = 0): string {
  return new Date(Date.UTC(2026, 4, 17, 1, 0, index)).toISOString();
}

export function summarizeCliPrompt(prompt: string): string {
  return prompt.trim().replace(/\s+/g, " ").slice(0, 120);
}

export function captureCliOutput(input: {
  readonly stdout: string;
  readonly stderr: string;
}): AgentCliOutputCapture {
  const combined = [input.stdout, input.stderr].filter(Boolean).join("\n");
  return {
    stdout: input.stdout,
    stderr: input.stderr,
    combined,
    stdoutLineCount: countLines(input.stdout),
    stderrLineCount: countLines(input.stderr),
    combinedLineCount: countLines(combined),
  };
}

export function mergeCliEvidence(
  values: readonly (readonly string[] | undefined)[],
): readonly string[] {
  return Array.from(new Set(values.flatMap((value) => value ?? [])));
}

function countLines(value: string): number {
  return value.length === 0 ? 0 : value.split(/\r?\n/).length;
}
