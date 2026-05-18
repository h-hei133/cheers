import { sanitizeBrowserText } from "./browserCapabilityModel.js";
import type { BrowserControlledNetworkReceipt } from "./browserControlledNetworkReceipt.js";
import { renderBrowserNetworkEgressSurface } from "./browserNetworkEgressSurface.js";

export function renderBrowserControlledNetworkSurface(
  receipt: BrowserControlledNetworkReceipt,
): string {
  return [
    "Controlled browser network execution",
    `- Origin: ${safe(receipt.controlledOrigin)}`,
    `- Action: ${safe(receipt.actionKind)}`,
    `- Policy: ${safe(receipt.policyStatus)}`,
    "- Public network: no",
    "- Browser launched: no",
    `- Executed: ${receipt.executed ? "yes" : "no"}`,
    `- Evidence summary: ${safe(receipt.safeSummary, 240)}`,
    `- Receipt: ${safe(receipt.receiptId, 180)}`,
    `- Egress decision: ${safe(receipt.egressDecision ?? "none")}`,
    `- Egress audit: ${safe(receipt.egressAuditId ?? "none")}`,
    `- Status: ${safe(receipt.requestStatus)}; ${safe(receipt.statusCodeSummary)}`,
    `- Redactions/warnings: ${[...receipt.redactions, ...receipt.warnings].length === 0 ? "none" : [...receipt.redactions, ...receipt.warnings].map((item) => safe(item)).join(", ")}`,
    `- Next action: ${safe(receipt.nextAction, 240)}`,
    ...(receipt.egressAudit ? ["", renderBrowserNetworkEgressSurface(receipt.egressAudit)] : []),
  ].join("\n");
}

function safe(value: string, maxLength = 180): string {
  return sanitizeBrowserText(value.replace(/\s+/g, " "), maxLength);
}
