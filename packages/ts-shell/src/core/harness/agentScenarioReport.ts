import type { AgentScenarioResult } from "./agentScenarioModel.js";

export function renderAgentScenarioReport(result: AgentScenarioResult): string {
  const passedAssertions = result.assertions.filter((item) => item.status === "passed").length;
  const failedAssertions = result.assertions.filter((item) => item.status !== "passed").length;
  const passedSafety = result.safetyChecks.filter((item) => item.status === "passed").length;
  const failedSafety = result.safetyChecks.filter((item) => item.status !== "passed").length;
  return [
    "Agent scenario report",
    `- Scenario: ${result.scenarioId} ${result.name}`,
    `- Status: ${result.status}`,
    `- Steps run: ${result.steps.length}`,
    `- Assertions: ${passedAssertions} passed, ${failedAssertions} failed`,
    `- Safety checks: ${passedSafety} passed, ${failedSafety} failed`,
    `- Sidebar events: ${result.sidebarEvents.length}`,
    `- Compact evidence: ${hasEvidence(result, "compact") ? "present" : "none"}`,
    `- Memory evidence: ${hasEvidence(result, "memory") ? "present" : "none"}`,
    `- Warmup evidence: ${hasEvidence(result, "warmup") ? "present" : "none"}`,
    `- Browser evidence: ${hasEvidence(result, "browser") ? "present" : "none"}`,
    `- Blockers: ${result.blockers.length === 0 ? "none" : result.blockers.join("; ")}`,
    `- Next action: ${result.nextAction ?? "none"}`,
    `- Redactions: ${result.redactions.length === 0 ? "none" : result.redactions.join(", ")}`,
    "",
    "Outputs",
    ...result.outputs.map((output) => `- ${output.stepId}: ${output.lineCount} lines; ${output.preview}`),
  ].join("\n");
}

function hasEvidence(result: AgentScenarioResult, token: string): boolean {
  return result.evidence.some((item) => item.includes(token));
}
