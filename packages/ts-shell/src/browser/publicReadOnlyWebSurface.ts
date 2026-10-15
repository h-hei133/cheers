import { sanitizeBrowserText } from "./capabilityModel.js";
import { renderBrowserNetworkEgressSurface } from "./networkEgressSurface.js";
import type { BrowserPublicReadOnlyWebReceipt } from "./publicReadOnlyWebReceipt.js";
import {
  createBrowserPublicReadOnlyWebUxSummary,
  renderBrowserPublicReadOnlyWebUxSummary,
} from "./publicReadOnlyWebUxSummary.js";
import { renderBrowserReadOnlyExtractionSurface } from "./readOnlyExtractionSurface.js";

export function renderBrowserPublicReadOnlyWebSurface(
  receipt: BrowserPublicReadOnlyWebReceipt,
): string {
  const summary = createBrowserPublicReadOnlyWebUxSummary(receipt);
  return [
    "Public read-only web execution",
    `- Origin: ${safe(receipt.targetOrigin)}`,
    `- Method: ${safe(receipt.method)}`,
    `- Action: ${safe(receipt.actionKind)}`,
    `- Policy: ${safe(receipt.policyStatus)}`,
    `- Public network: ${receipt.publicNetwork === null ? "unknown" : receipt.publicNetwork ? "yes" : "no"}`,
    "- Browser launched: no",
    "- JavaScript executed: no",
    `- Executed: ${receipt.executed ? "yes" : "no"}`,
    `- Evidence summary: ${safe(receipt.evidenceSummary, 260)}`,
    `- Title: ${safe(receipt.safeTitle ?? "none")}`,
    `- Extraction quality: ${safe(receipt.extractionQualitySummary)}`,
    `- Ranked evidence: ${receipt.rankedEvidenceSummary.length ? receipt.rankedEvidenceSummary.map((item) => safe(item, 180)).join(" | ") : "none"}`,
    `- Receipt: ${safe(receipt.receiptId, 180)}`,
    `- Egress decision: ${safe(receipt.egressDecision ?? "none")}`,
    `- Egress audit: ${safe(receipt.egressAuditId ?? "none")}`,
    `- Redirects: ${safe(receipt.redirectSummary, 220)}`,
    `- Status: ${safe(receipt.requestStatus)}; ${safe(receipt.statusCodeSummary)}`,
    `- Redactions/warnings: ${[...receipt.redactions, ...receipt.warnings].length === 0 ? "none" : [...receipt.redactions, ...receipt.warnings].map((item) => safe(item)).join(", ")}`,
    `- Next action: ${safe(receipt.nextAction, 240)}`,
    "",
    renderBrowserPublicReadOnlyWebUxSummary(summary),
    ...(receipt.extractionSurface ? ["", renderBrowserReadOnlyExtractionSurface(receipt.extractionSurface)] : []),
    ...(receipt.egressAudit ? ["", renderBrowserNetworkEgressSurface(receipt.egressAudit)] : []),
  ].join("\n");
}

function safe(value: string, maxLength = 180): string {
  return sanitizeBrowserText(value.replace(/\s+/g, " "), maxLength);
}
