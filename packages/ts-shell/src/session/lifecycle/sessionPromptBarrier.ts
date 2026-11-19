import {
  createEmptyLifecycleIndex,
} from "../../core/tools/toolResultLifecycle.js";
import type { SessionMessage } from "../schema/sessionMessage.js";
import type { ImageContent } from "../../model-adapters/multimodal.js";
import type { Session } from "../schema/sessionRecord.js";
import type { SessionStateSnapshotOverrides } from "../schema/sessionStateSnapshot.js";
import {
  createLifecycleTranscriptEvent,
  createMessageTranscriptEvent,
  createTranscriptEntryId,
  type TranscriptEvent,
} from "../sessionEventCodec.js";
import { deriveSessionTitleFromPrompt } from "./sessionLifecycleStore.js";

export function prepareSessionUserPromptBarrier(input: {
  readonly session: Session;
  readonly prompt: string;
  readonly timestamp: string;
  readonly metadata?: Record<string, unknown>;
  readonly images?: readonly ImageContent[];
}): { readonly session: Session; readonly events: readonly TranscriptEvent[]; readonly overrides: SessionStateSnapshotOverrides } {
  const nextMessage: SessionMessage & { timestamp: string } = {
    role: "user",
    content: input.images?.length ? [{ type: "text", text: input.prompt }, ...input.images.map(image => ({ ...image }))] : input.prompt,
    timestamp: input.timestamp,
    ...(input.metadata ? { metadata: input.metadata } : {}),
    // Named here so the thread entry and the transcript line agree, as in
    // `appendSessionTurn`. Both writers have to do this or a branch would only
    // resolve for half the turns.
    id: createTranscriptEntryId("turn"),
  };

  const session: Session = { ...input.session, status: 'active', pendingPrompt: input.prompt,
    updatedAt: input.timestamp, turns: [...input.session.turns, nextMessage] };
  delete session.lastError;
  if (!session.title?.trim()) {
    const derived = deriveSessionTitleFromPrompt(input.prompt);
    if (derived) session.title = derived;
  }
  return { session, events: [createLifecycleTranscriptEvent({
      event: "run-started",
      sourceEntryId: nextMessage.id,
      timestamp: input.timestamp,
      detail: input.prompt,
    }), createMessageTranscriptEvent(nextMessage)], overrides: {
    runPhase: "prompt-persisted",
    pendingPromptEntryId: nextMessage.id,
    interruptedKind: undefined,
    terminalReason: undefined,
    terminalClassification: undefined,
    terminalReasonCode: undefined,
    lastContinuationReason: undefined,
    pendingLifecycle: createEmptyLifecycleIndex(),
  } };
}
