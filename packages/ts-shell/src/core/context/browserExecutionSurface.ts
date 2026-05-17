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
    `- Browser process: ${browserProcessLabel(result.executorResult.executorKind)}`,
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

function browserProcessLabel(kind: BrowserExecutionResult["executorResult"]["executorKind"]): string {
  if (kind === "fake-test") {
    return "fake/test only";
  }
  if (kind === "local-fixture") {
    return "local fixture only";
  }
  return "not launched";
}

function renderEvidence(result: BrowserExecutionResult): string {
  const values = result.executorResult.evidence
    .map((item) => `${sanitizeBrowserText(item.label)}=${sanitizeBrowserText(item.value)}`)
    .slice(0, 6);
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
