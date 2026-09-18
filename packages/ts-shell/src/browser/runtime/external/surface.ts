import { sanitizeBrowserText } from "../../capabilityModel.js";
import type { BrowserExecutionResult } from "../../executionResult.js";

export function renderBrowserExternalRunnerSurface(
  result: BrowserExecutionResult,
): string {
  const runnerStatus = evidenceValue(result, "runner status") ?? "not-requested";
  const runnerSource = evidenceValue(result, "runner source") ?? "none";
  const executionMode = evidenceValue(result, "execution mode") ?? result.request.mode;
  const safeObservation = evidenceValue(result, "safe observation") ?? "none";
  const safeExtraction = evidenceValue(result, "safe extraction") ?? "none";
  const timeoutMs = evidenceValue(result, "timeout ms");
  const outputBudgetBytes = evidenceValue(result, "output budget bytes");
  const redactions = result.executorResult.evidence
    .filter((item) => item.label === "redaction")
    .map((item) => sanitizeBrowserText(item.value, 80));
  return [
    "External browser runner",
    `- Mode: ${sanitizeBrowserText(executionMode, 60)}`,
    `- Runner source: ${sanitizeBrowserText(runnerSource, 80)}`,
    `- Request action: ${result.request.actionKind}`,
    `- Execution status: ${sanitizeBrowserText(runnerStatus, 80)}`,
    `- Evidence summary: ${sanitizeBrowserText(safeObservation !== "none" ? safeObservation : safeExtraction, 180)}`,
    `- Timeout/output budget: ${timeoutMs && outputBudgetBytes ? `${timeoutMs}ms/${outputBudgetBytes} bytes` : "manifest-scoped"}`,
    `- Redactions/warnings: ${redactions.length > 0 ? redactions.join(", ") : result.warnings.slice(0, 3).join("; ") || "none"}`,
    `- Executed: ${result.executed ? "yes" : "no"}`,
    `- Next action: ${sanitizeBrowserText(result.nextAction, 180)}`,
  ].join("\n");
}

function evidenceValue(result: BrowserExecutionResult, label: string): string | undefined {
  return result.executorResult.evidence.find((item) => item.label === label)?.value;
}
