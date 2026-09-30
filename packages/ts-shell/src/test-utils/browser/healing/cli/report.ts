import type { AgentCliScenarioResult } from "../../../cli/model.js";

export interface BrowserSelfHealingApplyCliReportInput {
  readonly scenarioId: string;
  readonly proposalId: string;
  readonly patchKind: string;
  readonly manifestKind: string;
  readonly applyProcessResult: string;
  readonly followUpProcessResult: string;
  readonly manifestPatched: boolean;
  readonly browserExecuted: boolean;
  readonly replayExecutedAutomatically: boolean;
  readonly rawManifestExposed: boolean;
  readonly warningsOrBlockers: readonly string[];
  readonly nextAction: string;
}

export function renderBrowserSelfHealingApplyCliReport(
  input: BrowserSelfHealingApplyCliReportInput,
): string {
  return [
    "Browser self-healing apply CLI repair report",
    `- Scenario: ${safe(input.scenarioId)}`,
    `- Proposal id: ${safe(input.proposalId)}`,
    `- Patch kind: ${safe(input.patchKind)}`,
    `- Manifest kind: ${safe(input.manifestKind)}`,
    `- Apply process result: ${safe(input.applyProcessResult)}`,
    `- Follow-up process result: ${safe(input.followUpProcessResult)}`,
    `- Manifest patched: ${input.manifestPatched ? "yes" : "no"}`,
    `- Browser executed: ${input.browserExecuted ? "yes" : "no"}`,
    `- Replay executed automatically: ${input.replayExecutedAutomatically ? "yes" : "no"}`,
    `- Raw manifest exposed: ${input.rawManifestExposed ? "yes" : "no"}`,
    `- Warnings/blockers: ${input.warningsOrBlockers.length === 0 ? "none" : input.warningsOrBlockers.map((item) => safe(item)).join("; ")}`,
    `- Next action: ${safe(input.nextAction, 240)}`,
  ].join("\n");
}

export function summarizeBrowserSelfHealingApplyCliScenario(
  result: AgentCliScenarioResult,
): string {
  const apply = result.steps.find((step) =>
    /Browser self-healing apply/i.test(step.process.output.combined),
  );
  const followUp = [...result.steps].reverse().find((step) => step.stepId !== apply?.stepId);
  const applyOutput = apply?.process.output.combined ?? "";
  const followUpOutput = followUp?.process.output.combined ?? "";
  const proposalId = applyOutput.match(/^- Proposal id:\s*(.+)$/im)?.[1]?.trim() ?? "unknown";
  const patchKind = applyOutput.match(/^- Patch kind:\s*(.+)$/im)?.[1]?.trim() ?? "unknown";
  const manifestKind = applyOutput.match(/^- Target:\s*(.+)$/im)?.[1]?.trim() ?? "unknown";
  const manifestPatched = /Manifest patch:\s*patch-allowed/i.test(applyOutput) &&
    /Applied:\s*yes/i.test(applyOutput);
  const browserExecuted = /Browser executed:\s*yes/i.test(applyOutput) ||
    /Executed:\s*yes/i.test(applyOutput);
  const replayExecutedAutomatically = /Replay executed:\s*yes/i.test(applyOutput);
  const rawManifestExposed = /RAW_|sk-[A-Za-z0-9_-]{8,}|hidden reasoning|api key/i.test(
    [applyOutput, followUpOutput].join("\n"),
  );
  return renderBrowserSelfHealingApplyCliReport({
    scenarioId: result.scenarioId,
    proposalId,
    patchKind,
    manifestKind,
    applyProcessResult: apply?.status ?? "missing",
    followUpProcessResult: followUp?.status ?? "missing",
    manifestPatched,
    browserExecuted,
    replayExecutedAutomatically,
    rawManifestExposed,
    warningsOrBlockers: [...result.blockers, ...result.warnings],
    nextAction: result.nextAction ?? "Run /browser replay <receipt-id> explicitly if replay is needed.",
  });
}

function safe(value: string, maxLength = 180): string {
  return value.replace(/\s+/g, " ").replace(/[<>]/g, "").slice(0, maxLength);
}
