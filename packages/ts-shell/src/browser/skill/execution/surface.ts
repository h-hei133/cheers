import { sanitizeBrowserText } from "../../capabilityModel.js";
import type { BrowserExecutionResult } from "../../executionResult.js";

export function renderBrowserSkillExecutionSurface(
  result: BrowserExecutionResult,
): string {
  return [
    "Skill-managed browser execution",
    `- Skill id/name: ${evidenceValue(result, "skill id") ?? "none"} / ${evidenceValue(result, "skill name") ?? "none"}`,
    `- Binding mode: ${evidenceValue(result, "skill binding mode") ?? "none"}`,
    `- Action: ${result.request.actionKind}`,
    `- Execution status: ${evidenceValue(result, "runner status") ?? result.outcome}`,
    `- Evidence summary: ${skillEvidenceSummary(result)}`,
    `- Receipt status: ${result.receipt.status}`,
    `- Replay readiness: ${result.receipt.replayReadiness.status}`,
    `- Redactions/warnings: ${redactionsAndWarnings(result)}`,
    `- Executed: ${result.executed ? "yes" : "no"}`,
    `- Next action: ${sanitizeBrowserText(result.nextAction, 180)}`,
  ].join("\n");
}

export function hasBrowserSkillExecutionEvidence(
  result: BrowserExecutionResult,
): boolean {
  return evidenceValue(result, "skill execution") === "skill-managed" ||
    result.executorResult.executorKind === "skill-runner";
}

function skillEvidenceSummary(result: BrowserExecutionResult): string {
  return sanitizeBrowserText(
    evidenceValue(result, "safe observation") ??
      evidenceValue(result, "safe extraction") ??
      evidenceValue(result, "stdout summary") ??
      "none",
    180,
  );
}

function redactionsAndWarnings(result: BrowserExecutionResult): string {
  const redactions = result.executorResult.evidence
    .filter((item) => item.label === "redaction")
    .map((item) => sanitizeBrowserText(item.value, 80));
  const values = [...redactions, ...result.warnings].slice(0, 5);
  return values.length > 0 ? values.join("; ") : "none";
}

function evidenceValue(result: BrowserExecutionResult, label: string): string | undefined {
  return result.executorResult.evidence.find((item) => item.label === label)?.value;
}
