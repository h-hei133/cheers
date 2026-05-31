import type { QueryRuntimeRepairSummary } from "../../core/query/runtime/state.js";
import type { SessionMessage } from "../schema/sessionMessage.js";
import type { SessionStateSnapshot } from "../schema/sessionStateSnapshot.js";
import type { TranscriptEvent } from "../sessionEventCodec.js";
import {
  buildSessionReplayPlan,
  normalizeReplayTranscriptEvents,
  prepareReplayTranscript,
} from "./builder.js";
import type { RecoverySnapshot } from "../recovery/sessionRecoverySnapshot.js";

export interface TranscriptRepairContext {
  readonly sessionId: string;
  readonly state: SessionStateSnapshot;
  readonly pendingPrompt?: string;
  readonly updatedAt: string;
}

export interface ReplayPlan {
  readonly normalizedTranscriptEvents: TranscriptEvent[];
  readonly replayMessages: SessionMessage[];
  readonly continuationPrompt?: string;
  readonly requiresAssistantSentinel: boolean;
  readonly repairSummary: QueryRuntimeRepairSummary;
}

export function normalizeSessionReplayTranscript(
  events: readonly TranscriptEvent[],
): TranscriptEvent[] {
  return normalizeReplayTranscriptEvents(events);
}

export function repairSessionReplayTranscript(
  events: readonly TranscriptEvent[],
  context: TranscriptRepairContext,
): TranscriptEvent[] {
  return prepareReplayTranscript(events, context).transcriptEvents;
}

export function buildReplayPlan(snapshot: RecoverySnapshot): ReplayPlan {
  return buildSessionReplayPlan(snapshot);
}
