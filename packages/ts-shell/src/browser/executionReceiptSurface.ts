import { sanitizeBrowserText } from "./capabilityModel.js";
import type { BrowserExecutionReceipt } from "./executionReceipt.js";

export function renderBrowserExecutionReceiptSurface(
  receipt: BrowserExecutionReceipt,
): string {
  return [
    "Browser execution receipt",
    `- Receipt id: ${sanitizeBrowserText(receipt.receiptId, 140)}`,
    `- Status: ${receipt.status}`,
    `- Source: ${receipt.source}`,
    `- Action: ${receipt.actionKind}`,
    `- Mode: ${receipt.executionMode}`,
    `- Runner: ${sanitizeBrowserText(`${receipt.runnerId} (${receipt.runnerSource})`, 160)}`,
    `- Skill runner: ${receipt.skillRunnerId ? `${sanitizeBrowserText(receipt.skillRunnerId, 120)} (${receipt.skillRunnerStatus ?? "unknown"})` : "none"}`,
    `- Replay source: ${receipt.replaySourceReceiptId ? `${sanitizeBrowserText(receipt.replaySourceReceiptId, 140)} via ${sanitizeBrowserText(receipt.replayCacheEntryId ?? "unknown-cache", 140)}` : "none"}`,
    `- Evidence summary: ${evidenceSummary(receipt)}`,
    `- Replay readiness: ${receipt.replayReadiness.status}`,
    `- Redactions/warnings: ${redactionsAndWarnings(receipt)}`,
    `- Executed: ${receipt.executed ? "yes" : "no"}`,
    `- Next action: ${sanitizeBrowserText(receipt.nextAction, 220)}`,
  ].join("\n");
}

export function renderBrowserExecutionReceiptInlineSummary(
  receipt: BrowserExecutionReceipt,
): string {
  return [
    `receipt=${sanitizeBrowserText(receipt.receiptId, 120)}`,
    `status=${receipt.status}`,
    `replay=${receipt.replayReadiness.status}`,
    `executed=${receipt.executed ? "yes" : "no"}`,
  ].join("; ");
}

function evidenceSummary(receipt: BrowserExecutionReceipt): string {
  const bundle = receipt.evidenceBundle;
  const summary = bundle.observationSummary !== "none"
    ? bundle.observationSummary
    : bundle.extractionSummary !== "none"
      ? bundle.extractionSummary
      : bundle.responseMetadataSummary;
  return sanitizeBrowserText(summary, 220);
}

function redactionsAndWarnings(receipt: BrowserExecutionReceipt): string {
  const values = [...receipt.redactions, ...receipt.warnings].slice(0, 5);
  return values.length > 0
    ? values.map((value) => sanitizeBrowserText(value, 80)).join("; ")
    : "none";
}
