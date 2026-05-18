import { sanitizeBrowserText } from "./browserCapabilityModel.js";
import type { BrowserTxnResult } from "./browserTxnEvidence.js";

export function renderBrowserTxnReport(result: BrowserTxnResult): string {
  const title = result.status === "success"
    ? "Browser task completed"
    : "Browser task stopped";
  return [
    title,
    `- Outcome: ${outcomeLabel(result)}`,
    `- Transaction: ${result.status}`,
    `- TransactionId: ${result.transactionId}`,
    `- TraceId: ${result.trace.traceId}`,
    `- Target: ${result.controlledTarget}`,
    `- Plan: ${result.trace.plan.sequence.join(" -> ") || "none"}`,
    `- Planner: ${result.planner.confidence} (${sanitizeBrowserText(result.planner.reason, 140)})`,
    `- Repair: ${result.repairStatus}`,
    `- Result: ${result.finalSummary}`,
    `- ReasonCode: ${result.reasonCode}`,
    `- Cleanup: ${result.cleanupStatus}`,
    `- Redaction: ${result.redactionStatus}`,
    `- EvidenceId: ${result.evidenceId}`,
    `- Next: ${result.nextActions.join("; ") || "none"}`,
    "- Raw DOM: excluded",
  ].join("\n");
}

function outcomeLabel(result: BrowserTxnResult): string {
  if (result.status === "success") {
    return "transaction success";
  }
  if (result.reasonCode === "planner-low-confidence") {
    return "planner stopped";
  }
  if (result.reasonCode === "policy-blocked") {
    return "policy blocked";
  }
  if (result.reasonCode === "runtime-disabled" ||
    result.reasonCode === "runtime-package-missing" ||
    result.reasonCode === "runtime-binary-missing") {
    return "runtime unavailable";
  }
  if (result.reasonCode === "repair-failed") {
    return "repair failed";
  }
  if (result.reasonCode === "action-target-missing") {
    return "target missing";
  }
  if (result.reasonCode === "action-timeout" || result.reasonCode === "navigation-timeout") {
    return "timeout with cleanup";
  }
  if (result.reasonCode === "cleanup-failed") {
    return "cleanup failed";
  }
  if (result.redactionStatus !== "clean") {
    return "redaction applied";
  }
  return "transaction stopped";
}
