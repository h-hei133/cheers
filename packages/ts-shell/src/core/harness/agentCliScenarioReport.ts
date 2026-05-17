import type { AgentCliScenarioResult } from "./agentCliScenarioModel.js";

export function renderAgentCliScenarioReport(
  result: AgentCliScenarioResult,
): string {
  const passedAssertions = result.assertions.filter((item) => item.status === "passed").length;
  const failedAssertions = result.assertions.filter((item) => item.status !== "passed").length;
  const passedSafety = result.safetyChecks.filter((item) => item.status === "passed").length;
  const failedSafety = result.safetyChecks.filter((item) => item.status !== "passed").length;
  return [
    "Agent CLI scenario report",
    `- Scenario: ${result.scenarioId} ${result.name}`,
    `- Status: ${result.status}`,
    `- Steps run: ${result.steps.length}`,
    `- Assertions: ${passedAssertions} passed, ${failedAssertions} failed`,
    `- Safety checks: ${passedSafety} passed, ${failedSafety} failed`,
    `- Blockers: ${result.blockers.length === 0 ? "none" : result.blockers.join("; ")}`,
    `- Next action: ${result.nextAction ?? "none"}`,
    `- Redactions: ${result.redactions.length === 0 ? "none" : result.redactions.join(", ")}`,
    "",
    "Steps",
    ...result.steps.map((step) =>
      [
        `- ${step.stepId}: ${step.status}`,
        `  prompt: ${step.process.spec.promptSummary}`,
        `  exit: ${step.process.exitCode ?? "null"} signal=${step.process.signal ?? "none"} timeout=${step.process.timedOut ? "yes" : "no"}`,
        `  output: stdout=${step.process.output.stdoutLineCount} lines stderr=${step.process.output.stderrLineCount} lines`,
      ].join("\n"),
    ),
  ].join("\n");
}
