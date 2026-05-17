import type {
  AgentCliAssertion,
  AgentCliAssertionResult,
  AgentCliExpectedExit,
  AgentCliProcessResult,
  AgentCliScenarioStepResult,
  AgentCliScenarioStatus,
} from "./agentCliScenarioModel.js";

export function evaluateAgentCliAssertion(input: {
  readonly assertion: AgentCliAssertion;
  readonly process: AgentCliProcessResult;
}): AgentCliAssertionResult {
  const { assertion, process } = input;
  const stdout = stripAnsi(process.output.stdout);
  const stderr = stripAnsi(process.output.stderr);
  const output = stripAnsi(process.output.combined);

  switch (assertion.kind) {
    case "exit-code":
      return passIf(assertion, exitMatches(process, assertion.expectedExit ?? { kind: "code", code: 0 }), "Process exit did not match expected exit.");
    case "stdout-contains":
      return passIf(assertion, stdout.includes(requiredText(assertion)), `stdout did not contain ${requiredText(assertion)}.`);
    case "stdout-not-contains":
      return passIf(assertion, !stdout.includes(requiredText(assertion)), `stdout unexpectedly contained ${requiredText(assertion)}.`);
    case "stderr-contains":
      return passIf(assertion, stderr.includes(requiredText(assertion)), `stderr did not contain ${requiredText(assertion)}.`);
    case "stderr-not-contains":
      return passIf(assertion, !stderr.includes(requiredText(assertion)), `stderr unexpectedly contained ${requiredText(assertion)}.`);
    case "output-has-section":
      return passIf(assertion, output.split(/\r?\n/).some((line) => line.trim() === requiredSection(assertion)), `Output did not include section ${requiredSection(assertion)}.`);
    case "output-line-count-under":
      return passIf(assertion, process.output.combinedLineCount <= (assertion.maxLines ?? 0), `Output exceeded ${assertion.maxLines ?? 0} lines.`);
    case "executed-no":
      return passIf(assertion, /Executed:\s*no/i.test(output), "Command did not report Executed: no.");
    case "executed-yes":
      return passIf(assertion, /Executed:\s*yes/i.test(output), "Command did not report Executed: yes.");
    case "browser-execution-blocked":
      return passIf(assertion, /Browser execution/i.test(output) && /Outcome:\s*blocked/i.test(output), "Browser execution was not blocked.");
    case "sidebar-panel-exists":
      return passIf(assertion, /Visible agent state panel/i.test(output), "Sidebar panel output was not observed.");
    case "no-raw-content-or-secrets":
      return passIf(assertion, !hasRawContentOrSecrets(output), "Raw content or secret-looking output was exposed.");
    case "no-provider-model-browser-network":
      return passIf(assertion, hasNoProviderBrowserNetworkEvidence(output), "Output did not preserve provider/browser/network safety evidence.");
  }
}

export function runAgentCliSafetyChecks(
  process: AgentCliProcessResult,
): readonly AgentCliAssertionResult[] {
  return [
    evaluateAgentCliAssertion({
      assertion: { id: "safety-no-raw-content-or-secrets", kind: "no-raw-content-or-secrets" },
      process,
    }),
    evaluateAgentCliAssertion({
      assertion: { id: "safety-no-provider-model-browser-network", kind: "no-provider-model-browser-network" },
      process,
    }),
  ].map((result) => ({ ...result, kind: "safety" as const }));
}

export function agentCliAssertionFailures(
  result: {
    readonly assertions: readonly AgentCliAssertionResult[];
    readonly safetyChecks: readonly AgentCliAssertionResult[];
  },
): readonly AgentCliAssertionResult[] {
  return [...result.assertions, ...result.safetyChecks].filter((assertion) => assertion.status !== "passed");
}

export function selectCliProcessForAssertion(
  assertion: AgentCliAssertion,
  steps: readonly AgentCliScenarioStepResult[],
): AgentCliProcessResult | undefined {
  if (assertion.stepId) {
    return steps.find((step) => step.stepId === assertion.stepId)?.process;
  }
  return [...steps].reverse().find((step) => step.process)?.process;
}

function exitMatches(
  process: AgentCliProcessResult,
  expected: AgentCliExpectedExit,
): boolean {
  if (process.timedOut) {
    return false;
  }
  if (expected.kind === "any") {
    return true;
  }
  if (expected.kind === "any-zero") {
    return process.exitCode === 0;
  }
  if (expected.kind === "non-zero") {
    return process.exitCode !== null && process.exitCode !== 0;
  }
  return process.exitCode === expected.code;
}

function hasRawContentOrSecrets(value: string): boolean {
  const checkableValue = value
    .split(/\r?\n/)
    .filter((line) => !/\b(excluded|redacted|redactions?)\b/i.test(line))
    .join("\n");
  return /\bRAW_[A-Z0-9_]+\b/.test(checkableValue) ||
    /\b(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/.test(checkableValue) ||
    /\b(hidden reasoning|chain[- ]?of[- ]?thought)\b/i.test(checkableValue) ||
    /\b(provider credential|api key|auth token)\s*[:=]\s*\S+/i.test(checkableValue);
}

function hasNoProviderBrowserNetworkEvidence(value: string): boolean {
  for (const line of value.split(/\r?\n/)) {
    const normalized = line.trim();
    if (/^Provider\/model call:\s*(?!none\b)/i.test(normalized)) {
      return false;
    }
    if (/^Browser process:\s*(?!not launched\b)/i.test(normalized)) {
      return false;
    }
    if (/^Network access:\s*(?!none\b)/i.test(normalized)) {
      return false;
    }
    if (/^MCP discovery\/launch:\s*(?!none\b)/i.test(normalized)) {
      return false;
    }
  }
  const localFixtureExecution =
    /Mode:\s*local-fixture/i.test(value) &&
    /Browser process:\s*local fixture only/i.test(value) &&
    /MCP discovery\/launch:\s*none/i.test(value) &&
    /Provider\/model call:\s*none/i.test(value);
  if (/browser process:\s*(launched|started)|real browser execution:\s*yes/i.test(value)) {
    return false;
  }
  if (/executed:\s*yes/i.test(value) && !localFixtureExecution) {
    return false;
  }
  return true;
}

function requiredText(assertion: AgentCliAssertion): string {
  if (!assertion.text) {
    throw new Error(`Assertion ${assertion.id} requires text.`);
  }
  return assertion.text;
}

function requiredSection(assertion: AgentCliAssertion): string {
  if (!assertion.section) {
    throw new Error(`Assertion ${assertion.id} requires section.`);
  }
  return assertion.section;
}

function passIf(
  assertion: AgentCliAssertion,
  condition: boolean,
  failureMessage: string,
): AgentCliAssertionResult {
  return {
    assertionId: assertion.id,
    kind: assertion.kind,
    status: condition ? "passed" : "failed",
    message: condition ? "Assertion passed." : failureMessage,
    evidence: ["agent-cli-scenario-assertions:evaluated"],
  };
}

function stripAnsi(value: string): string {
  return value.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
}
