import type { AgentCliScenarioResult } from "./agentCliScenarioModel.js";
import { summarizeBrowserSelfHealingApplyCliScenario } from "./browserSelfHealingApplyCliReport.js";

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
    `- Browser repair CLI evidence: ${summarizeBrowserRepairCliEvidence(result)}`,
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

function summarizeBrowserRepairCliEvidence(
  result: AgentCliScenarioResult,
): string {
  if (!result.steps.some((step) => /Browser self-healing apply/i.test(step.process.output.combined))) {
    return "none";
  }
  return summarizeBrowserSelfHealingApplyCliScenario(result)
    .split(/\r?\n/)
    .filter((line) =>
      /^- (Manifest patched|Browser executed|Replay executed automatically|Raw manifest exposed):/i.test(line),
    )
    .map((line) => line.replace(/^- /, ""))
    .join("; ");
}

function summarizeBrowserExecutionEvidence(
  result: AgentCliScenarioResult,
): string {
  const outputs = result.steps
    .map((step) => step.process.output.combined)
    .filter((output) => /Browser execution|Controlled browser network execution|Public read-only web execution|Browser replay|Browser self-healing apply/i.test(output));
  if (outputs.length === 0) {
    return "none";
  }
  const executedYes = outputs.some((output) => /Executed:\s*yes/i.test(output));
  const executedNo = outputs.some((output) => /Executed:\s*no/i.test(output));
  const localFixture = outputs.some((output) => /Mode:\s*local-fixture/i.test(output));
  const playwrightLocal = outputs.some((output) => /Mode:\s*playwright-local/i.test(output));
  const externalRunner = outputs.some((output) => /Mode:\s*(test-local|external-local|skill-managed)/i.test(output));
  const invalidManifest = outputs.some((output) => /Manifest status:\s*invalid/i.test(output));
  const validManifest = outputs.some((output) => /Manifest status:\s*valid/i.test(output));
  const missingManifest = outputs.some((output) => /Manifest status:\s*missing/i.test(output));
  const receipt = outputs.find((output) => /Browser execution receipt/i.test(output));
  const replay = outputs.find((output) => /Browser replay/i.test(output));
  const apply = outputs.find((output) => /Browser self-healing apply/i.test(output));
  const externalNetwork = outputs.find((output) => /External browser execution/i.test(output));
  const controlledNetwork = outputs.find((output) => /Controlled browser network execution/i.test(output));
  const publicReadOnly = outputs.find((output) => /Public read-only web execution/i.test(output));
  const cache = outputs.find((output) => /Browser receipt cache/i.test(output));
  const receiptStatus = receipt?.match(/^- Status:\s*(.+)$/im)?.[1]?.trim() ?? "unknown";
  const replayReadiness = receipt?.match(/^- Replay readiness:\s*(.+)$/im)?.[1]?.trim() ?? "unknown";
  const skillMetadata = outputs.some((output) => /Skill-managed browser runner/i.test(output));
  const skillReadiness = outputs.find((output) => /Skill-managed browser runner/i.test(output))
    ?.match(/^- Metadata status:\s*(.+)$/im)?.[1]?.trim() ?? "unknown";
  const skillExecution = outputs.find((output) => /Skill-managed browser execution/i.test(output));
  const skillBinding = skillExecution?.match(/^- Binding mode:\s*(.+)$/im)?.[1]?.trim() ??
    outputs.find((output) => /Skill binding mode:/i.test(output))?.match(/^- Skill binding mode:\s*(.+)$/im)?.[1]?.trim() ??
    "none";
  const dependencyDecision = outputs.find((output) => /Dependency decision:\s*external-runner-only/i.test(output))
    ? "external-runner-only"
    : "unknown";
  return [
    "present",
    `executed=${executedYes ? "yes" : executedNo ? "no" : "unknown"}`,
    `mode=${externalRunner ? "external-runner" : playwrightLocal ? "playwright-local" : localFixture ? "local-fixture" : "disabled"}`,
    `manifest=${validManifest ? "valid" : invalidManifest ? "invalid" : missingManifest ? "missing" : "unknown"}`,
    `receipt=${receiptStatus}`,
    `replay=${replayReadiness}`,
    `replayCommand=${replay ? replay.match(/^- Replay status:\s*(.+)$/im)?.[1]?.trim() ?? "present" : "none"}`,
    `repair=${replay ? replay.match(/^- Repair readiness:\s*(.+)$/im)?.[1]?.trim() ?? replay.match(/^- Repair needed:\s*(.+)$/im)?.[1]?.trim() ?? "none" : "none"}`,
    `selfHealing=${replay ? summarizeSelfHealing(replay) : "none"}`,
    `repairApply=${apply ? summarizeRepairApply(apply) : "none"}`,
    `externalNetwork=${externalNetwork ? summarizeExternalNetwork(externalNetwork) : "none"}`,
    `controlledNetwork=${controlledNetwork ? summarizeControlledNetwork(controlledNetwork) : "none"}`,
    `publicReadOnly=${publicReadOnly ? summarizePublicReadOnly(publicReadOnly) : "none"}`,
    `receiptCache=${cache ? cache.match(/^- Cache status:\s*(.+)$/im)?.[1]?.trim() ?? "present" : "none"}`,
    `cacheIntegrity=${cache ? cache.match(/^- Integrity:\s*(.+)$/im)?.[1]?.trim() ?? "unknown" : "none"}`,
    `cacheCompaction=${cache ? cache.match(/^- Records before\/after:\s*(.+)$/im)?.[1]?.trim() ?? "none" : "none"}`,
    `skill=${skillMetadata ? skillReadiness : "none"}`,
    `binding=${skillBinding}`,
    `dependency=${dependencyDecision}`,
  ].join("; ");
}

