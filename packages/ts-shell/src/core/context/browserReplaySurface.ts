import { sanitizeBrowserText } from "./browserCapabilityModel.js";
import type { BrowserReplayExecutionResult } from "./browserReplayExecutor.js";
import { classifyBrowserReplayFailure } from "./browserReplayFailureClassifier.js";
import type { BrowserReplayPlan } from "./browserReplayPlanner.js";
import { createBrowserReplayRepairPreview } from "./browserReplayRepairPreview.js";
import { decideBrowserReplayRepairReadiness } from "./browserReplayRepairReadiness.js";
import { renderBrowserReplayRepairSurface } from "./browserReplayRepairSurface.js";
import { planBrowserSelfHealingProposal } from "./browserSelfHealingPlanner.js";
import { renderBrowserSelfHealingSurface } from "./browserSelfHealingSurface.js";

export function renderBrowserReplaySurface(input: {
  readonly plan: BrowserReplayPlan;
  readonly execution?: BrowserReplayExecutionResult;
}): string {
  const receipt = input.execution?.receipt;
  const repairPreview = input.plan.willExecute
    ? undefined
    : repairPreviewForPlan(input.plan);
  const selfHealingProposal = repairPreview
    ? planBrowserSelfHealingProposal({ plan: input.plan })
    : undefined;
  return [
    "Browser replay",
    "Result",
    `- Outcome: ${input.execution?.status ?? (input.plan.willExecute ? "planned" : "blocked")}`,
    `- Source receipt: ${safe(input.plan.sourceReceiptId)}`,
    `- Cache entry: ${safe(input.plan.cacheEntryId)}`,
    `- Replay source: ${receipt?.replaySourceReceiptId ? safe(receipt.replaySourceReceiptId) : safe(input.plan.sourceReceiptId)}`,
    `- Action: ${input.plan.actionKind}`,
    `- Runner mode: ${safe(input.plan.runnerMode)}`,
    `- Revalidation status: ${input.plan.policy.status}`,
    `- Replay status: ${input.execution?.status ?? input.plan.policy.status}`,
    `- New receipt id: ${receipt?.receiptId ? safe(receipt.receiptId) : "none"}`,
    `- Evidence summary: ${safe(input.plan.expectedEvidence.join("; ") || "none", 220)}`,
    `- Replay readiness: ${receipt?.replayReadiness.status ?? input.plan.policy.status}`,
    `- Redactions/warnings: ${summarize([...input.plan.warnings, ...(input.execution?.warnings ?? [])])}`,
    `- Executed: ${input.execution?.executed ? "yes" : "no"}`,
    `- Repair needed: ${repairPreview ? "yes" : "no"}`,
    "- Automatic replay: no",
    "- Persistence: none",
    "- Provider/model call: none",
    "- MCP discovery/launch: none",
    "- Network access: local-fixture only",
    `- Next action: ${safe(receipt?.nextAction ?? input.plan.nextAction, 240)}`,
    ...(repairPreview ? ["", renderBrowserReplayRepairSurface(repairPreview, selfHealingProposal)] : []),
    ...(selfHealingProposal ? ["", renderBrowserSelfHealingSurface(selfHealingProposal)] : []),
  ].join("\n");
}

export function renderBrowserReplayStatusSurface(input: {
  readonly entryCount: number;
  readonly visibleEntryCount: number;
  readonly entries: readonly { readonly sourceReceiptId: string; readonly actionKind: string; readonly replayStatus: string }[];
}): string {
  return [
    "Browser replay",
    "Result",
    "- Outcome: status",
    `- Cache status: ${input.entryCount > 0 ? "available" : "empty"}`,
    `- Cache entries: ${input.entryCount}`,
    `- Visible entries: ${input.visibleEntryCount}`,
    "- Persistence: none",
    "- Automatic replay: no",
    "- Provider/model call: none",
    "",
    "Entries",
    ...(input.entries.length === 0
      ? ["- none"]
      : input.entries.map((entry) => `- ${safe(entry.sourceReceiptId)} action=${entry.actionKind} replay=${entry.replayStatus}`)),
    "",
    "Next action",
    input.entryCount > 0 ? "- Run /browser replay <receipt-id> explicitly." : "- Execute a replay-ready local/test browser action first.",
  ].join("\n");
}

function summarize(values: readonly string[]): string {
  return values.length === 0 ? "none" : safe(values.slice(0, 5).join("; "), 220);
}

function safe(value: string, maxLength = 160): string {
  return sanitizeBrowserText(value.replace(/\s+/g, " "), maxLength);
}

function repairPreviewForPlan(plan: BrowserReplayPlan) {
  const failure = classifyBrowserReplayFailure({ plan });
  const readiness = decideBrowserReplayRepairReadiness({ failure });
  if (readiness.status === "repair-not-applicable" && failure.kind === "none") {
    return undefined;
  }
  return createBrowserReplayRepairPreview({ plan, failure, readiness });
}
