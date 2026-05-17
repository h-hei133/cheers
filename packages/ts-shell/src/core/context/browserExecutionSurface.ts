import { sanitizeBrowserText } from "./browserCapabilityModel.js";
import type { BrowserExecutionResult } from "./browserExecutionResult.js";

export function renderBrowserExecutionSurface(
  result: BrowserExecutionResult,
): string {
  const lines = [
    "Browser execution",
    `- Outcome: ${result.outcome}`,
    `- Action: ${result.request.actionKind}`,
    `- Mode: ${result.request.mode}`,
    `- Runtime: ${sanitizeBrowserText(result.executorResult.runtime)}`,
    `- Policy decision: ${result.policy.status}`,
    `- Reason: ${sanitizeBrowserText(result.policy.reason)}`,
    `- Executed: ${result.executed ? "yes" : "no"}`,
    `- Browser process: ${result.executorResult.executorKind === "fake-test" ? "fake/test only" : "not launched"}`,
    "- MCP discovery/launch: none",
    "- Provider/model call: none",
    "- Persistence: none",
    "- Raw content: excluded",
    `- Evidence: ${renderEvidence(result)}`,
    `- Warnings/blockers: ${renderWarnings(result)}`,
    `- Next action: ${sanitizeBrowserText(result.nextAction)}`,
  ];
  return lines.join("\n");
}

function renderEvidence(result: BrowserExecutionResult): string {
  const values = result.executorResult.evidence
    .map((item) => `${sanitizeBrowserText(item.label)}=${sanitizeBrowserText(item.value)}`)
    .slice(0, 4);
  return values.length > 0 ? values.join("; ") : "none";
}

function renderWarnings(result: BrowserExecutionResult): string {
  if (result.warnings.length > 0) {
    return result.warnings.map((warning) => sanitizeBrowserText(warning)).join("; ");
  }
  if (!result.policy.allowed) {
    return sanitizeBrowserText(result.policy.reason);
  }
  return "none";
}
