import type {
  QueryRuntimeStateSeed,
} from "../../core/query/runtimeState.js";
import type { RuntimeSeedOptions } from "../sessionReplayBuilder.js";
import type { TranscriptEvent } from "../sessionEventCodec.js";
import {
  buildReplayPlan,
  normalizeSessionReplayTranscript,
  repairSessionReplayTranscript,
  type ReplayPlan,
  type TranscriptRepairContext,
} from "./sessionReplayFacade.js";
import { buildSessionRuntimeStateSeed } from "./sessionRuntimeSeed.js";
import type { RecoverySnapshot } from "../recovery/sessionRecoverySnapshot.js";

export function normalizeReplayTranscript(
  events: TranscriptEvent[],
): TranscriptEvent[] {
  return normalizeSessionReplayTranscript(events);
}

export function repairReplayTranscript(
  events: TranscriptEvent[],
  context: TranscriptRepairContext,
): TranscriptEvent[] {
  return repairSessionReplayTranscript(events, context);
}

export function buildReplayPlanForSession(
  snapshot: RecoverySnapshot,
): ReplayPlan {
  return buildReplayPlan(snapshot);
}

export function buildRuntimeStateSeedForSession(input: {
  readonly sessionId: string;
  readonly snapshot: RecoverySnapshot;
  readonly options: RuntimeSeedOptions;
}): QueryRuntimeStateSeed {
  return buildSessionRuntimeStateSeed(input);
}
