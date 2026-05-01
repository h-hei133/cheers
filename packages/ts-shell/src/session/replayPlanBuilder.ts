import type { RecoverySnapshot, ReplayPlan, TranscriptEvent } from "./SessionManager.js";

export interface ReplayPlanTurnPairingSummary {
  readonly ignoredDuplicateTurnStarts: number;
  readonly ignoredUnpairedTurnCompletions: number;
  readonly ignoredRoleMismatchedTurnCompletions: number;
}

export function buildReplayPlanFromSnapshot(
  snapshot: RecoverySnapshot,
  turnPairing: ReplayPlanTurnPairingSummary,
): ReplayPlan {
  const replayMessages = snapshot.transcriptEvents
    .filter(
      (event): event is Extract<TranscriptEvent, { type: "message" }> =>
        event.type === "message",
    )
    .map((event) => ({
      role: event.role,
      content: event.content,
      timestamp: event.timestamp,
    }));

  const lastReplayMessage = replayMessages[replayMessages.length - 1];
  const continuationPrompt =
    snapshot.interruptedKind === "turn"
      ? "Continue from where you left off."
      : snapshot.interruptedKind === "prompt"
        ? snapshot.pendingPrompt
        : undefined;

  return {
    normalizedTranscriptEvents: snapshot.transcriptEvents,
    replayMessages,
    continuationPrompt,
    requiresAssistantSentinel: lastReplayMessage?.role === "user",
    repairSummary: {
      ...snapshot.repairSummary,
      ignoredDuplicateTurnStarts: turnPairing.ignoredDuplicateTurnStarts,
      ignoredUnpairedTurnCompletions:
        turnPairing.ignoredUnpairedTurnCompletions,
      ignoredRoleMismatchedTurnCompletions:
        turnPairing.ignoredRoleMismatchedTurnCompletions,
    },
  };
}
