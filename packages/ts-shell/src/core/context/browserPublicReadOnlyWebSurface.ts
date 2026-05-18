import { sanitizeBrowserText } from "./browserCapabilityModel.js";
import { renderBrowserNetworkEgressSurface } from "./browserNetworkEgressSurface.js";
import type { BrowserPublicReadOnlyWebReceipt } from "./browserPublicReadOnlyWebReceipt.js";

export function renderBrowserPublicReadOnlyWebSurface(
  receipt: BrowserPublicReadOnlyWebReceipt,
): string {
  return [
    "Public read-only web execution",
    `- Origin: ${safe(receipt.targetOrigin)}`,
    `- Method: ${safe(receipt.method)}`,
    `- Action: ${safe(receipt.actionKind)}`,
    `- Policy: ${safe(receipt.policyStatus)}`,
    `- Public network: ${receipt.publicNetwork ? "yes" : "no"}`,
    "- Browser launched: no",
    "- JavaScript executed: no",
    `- Executed: ${receipt.executed ? "yes" : "no"}`,
    `- Evidence summary: ${safe(receipt.evidenceSummary, 260)}`,
    `- Title: ${safe(receipt.safeTitle ?? "none")}`,
    `- Receipt: ${safe(receipt.receiptId, 180)}`,
    `- Egress decision: ${safe(receipt.egressDecision ?? "none")}`,
    `- Egress audit: ${safe(receipt.egressAuditId ?? "none")}`,
    `- Redirects: ${safe(receipt.redirectSummary, 220)}`,
    `- Status: ${safe(receipt.requestStatus)}; ${safe(receipt.statusCodeSummary)}`,
    `- Redactions/warnings: ${[...receipt.redactions, ...receipt.warnings].length === 0 ? "none" : [...receipt.redactions, ...receipt.warnings].map((item) => safe(item)).join(", ")}`,
    `- Next action: ${safe(receipt.nextAction, 240)}`,
    ...(receipt.egressAudit ? ["", renderBrowserNetworkEgressSurface(receipt.egressAudit)] : []),
  ].join("\n");
}

function safe(value: string, maxLength = 180): string {
  return sanitizeBrowserText(value.replace(/\s+/g, " "), maxLength);
}
