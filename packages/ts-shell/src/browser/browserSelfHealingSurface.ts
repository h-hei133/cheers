import { sanitizeBrowserText } from "./browserCapabilityModel.js";
import type { BrowserSelfHealingProposal } from "./browserSelfHealingProposal.js";

export function renderBrowserSelfHealingSurface(
  proposal: BrowserSelfHealingProposal,
): string {
  return [
    "Browser self-healing proposal",
    `- Proposal id: ${safe(proposal.proposalId)}`,
    `- Failure: ${safe(proposal.failureKind)}`,
    `- Proposal: ${safe(proposal.kind)}`,
    `- Proposal status: ${proposal.status}`,
    `- Confidence: ${proposal.confidence}`,
    `- Required user action: ${safe(proposal.requiredUserAction, 220)}`,
    `- Proposed patch: ${proposal.proposedPatch ? safe(proposal.proposedPatch.kind) : "none"}`,
    `- Patch status: ${proposal.proposedPatch?.status ?? "none"}`,
    `- Applied: ${proposal.applied}`,
    `- Executed: ${proposal.executed}`,
    `- Automatic replay: ${proposal.automaticReplay}`,
    `- Blockers/warnings: ${summarize([...proposal.blockers, ...proposal.warnings])}`,
    `- Next action: ${safe(proposal.nextAction, 240)}`,
  ].join("\n");
}

function summarize(values: readonly string[]): string {
  return values.length === 0 ? "none" : safe(values.slice(0, 5).join("; "), 220);
}

function safe(value: string, maxLength = 160): string {
  return sanitizeBrowserText(value.replace(/\s+/g, " "), maxLength);
}
