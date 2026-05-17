import type { AgentCliScenarioResult } from "./agentCliScenarioModel.js";

export function renderAgentCliScenarioReport(
  result: AgentCliScenarioResult,
): string {
  const passedAssertions = result.assertions.filter((item) => item.status === "passed").length;
  const failedAssertions = result.assertions.filter((item) => item.status !== "passed").length;
  const passedSafety = result.safetyChecks.filter((item) => item.status === "passed").length;
  const failedSafety = result.safetyChecks.filter((item) => item.status !== "passed").length;
  const browserSummary = summarizeBrowserExecutionEvidence(result);
  return [
    "Agent CLI scenario report",
    `- Scenario: ${result.scenarioId} ${result.name}`,
    `- Status: ${result.status}`,
    `- Steps run: ${result.steps.length}`,
    `- Assertions: ${passedAssertions} passed, ${failedAssertions} failed`,
    `- Safety checks: ${passedSafety} passed, ${failedSafety} failed`,
    `- Browser execution evidence: ${browserSummary}`,
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

function summarizeBrowserExecutionEvidence(
  result: AgentCliScenarioResult,
): string {
  const outputs = result.steps
    .map((step) => step.process.output.combined)
    .filter((output) => /Browser execution/i.test(output));
  if (outputs.length === 0) {
    return "none";
  }
  const executedYes = outputs.some((output) => /Executed:\s*yes/i.test(output));
  const executedNo = outputs.some((output) => /Executed:\s*no/i.test(output));
  const localFixture = outputs.some((output) => /Mode:\s*local-fixture/i.test(output));
  const invalidManifest = outputs.some((output) => /Manifest status:\s*invalid/i.test(output));
  const validManifest = outputs.some((output) => /Manifest status:\s*valid/i.test(output));
  const missingManifest = outputs.some((output) => /Manifest status:\s*missing/i.test(output));
  return [
    "present",
    `executed=${executedYes ? "yes" : executedNo ? "no" : "unknown"}`,
    `mode=${localFixture ? "local-fixture" : "disabled"}`,
    `manifest=${validManifest ? "valid" : invalidManifest ? "invalid" : missingManifest ? "missing" : "unknown"}`,
  ].join("; ");
}
