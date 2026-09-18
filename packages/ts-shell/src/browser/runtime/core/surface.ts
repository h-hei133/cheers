import { sanitizeBrowserText } from "../../browserCapabilityModel.js";
import type { BrowserRuntimeActionLoopResult } from "../../browserActionLoopExecutor.js";
import type { BrowserRuntimeReceipt } from "./receipt.js";

export function renderBrowserRuntimeSurface(result: BrowserRuntimeActionLoopResult): string {
  const observation = result.observation;
  return [
    "Browser runtime execution",
    `- Outcome: ${result.receipt.executed ? "executed" : "blocked"}`,
    `- Action: ${result.receipt.actionKind}`,
    `- Runtime mode: ${result.receipt.runtimeMode}`,
    `- Policy: ${result.receipt.policyStatus}`,
    `- Executed: ${result.receipt.executed ? "yes" : "no"}`,
    `- Browser launched: ${result.receipt.browserLaunched ? "yes" : "no"}`,
    `- Public automation: ${result.receipt.publicAutomation ? "yes" : "no"}`,
    `- JavaScript rendered support: ${result.receipt.jsRenderedSupport ? "yes" : "no"}`,
    `- DOM snapshot id: ${safe(result.receipt.domSnapshotId ?? "none")}`,
    `- Accessibility snapshot id: ${safe(result.receipt.accessibilitySnapshotId ?? "none")}`,
    `- Action target: ${safe(result.receipt.actionTargetId ?? "none")}`,
    `- Selector repair readiness: ${safe(result.receipt.selectorRepairReadiness ?? "none")}`,
    `- Provenance id: ${safe(result.receipt.provenanceId ?? "none")}`,
    `- Evidence summary: ${safe(observation?.textSummary ?? result.policy.reason, 280)}`,
    `- Redactions/warnings: ${result.receipt.redactions.length + result.receipt.warnings.length > 0 ? [...result.receipt.redactions, ...result.receipt.warnings].map((item) => safe(item, 80)).join("; ") : "none"}`,
    `- Next action: ${safe(result.receipt.nextAction, 220)}`,
    "",
    renderBrowserRuntimeReceiptSurface(result.receipt),
  ].join("\n");
}

export function renderBrowserRuntimeReceiptSurface(receipt: BrowserRuntimeReceipt): string {
  return [
    "Browser runtime receipt",
    `- Receipt id: ${safe(receipt.receiptId, 140)}`,
    `- Status: ${receipt.executed ? "executed" : "blocked"}`,
    `- Runtime mode: ${receipt.runtimeMode}`,
    `- Action: ${receipt.actionKind}`,
    `- Origin scope: ${receipt.originScope.length > 0 ? receipt.originScope.map((origin) => safe(origin, 100)).join(", ") : "none"}`,
    `- Observation id: ${safe(receipt.observationId ?? "none", 120)}`,
    `- Snapshot ids: dom=${safe(receipt.domSnapshotId ?? "none", 100)}; accessibility=${safe(receipt.accessibilitySnapshotId ?? "none", 100)}`,
    `- Action target: ${safe(receipt.actionTargetId ?? "none", 120)}`,
    `- Repair readiness: ${safe(receipt.selectorRepairReadiness ?? "none", 80)}`,
    `- Browser launched: ${receipt.browserLaunched ? "yes" : "no"}`,
    `- Public automation: ${receipt.publicAutomation ? "yes" : "no"}`,
    "- Provider/model call: none",
    "- Raw content: excluded",
  ].join("\n");
}

function safe(value: string, maxLength = 160): string {
  return sanitizeBrowserText(value.replace(/\s+/g, " "), maxLength);
}
