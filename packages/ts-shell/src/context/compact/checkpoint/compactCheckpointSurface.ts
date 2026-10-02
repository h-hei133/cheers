import type { CompactLiveCheckpoint } from "./compactLiveCheckpoint.js";
import type { CompactInjectionState } from "../injection/compactInjectionState.js";
import type { RetentionStatus } from "../../../core/state/retention.js";

export function formatCompactCheckpointStatus(
  checkpoint: CompactLiveCheckpoint | undefined,
  injectionState?: CompactInjectionState,
  retention?: RetentionStatus,
): string {
  const history = [
    ...(retention?.incomplete ? [`- Checkpoint history: incomplete (${retention.dropped} checkpoints dropped)`] : []),
    ...(injectionState?.incomplete ? [`- Injection history: incomplete (${injectionState.dropped} entries dropped; older session state may be unavailable)`] : []),
  ];
  if (!checkpoint) {
    return [
      "Compact checkpoint",
      "- Latest: none",
      ...history,
      "- Future-turn adapter: not-ready",
      "- Injection status: no checkpoint",
      "- Next action: Run /compact to create a live checkpoint.",
    ].join("\n");
  }

  return [
    "Compact checkpoint",
    "- Latest: exists",
    ...history,
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
    `- Injection status: ${formatInjectionStatus(checkpoint, injectionState)}`,
    `- Next action: ${checkpoint.packetSummary.nextAction ?? "continue normally; Route 78 will wire injection"}`,
  ].join("\n");
}

function formatInjectionStatus(
  checkpoint: CompactLiveCheckpoint,
  injectionState: CompactInjectionState | undefined,
): string {
  if (checkpoint.status === "superseded") {
    return "checkpoint superseded";
  }
  if (checkpoint.status === "invalid") {
    return "checkpoint invalid";
  }
  if (checkpoint.status === "cleared") {
    return "no checkpoint";
  }
  if (!injectionState || injectionState.checkpointId !== checkpoint.checkpointId) {
    return "not pending";
  }
  switch (injectionState.injectionStatus) {
    case "pending":
      return "checkpoint pending injection";
    case "injected":
      return "checkpoint injected";
    case "consumed":
      return "checkpoint consumed";
    case "invalid":
      return "checkpoint invalid";
    case "none":
      return "not pending";
  }
}
