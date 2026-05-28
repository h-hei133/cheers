import type { QueryRuntimeRepairSummary } from "../../core/query/runtimeState.js";
import type { DurableLifecycleIndex } from "../../core/tools/toolResultLifecycle.js";
import type {
  ContinuationReason,
  TerminalClassification,
  TerminalReason,
} from "../../orchestration/types.js";
import type { SessionMessage } from "../schema/sessionMessage.js";
import type { Session } from "../schema/sessionRecord.js";
import type { SessionStateSnapshot } from "../schema/sessionStateSnapshot.js";
import type { TranscriptEvent } from "../sessionEventCodec.js";
import {
  normalizeReplayTranscriptEvents,
  prepareReplayTranscript,
} from "../sessionReplayBuilder.js";
import { deriveLifecycleIndexFromTranscript } from "./sessionLifecycleReadModel.js";

export interface RecoverySnapshot {
  readonly pendingPrompt?: string;
  readonly runPhase?: "idle" | "prompt-persisted" | "turn-active";
  readonly interruptedKind?: "prompt" | "turn";
  readonly durableStatus?: "success" | "stopped" | "error";
  readonly terminalReason?: TerminalReason;
  readonly terminalClassification?: TerminalClassification;
  readonly lastContinuationReason?: ContinuationReason;
  readonly pendingLifecycle: DurableLifecycleIndex;
  readonly repairSummary: QueryRuntimeRepairSummary;
  readonly lastUserMessage?: SessionMessage;
  readonly lastAssistantMessage?: SessionMessage;
  readonly lastLifecycleEvent?: Extract<TranscriptEvent, { type: "lifecycle" }>;
  readonly transcriptEvents: TranscriptEvent[];
}

export function buildSessionRecoverySnapshot(input: {
  readonly sessionId: string;
  readonly session: Session;
  readonly state: SessionStateSnapshot;
  readonly transcriptEvents: readonly TranscriptEvent[];
}): RecoverySnapshot {
  const replayPreparation = prepareReplayTranscript(
    normalizeReplayTranscriptEvents(input.transcriptEvents),
    {
      sessionId: input.sessionId,
      state: input.state,
      pendingPrompt: input.session.pendingPrompt,
      updatedAt: input.session.updatedAt,
    },
  );
  const transcriptEvents = replayPreparation.transcriptEvents;
  const messageEvents = transcriptEvents.filter(
    (event): event is Extract<TranscriptEvent, { type: "message" }> =>
      event.type === "message",
  );
  const lifecycleEvents = transcriptEvents.filter(
    (event): event is Extract<TranscriptEvent, { type: "lifecycle" }> =>
      event.type === "lifecycle",
  );
  const readModelLifecycle = deriveLifecycleIndexFromTranscript(transcriptEvents);

  const lastUserMessage = [...messageEvents]
    .reverse()
    .find((event) => event.role === "user");
  const lastAssistantMessage = [...messageEvents]
    .reverse()
    .find((event) => event.role === "assistant");

  return {
    pendingPrompt: input.session.pendingPrompt,
    runPhase: input.state.runPhase,
    interruptedKind: input.state.interruptedKind,
    durableStatus: input.state.durableStatus,
    terminalReason: input.state.terminalReason,
    terminalClassification: input.state.terminalClassification,
    lastContinuationReason: input.state.lastContinuationReason,
    pendingLifecycle: readModelLifecycle,
    repairSummary: replayPreparation.repairSummary,
    lastUserMessage,
    lastAssistantMessage,
    lastLifecycleEvent: lifecycleEvents[lifecycleEvents.length - 1],
    transcriptEvents,
  };
}
