import { sanitizeBrowserText } from "./capabilityModel.js";
import type { BrowserPublicReadOnlyWebReceipt } from "./publicReadOnlyWebReceipt.js";

export interface BrowserPublicReadOnlyWebUxSummary {
  readonly status: "executed" | "blocked" | "unavailable";
  readonly lines: readonly string[];
  readonly evidence: readonly string[];
}

export function createBrowserPublicReadOnlyWebUxSummary(
  receipt: BrowserPublicReadOnlyWebReceipt,
): BrowserPublicReadOnlyWebUxSummary {
  const unavailable = receipt.requestStatus === "request-failed" || receipt.requestStatus === "timeout";
  const status = receipt.executed ? "executed" : unavailable ? "unavailable" : "blocked";
  return {
    status,
    lines: [
      `Requested ${safe(receipt.method)} ${safe(receipt.targetOrigin)} for ${safe(receipt.actionKind)}.`,
      receipt.executed
        ? "Allowed by explicit public read-only manifest, allowlist, confirmation, and egress guard."
        : `Not fetched: ${safe(receipt.policyStatus)} / ${safe(receipt.requestStatus)}.`,
      receipt.executed
        ? `Fetched ${safe(receipt.statusCodeSummary)} with sanitized evidence only.`
        : `Reason: ${safe(receipt.evidenceSummary, 220)}`,
      `Extraction quality: ${safe(receipt.extractionQualitySummary, 120)}`,
      `Evidence: ${safe(receipt.evidenceSummary, 220)}`,
      "Not done: browser launch, JavaScript, auth/cookies, write action, raw content persistence.",
      `Next: ${safe(receipt.nextAction, 220)}`,
    ],
    evidence: [
      "browser-public-readonly-web-ux-summary:created",
      `browser-public-readonly-web-ux-summary:${status}`,
      "browser-public-readonly-web-ux-summary:raw-content-excluded",
    ],
  };
}

export function renderBrowserPublicReadOnlyWebUxSummary(
  summary: BrowserPublicReadOnlyWebUxSummary,
): string {
  return [
    "Public read-only summary",
    ...summary.lines.map((line) => `- ${line}`),
  ].join("\n");
}

function safe(value: string, maxLength = 180): string {
  return sanitizeBrowserText(value.replace(/\s+/g, " "), maxLength);
}
