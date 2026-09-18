import { sanitizeBrowserText } from "./browserCapabilityModel.js";
import type { BrowserExternalNetworkHandoffReceipt } from "./browserExternalNetworkHandoffReceipt.js";

export function renderBrowserExternalNetworkHandoffSurface(
  receipt: BrowserExternalNetworkHandoffReceipt,
): string {
  return [
    "External browser runner handoff",
    `- Origin: ${safe(receipt.targetOrigin)}`,
    `- Action: ${safe(receipt.actionKind)}`,
    `- Gates: ${safe(receipt.gateSummary, 240)}`,
    `- Runner mode: ${safe(receipt.runnerMode)}`,
    `- Simulated handoff: ${safe(receipt.handoffStatus)}`,
    "- Real network execution: no",
    "- Browser launched: no",
    "- Future public egress guard: required",
    `- Receipt: ${safe(receipt.receiptId, 180)}`,
    `- Evidence summary: ${safe(receipt.evidenceSummary, 240)}`,
    `- Redactions/warnings: ${[...receipt.redactions, ...receipt.warnings].length === 0 ? "none" : [...receipt.redactions, ...receipt.warnings].map((item) => safe(item)).join(", ")}`,
    `- Next action: ${safe(receipt.nextAction, 240)}`,
  ].join("\n");
}

function safe(value: string, maxLength = 180): string {
  return sanitizeBrowserText(value.replace(/\s+/g, " "), maxLength);
}
