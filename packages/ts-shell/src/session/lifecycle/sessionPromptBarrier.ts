import {
  createEmptyLifecycleIndex,
} from "../../core/tools/toolResultLifecycle.js";
import type { SessionMessage } from "../schema/sessionMessage.js";
import type { Session } from "../schema/sessionRecord.js";
import type { SessionStateSnapshotOverrides } from "../schema/sessionStateSnapshot.js";
import {
  createLifecycleTranscriptEvent,
  createMessageTranscriptEvent,
  type TranscriptEvent,
} from "../sessionEventCodec.js";

export function persistSessionUserPromptBarrier(input: {
  readonly session: Session;
  readonly prompt: string;
  readonly timestamp: string;
  readonly appendTranscriptEvent: (event: TranscriptEvent) => void;
  readonly writeSessionMetadata: (session: Session) => void;
  readonly writeSessionState: (
    session: Session,
    overrides?: SessionStateSnapshotOverrides,
  ) => void;
}): void {
  const nextMessage: SessionMessage & { timestamp: string } = {
    role: "user",
    content: input.prompt,
    timestamp: input.timestamp,
  };

  input.session.status = "active";
  delete input.session.lastError;
  input.session.pendingPrompt = input.prompt;
  input.session.updatedAt = input.timestamp;
  input.session.turns.push(nextMessage);

  input.appendTranscriptEvent(
    createLifecycleTranscriptEvent({
      event: "run-started",
      timestamp: input.timestamp,
      detail: input.prompt,
    }),
  );
  input.appendTranscriptEvent(createMessageTranscriptEvent(nextMessage));

  input.writeSessionMetadata(input.session);
  input.writeSessionState(input.session, {
    runPhase: "prompt-persisted",
    interruptedKind: undefined,
    terminalReason: undefined,
    terminalClassification: undefined,
    lastContinuationReason: undefined,
    pendingLifecycle: createEmptyLifecycleIndex(),
  });
}
