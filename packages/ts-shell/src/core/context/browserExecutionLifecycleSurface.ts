import { sanitizeBrowserText } from "./browserCapabilityModel.js";
import type { BrowserRuntimePreflight } from "../../browser/runtime/core/preflight.js";
import type { BrowserExecutionResult } from "./browserExecutionResult.js";

export function renderBrowserExecutionLifecycleSurface(input: {
  readonly result: BrowserExecutionResult;
  readonly preflight: BrowserRuntimePreflight;
}): string {
  const { result, preflight } = input;
  return [
    "Browser execution lifecycle",
    `- Mode: ${result.request.mode}`,
    `- Runtime: ${sanitizeBrowserText(result.executorResult.runtime)}`,
    `- Sandbox: ${preflight.sandboxDecision.status}`,
    `- Allowlist: ${preflight.networkDecision.status}`,
    `- Confirmation: ${preflight.confirmationDecision.status}`,
    `- Local fixture / target: ${localFixtureOrTarget(result)}`,
    `- Evidence summary: ${renderEvidenceSummary(result)}`,
    `- Redactions: ${renderRedactions(result)}`,
    `- Executed: ${result.executed ? "yes" : "no"}`,
    `- Next action: ${sanitizeBrowserText(result.nextAction)}`,
  ].join("\n");
}

function localFixtureOrTarget(result: BrowserExecutionResult): string {
  const fixture = result.executorResult.evidence.find((item) => item.label === "fixture id");
  if (fixture) {
    return sanitizeBrowserText(fixture.value, 120);
  }
  return sanitizeBrowserText(result.request.action.url ?? result.request.action.target ?? "current-page", 120);
}

function renderEvidenceSummary(result: BrowserExecutionResult): string {
  const summary = result.executorResult.evidence.find((item) => item.label === "safe summary");
  return summary ? sanitizeBrowserText(summary.value, 160) : "none";
}

function renderRedactions(result: BrowserExecutionResult): string {
  const redactions = result.executorResult.evidence
    .filter((item) => item.label === "redaction")
    .map((item) => sanitizeBrowserText(item.value, 40));
  return redactions.length > 0 ? Array.from(new Set(redactions)).join(", ") : "none";
}
