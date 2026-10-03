import type { QueryRuntimeRepairSummary } from "../../core/query/runtime/state.js";
import type { QueryRuntimeTaskState } from "../../core/query/runtime/taskState.js";
import { decodeQueryRuntimeTaskState } from "../../core/query/runtime/taskState.js";
import type { QueryRuntimeHarnessState } from "../../core/query/runtime/harness.js";
import type { DurableLifecycleIndex } from "../../core/tools/toolResultLifecycle.js";
import type {
  ContinuationReason,
  TerminalClassification,
  TerminalReason,
} from "../../result/types.js";
import type { SessionMessage } from "../schema/sessionMessage.js";
import type { Session } from "../schema/sessionRecord.js";
import type { SessionStateSnapshot } from "../schema/sessionStateSnapshot.js";
import {
  decodeCompactSessionHarnessState,
  decodeSessionHarnessState,
} from "../harness/state.js";
import type { TranscriptEvent } from "../sessionEventCodec.js";
import {
  normalizeReplayTranscriptEvents,
  prepareReplayTranscript,
} from "../replay/builder.js";
import { deriveLifecycleIndexFromTranscript } from "./sessionLifecycleReadModel.js";
export type { RecoverySnapshot } from "./types.js";
import type { RecoverySnapshot } from "./types.js";
import { recoveryPendingRunStart, recoveryTaskMemory, selectedRecoveryTerminal, selectRecoveryScope } from "./scope.js";

export function buildSessionRecoverySnapshot(input: {
  readonly sessionId: string;
  readonly session: Session;
  readonly state: SessionStateSnapshot;
  readonly transcriptEvents: readonly TranscriptEvent[];
}): RecoverySnapshot {
  const scope = selectRecoveryScope(input);
  const normalizedEvents = normalizeReplayTranscriptEvents(scope.transcriptEvents);
  const replayPreparation = prepareReplayTranscript(
    normalizedEvents,
    {
      sessionId: input.sessionId,
      state: scope.state,
      pendingPrompt: scope.pendingPrompt,
      allowInterruptionRepair: scope.allowInterruptionRepair,
      pendingRunStart: recoveryPendingRunStart(scope.state, normalizedEvents),
      pendingPromptEntryId: scope.state.pendingPromptEntryId,
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
  const memory = recoveryTaskMemory(scope.state.workingMemory, scope.useLegacyState);
  const harnessState = decodeSnapshotHarnessState({ ...scope.state, workingMemory: memory,
    harness: scope.useLegacyState ? input.state.harness : undefined });
  const terminal = scope.useLegacyState ? input.state : selectedRecoveryTerminal(transcriptEvents);

  return {
    pendingPrompt: scope.pendingPrompt,
    runPhase: scope.state.runPhase,
    interruptedKind: scope.state.interruptedKind,
    durableStatus: terminal.durableStatus,
    terminalReason: terminal.terminalReason,
    terminalClassification: terminal.terminalClassification,
    lastContinuationReason: scope.useLegacyState ? input.state.lastContinuationReason : undefined,
    lastError: terminal.lastError,
    pendingLifecycle: readModelLifecycle,
    repairSummary: replayPreparation.repairSummary,
    ...(harnessState.status === "accepted"
      ? { harness: harnessState.harness }
      : {}),
    ...(decodeCompactTaskState(memory)
      ? { taskState: decodeCompactTaskState(memory) }
      : {}),
    lastUserMessage,
    lastAssistantMessage,
    lastLifecycleEvent: lifecycleEvents[lifecycleEvents.length - 1],
    transcriptEvents,
  };
}

function decodeSnapshotHarnessState(
  state: SessionStateSnapshot,
): ReturnType<typeof decodeSessionHarnessState> {
  const direct = decodeSessionHarnessState(state.harness);
  if (direct.status === "accepted") return direct;
  return decodeCompactSessionHarnessState(state.workingMemory);
}

function decodeCompactTaskState(workingMemory: unknown): QueryRuntimeTaskState | undefined {
  if (!workingMemory || typeof workingMemory !== "object" || Array.isArray(workingMemory)) {
    return undefined;
  }
  const root = workingMemory as Record<string, unknown>;
  const continuity = root.continuity;
  if (!continuity || typeof continuity !== "object" || Array.isArray(continuity)) {
    return undefined;
  }
  return decodeQueryRuntimeTaskState((continuity as Record<string, unknown>).taskState);
}