function summarizePublicReadOnly(output: string): string {
  const section = output.split(/Public read-only web execution/i).at(1) ?? output;
  const executed = section.match(/^- Executed:\s*(.+)$/im)?.[1]?.trim() ?? "unknown";
  const status = section.match(/^- Status:\s*(.+)$/im)?.[1]?.trim() ?? "unknown";
  const policy = section.match(/^- Policy:\s*(.+)$/im)?.[1]?.trim() ?? "unknown";
  const egress = section.match(/^- Egress decision:\s*(.+)$/im)?.[1]?.trim() ?? "unknown";
  const audit = section.match(/^- Egress audit:\s*(.+)$/im)?.[1]?.trim() ?? "none";
  return `${executed === "yes" ? "executed" : "blocked"}/${policy}/${status}/egress=${egress}/audit=${audit}`;
}

function summarizeExternalNetwork(output: string): string {
  const outcome = output.match(/^- Outcome:\s*(.+)$/im)?.[1]?.trim() ?? "unknown";
  const runner = output.match(/^- Runner status:\s*(.+)$/im)?.[1]?.trim() ?? "unknown";
  const handoff = output.match(/^- Handoff status:\s*(.+)$/im)?.[1]?.trim() ?? "none";
  const executed = output.match(/^- Executed:\s*(.+)$/im)?.[1]?.trim() ?? "unknown";
  if (handoff !== "none") {
    return `${outcome}/${runner}/handoff=${handoff}/executed=${executed}`;
  }
  return `${outcome}/${runner}/executed=${executed}`;
}

function summarizeControlledNetwork(output: string): string {
  const section = output.split(/Controlled browser network execution/i).at(1) ?? output;
  const executed = section.match(/^- Executed:\s*(.+)$/im)?.[1]?.trim() ?? "unknown";
  const status = section.match(/^- Status:\s*(.+)$/im)?.[1]?.trim() ?? "unknown";
  const policy = section.match(/^- Policy:\s*(.+)$/im)?.[1]?.trim() ?? "unknown";
  const egress = section.match(/^- Egress decision:\s*(.+)$/im)?.[1]?.trim() ?? "unknown";
  const audit = section.match(/^- Egress audit:\s*(.+)$/im)?.[1]?.trim() ?? "none";
  return `${executed === "yes" ? "executed" : "blocked"}/${policy}/${status}/egress=${egress}/audit=${audit}`;
}

function summarizeRepairApply(output: string): string {
  const outcome = output.match(/^- Outcome:\s*(.+)$/im)?.[1]?.trim() ?? "unknown";
  const target = output.match(/^- Target:\s*(.+)$/im)?.[1]?.trim() ?? "unknown";
  const changed = output.match(/^- Metadata\/cache changed:\s*(.+)$/im)?.[1]?.trim() ?? "unknown";
  const manifestPatch = output.match(/^- Manifest patch:\s*(.+)$/im)?.[1]?.trim() ?? "none";
  return `${outcome}/${target}/changed=${changed}/manifestPatch=${manifestPatch}`;
}

function summarizeSelfHealing(output: string): string {
  const proposal = output.match(/^- Proposal:\s*(.+)$/im)?.[1]?.trim();
  const confidence = output.match(/^- Confidence:\s*(.+)$/im)?.[1]?.trim();
  if (!proposal) {
    return "none";
  }
  return `${proposal}${confidence ? `/${confidence}` : ""}`;
}
