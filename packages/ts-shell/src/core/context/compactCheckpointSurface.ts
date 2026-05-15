import type { CompactLiveCheckpoint } from "./compactLiveCheckpoint.js";

export function formatCompactCheckpointStatus(
  checkpoint: CompactLiveCheckpoint | undefined,
): string {
  if (!checkpoint) {
    return [
      "Compact checkpoint",
      "- Latest: none",
      "- Future-turn adapter: not-ready",
      "- Injection: not-yet-injected",
      "- Next action: Run /compact to create a live checkpoint.",
    ].join("\n");
  }

  return [
    "Compact checkpoint",
    "- Latest: exists",
    `- Checkpoint id: ${checkpoint.checkpointId}`,
    `- Created at: ${checkpoint.createdAt}`,
    `- Status: ${checkpoint.status}`,
    `- Source command: ${checkpoint.sourceCommand}`,
    `- Packet: ${checkpoint.packetVersion}`,
    `- Route: ${checkpoint.packetSummary.routeLabel ?? "not recorded"}`,
    `- Edit capability: ${checkpoint.packetSummary.editCloseoutStatus ?? "not recorded"}`,
    `- Mutation evidence: ${checkpoint.packetSummary.changedFileCount} changed, ${checkpoint.packetSummary.failedFileCount} failed`,
    `- Recovery references: ${checkpoint.packetSummary.recoveryAuthorityReferenceCount}`,
    `- Validation facts: ${checkpoint.packetSummary.validationCommandCount}`,
    `- Compact survivors: ${checkpoint.compactSurvivorFacts.length}`,
    `- Redactions: ${checkpoint.redactions.length}`,
    `- Warnings: ${checkpoint.warnings.length}`,
    "- Future-turn adapter: ready-for-adapter",
    "- Injection: not-yet-injected",
    `- Next action: ${checkpoint.packetSummary.nextAction ?? "continue normally; Route 78 will wire injection"}`,
  ].join("\n");
}
