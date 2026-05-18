import { sanitizeBrowserText } from "./browserCapabilityModel.js";
import type { BrowserTxnPlannerDecision } from "./browserPlan.js";

export type BrowserTxnStatus = "success" | "stopped" | "failed";

export interface BrowserTxnStepSummary {
  readonly kind: string;
  readonly status: BrowserTxnStatus;
  readonly target: string;
  readonly summary: string;
  readonly reasonCode: string;
  readonly repairStatus?: "not-needed" | "attempted" | "succeeded" | "failed";
}

export interface BrowserTxnResult {
  readonly status: BrowserTxnStatus;
  readonly transactionId: string;
  readonly controlledTarget: string;
  readonly planner: BrowserTxnPlannerDecision;
  readonly stepSummaries: readonly BrowserTxnStepSummary[];
  readonly finalSummary: string;
  readonly reasonCode: string;
  readonly cleanupStatus: string;
  readonly redactionStatus: string;
  readonly repairStatus: "not-needed" | "attempted" | "succeeded" | "failed";
  readonly durationMs: number;
  readonly evidenceId: string;
  readonly nextActions: readonly string[];
  readonly evidence: readonly string[];
}

export function createBrowserTxnResult(input: {
  readonly status: BrowserTxnStatus;
  readonly transactionId: string;
  readonly controlledTarget: string;
  readonly planner: BrowserTxnPlannerDecision;
  readonly stepSummaries: readonly BrowserTxnStepSummary[];
  readonly finalSummary: string;
  readonly reasonCode: string;
  readonly cleanupStatus: string;
  readonly redactionStatus: string;
  readonly repairStatus: BrowserTxnResult["repairStatus"];
  readonly durationMs: number;
  readonly evidence: readonly string[];
}): BrowserTxnResult {
  const finalSummary = sanitizeBrowserText(input.finalSummary, 420);
  const evidenceId = stableEvidenceId([
    input.transactionId,
    input.status,
    input.reasonCode,
    input.cleanupStatus,
    finalSummary,
  ].join("|"));
  return {
    status: input.status,
    transactionId: input.transactionId,
    controlledTarget: sanitizeBrowserText(input.controlledTarget, 180),
    planner: input.planner,
    stepSummaries: input.stepSummaries.map((step) => ({
      kind: sanitizeBrowserText(step.kind, 40),
      status: step.status,
      target: sanitizeBrowserText(step.target, 120),
      summary: sanitizeBrowserText(step.summary, 240),
      reasonCode: sanitizeBrowserText(step.reasonCode, 80),
      repairStatus: step.repairStatus,
    })),
    finalSummary,
    reasonCode: sanitizeBrowserText(input.reasonCode, 80),
    cleanupStatus: sanitizeBrowserText(input.cleanupStatus, 40),
    redactionStatus: input.redactionStatus,
    repairStatus: input.repairStatus,
    durationMs: Math.max(0, Math.floor(input.durationMs)),
    evidenceId,
    nextActions: nextActionsForTxn(input.status, input.reasonCode),
    evidence: unique([
      ...input.evidence,
      `browser-transaction:evidence-id:${evidenceId}`,
      `browser-transaction:id:${input.transactionId}`,
      `browser-transaction:status:${input.status}`,
      `browser-transaction:reason:${input.reasonCode}`,
      `browser-transaction:cleanup:${input.cleanupStatus}`,
      `browser-transaction:repair:${input.repairStatus}`,
      "browser-transaction:raw-dom-excluded",
      "browser-transaction:no-secrets",
      "browser-transaction:no-image-capture-default",
      "browser-transaction:no-session-persistence",
      "browser-transaction:no-provider-or-model-call",
      "browser-transaction:no-mcp-live-backend",
    ]),
  };
}

export function formatBrowserTxnResult(result: BrowserTxnResult): string {
  const title = result.status === "success"
    ? "Browser task completed"
    : "Browser task stopped";
  return [
    title,
    `- Transaction: ${result.status}`,
    `- TransactionId: ${result.transactionId}`,
    `- Target: ${result.controlledTarget}`,
    `- Plan: ${result.stepSummaries.map((step) => step.kind).join(" -> ") || "none"}`,
    `- Summary: ${result.finalSummary}`,
    `- ReasonCode: ${result.reasonCode}`,
    `- Repair: ${result.repairStatus}`,
    `- Cleanup: ${result.cleanupStatus}`,
    `- Redaction: ${result.redactionStatus}`,
    `- EvidenceId: ${result.evidenceId}`,
    `- Next: ${result.nextActions.join("; ") || "none"}`,
    "- Raw DOM: excluded",
  ].join("\n");
}

export function browserTxnEvidenceLine(result: BrowserTxnResult): string {
  return [
    "browser-agent-transaction",
    result.evidenceId,
    result.transactionId,
    result.status,
    result.reasonCode,
    result.repairStatus,
    result.cleanupStatus,
    sanitizeBrowserText(result.finalSummary, 160),
  ].join(":");
}

function nextActionsForTxn(status: BrowserTxnStatus, reasonCode: string): readonly string[] {
  if (status === "success") {
    return ["Use the summarized browser transaction evidence in the final answer."];
  }
  if (reasonCode === "planner-low-confidence") {
    return ["Ask for a controlled local observe/extract/click/type browser task."];
  }
  if (reasonCode === "policy-blocked") {
    return ["Use controlled local fixtures only; public or sensitive browser automation is blocked."];
  }
  if (reasonCode === "runtime-disabled" || reasonCode === "runtime-package-missing" || reasonCode === "runtime-binary-missing") {
    return ["Enable the controlled Direct Playwright runtime before retrying."];
  }
  if (reasonCode === "repair-failed" || reasonCode === "action-target-missing") {
    return ["Observe the fixture and choose one visible safe target before retrying."];
  }
  if (reasonCode === "action-timeout" || reasonCode === "navigation-timeout") {
    return ["Use a ready local fixture or increase the bounded transaction timeout."];
  }
  if (reasonCode === "cleanup-failed") {
    return ["Inspect browser cleanup evidence before running another browser transaction."];
  }
  return ["Retry only within controlled local browser transaction policy."];
}

function stableEvidenceId(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `browser-txn-obs-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}
