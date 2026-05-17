import type {
  AgentScenarioAssertion,
  AgentScenarioAssertionResult,
  AgentScenarioResult,
  AgentScenarioStatus,
  AgentScenarioStepResult,
} from "./agentScenarioModel.js";

export function evaluateAgentScenarioAssertion(input: {
  readonly assertion: AgentScenarioAssertion;
  readonly steps: readonly AgentScenarioStepResult[];
  readonly sidebarEvents: readonly { readonly title: string }[];
}): AgentScenarioAssertionResult {
  const assertion = input.assertion;
  const output = selectOutput(assertion, input.steps);
  switch (assertion.kind) {
    case "output-contains":
      return passIf(assertion, output.includes(requiredText(assertion)), `Output did not contain ${requiredText(assertion)}.`);
    case "output-not-contains":
      return passIf(assertion, !output.includes(requiredText(assertion)), `Output unexpectedly contained ${requiredText(assertion)}.`);
    case "output-has-section":
      return passIf(assertion, output.split(/\r?\n/).some((line) => line.trim() === requiredSection(assertion)), `Output did not include section ${requiredSection(assertion)}.`);
    case "output-line-count-under":
      return passIf(assertion, output.split(/\r?\n/).length <= (assertion.maxLines ?? 0), `Output exceeded ${assertion.maxLines ?? 0} lines.`);
    case "sidebar-event-emitted":
      return passIf(assertion, input.sidebarEvents.some((event) => event.title === assertion.eventTitle), `Sidebar event ${assertion.eventTitle ?? ""} was not emitted.`);
    case "compact-injected-once":
      return passIf(assertion, countEvidence(input.steps, "compact-future-turn-injection:injected-once") === 1, "Compact context was not injected exactly once.");
    case "memory-injected-once":
      return passIf(assertion, countEvidence(input.steps, "project-memory-future-turn-injection:injected-once") === 1, "Project memory context was not injected exactly once.");
    case "memory-record-saved":
      return passIf(assertion, input.steps.some((step) => /- Memory written:\s*yes/i.test(step.output ?? "")), "No saved memory record was observed.");
    case "invalidated-deleted-memory-excluded":
      return passIf(assertion, /Result count:\s*0/i.test(output), "Invalidated or deleted memory record was still recalled.");
    case "browser-dry-run-executed-no":
      return passIf(assertion, /Executed:\s*no/i.test(output), "Browser dry-run did not report Executed: no.");
    case "next-action-exists":
      return passIf(assertion, /next action|DoNext/i.test(output), "No next action or DoNext guidance was found.");
    case "validation-status-exists":
      return passIf(assertion, /validation/i.test(output) || hasEvidence(input.steps, "validation-status"), "No validation status evidence was found.");
  }
}

export function assertionFailures(
  result: Pick<AgentScenarioResult, "assertions" | "safetyChecks">,
): readonly AgentScenarioAssertionResult[] {
  return [...result.assertions, ...result.safetyChecks].filter((assertion) => assertion.status !== "passed");
}

function selectOutput(
  assertion: AgentScenarioAssertion,
  steps: readonly AgentScenarioStepResult[],
): string {
  if (assertion.stepId) {
    return steps.find((step) => step.stepId === assertion.stepId)?.output ?? "";
  }
  return [...steps].reverse().find((step) => step.output)?.output ?? "";
}

function requiredText(assertion: AgentScenarioAssertion): string {
  if (!assertion.text) {
    throw new Error(`Assertion ${assertion.id} requires text.`);
  }
  return assertion.text;
}

function requiredSection(assertion: AgentScenarioAssertion): string {
  if (!assertion.section) {
    throw new Error(`Assertion ${assertion.id} requires section.`);
  }
  return assertion.section;
}

function passIf(
  assertion: AgentScenarioAssertion,
  condition: boolean,
  failureMessage: string,
): AgentScenarioAssertionResult {
  return {
    assertionId: assertion.id,
    kind: assertion.kind,
    status: condition ? "passed" : "failed",
    message: condition ? "Assertion passed." : failureMessage,
    evidence: ["agent-scenario-assertions:evaluated"],
  };
}

function countEvidence(
  steps: readonly AgentScenarioStepResult[],
  evidence: string,
): number {
  return steps.flatMap((step) => step.evidence).filter((item) => item === evidence).length;
}

function hasEvidence(
  steps: readonly AgentScenarioStepResult[],
  evidence: string,
): boolean {
  return steps.some((step) => step.evidence.some((item) => item.includes(evidence)));
}
