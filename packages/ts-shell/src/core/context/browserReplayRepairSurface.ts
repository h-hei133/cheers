import { sanitizeBrowserText } from "./browserCapabilityModel.js";
import type { BrowserReplayRepairPreview } from "./browserReplayRepairPreview.js";
import type { BrowserSelfHealingProposal } from "./browserSelfHealingProposal.js";

export function renderBrowserReplayRepairSurface(
  preview: BrowserReplayRepairPreview,
  proposal?: BrowserSelfHealingProposal,
): string {
  return [
    "Browser replay repair preview",
    `- Failure: ${safe(preview.failureKind)}`,
    `- Repair readiness: ${safe(preview.repairReadiness)}`,
    `- Self-healing proposal: ${proposal ? safe(proposal.proposalId) : preview.selfHealingProposalId ? safe(preview.selfHealingProposalId) : "none"}`,
    `- Self-healing confidence: ${proposal ? proposal.confidence : preview.selfHealingConfidence ?? "none"}`,
    `- Suggested action: ${safe(preview.proposedSafeRepairStep, 220)}`,
    `- Required gate: ${safe(preview.requiredCondition, 160)}`,
    "- Executed: no",
    "- Repair applied: no",
    "- Automatic repair: no",
    "- Automatic replay: no",
    `- Next action: ${safe(preview.nextAction, 220)}`,
  ].join("\n");
}

function safe(value: string, maxLength = 160): string {
  return sanitizeBrowserText(value.replace(/\s+/g, " "), maxLength);
}
