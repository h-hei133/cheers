import {
  createEmptyLifecycleIndex,
} from "../../core/tools/toolResultLifecycle.js";
import type { SessionMessage } from "../schema/sessionMessage.js";
import type { Session } from "../schema/sessionRecord.js";
import type { SessionStateSnapshotOverrides } from "../schema/sessionStateSnapshot.js";
import {
  createLifecycleTranscriptEvent,
  createMessageTranscriptEvent,
  createTranscriptEntryId,
  type TranscriptEvent,
} from "../sessionEventCodec.js";
import { deriveSessionTitleFromPrompt } from "./sessionLifecycleStore.js";

export function persistSessionUserPromptBarrier(input: {
  readonly session: Session;
  readonly prompt: string;
  readonly timestamp: string;
  readonly metadata?: Record<string, unknown>;
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
    ...(input.metadata ? { metadata: input.metadata } : {}),
    // Named here so the thread entry and the transcript line agree, as in
    // `appendSessionTurn`. Both writers have to do this or a branch would only
    // resolve for half the turns.
    id: createTranscriptEntryId("turn"),
  };

  input.session.status = "active";
  delete input.session.lastError;
  input.session.pendingPrompt = input.prompt;
  input.session.updatedAt = input.timestamp;
  if (!input.session.title?.trim()) {
    const derived = deriveSessionTitleFromPrompt(input.prompt);
    if (derived) input.session.title = derived;
  }
  input.session.turns.push(nextMessage);

  input.appendTranscriptEvent(
    createLifecycleTranscriptEvent({
      event: "run-started",
      sourceEntryId: nextMessage.id,
      timestamp: input.timestamp,
      detail: input.prompt,
    }),
  );
  input.appendTranscriptEvent(createMessageTranscriptEvent(nextMessage));

  input.writeSessionMetadata(input.session);
  input.writeSessionState(input.session, {
    runPhase: "prompt-persisted",
    pendingPromptEntryId: nextMessage.id,
    interruptedKind: undefined,
    terminalReason: undefined,
    terminalClassification: undefined,
    lastContinuationReason: undefined,
    pendingLifecycle: createEmptyLifecycleIndex(),
  });
}
