import { sanitizeBrowserText } from "../context/browserCapabilityModel.js";
import { renderBrowserPublicReadOnlyWebUxSummary } from "../context/browserPublicReadOnlyWebUxSummary.js";
import type { BrowserPublicReadOnlyWebSmokeResult } from "./browserPublicReadOnlyWebSmokeRunner.js";

export function renderBrowserPublicReadOnlyWebSmokeReport(
  result: BrowserPublicReadOnlyWebSmokeResult,
): string {
  return [
    "Public read-only web smoke",
    `- Smoke enabled: ${result.enabled ? "yes" : "no"}`,
    `- Target origin: ${safe(result.targetOrigin ?? "none")}`,
    `- Method: ${safe(result.method)}`,
    `- Status: ${result.status}`,
    `- Policy: ${safe(result.receipt?.policyStatus ?? "none")}`,
    `- Egress decision: ${safe(result.receipt?.egressDecision ?? "none")}`,
    `- Public network used: ${result.publicNetworkUsed ? "yes" : "no"}`,
    "- Browser launched: no",
    "- JavaScript executed: no",
    `- Evidence summary: ${safe(result.receipt?.evidenceSummary ?? result.reason, 260)}`,
    `- Extraction quality: ${safe(result.receipt?.extractionQualitySummary ?? "none", 120)}`,
    `- Redactions/warnings: ${[...result.redactions, ...result.warnings].length === 0 ? "none" : [...result.redactions, ...result.warnings].map((item) => safe(item)).join(", ")}`,
    `- Next action: ${safe(result.nextAction, 240)}`,
    ...(result.uxSummary ? ["", renderBrowserPublicReadOnlyWebUxSummary(result.uxSummary)] : []),
  ].join("\n");
}

function safe(value: string, maxLength = 180): string {
  return sanitizeBrowserText(value.replace(/\s+/g, " "), maxLength);
}
