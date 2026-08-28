import type { TranscriptEvent } from "../sessionEventCodec.js";
import {
  buildSessionReplayPlan,
  normalizeReplayTranscriptEvents,
  prepareReplayTranscript,
} from "./builder.js";
import type { RecoverySnapshot } from "../recovery/types.js";
import type { ReplayPlan, TranscriptRepairContext } from "./types.js";
export type { ReplayPlan, TranscriptRepairContext } from "./types.js";
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
