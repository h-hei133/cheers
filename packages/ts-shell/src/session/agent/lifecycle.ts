import type { SessionMessage } from "../schema/sessionMessage.js";
import type { TerminalPersistence } from "../schema/sessionStateSnapshot.js";
import type { QueryRuntimeRecoveryBoundary } from "../../core/query/runtime/state.js";
import {
  markSessionRecoveryReentry,
  markSessionRunStarted,
  markSessionTurnActive,
  saveSessionInterrupted,
  saveSessionTerminated,
} from "../lifecycle/sessionLifecycleStore.js";
import { persistSessionUserPromptBarrier } from "../lifecycle/sessionPromptBarrier.js";
import {
  saveSessionCompleted,
  saveSessionError,
} from "../lifecycle/sessionTerminalStore.js";
import { appendSessionTurn } from "../transcript/sessionTranscript.js";
import type { SessionLifecycleCallbacks } from "./types.js";

export function handleMarkRunStarted(
  callbacks: SessionLifecycleCallbacks,
  sessionId: string,
  prompt: string,
): void {
  markSessionRunStarted(callbacks, sessionId, prompt);
}

export function handlePersistUserPromptBarrier(
  callbacks: SessionLifecycleCallbacks,
  sessionId: string,
  prompt: string,
): void {
  const session = callbacks.loadSession(sessionId);
  const timestamp = callbacks.now();
  persistSessionUserPromptBarrier({
    session,
    prompt,
    timestamp,
    appendTranscriptEvent: (event) => callbacks.appendTranscriptEvent(sessionId, event),
    writeSessionMetadata: (next) => callbacks.writeSessionMetadata(next),
    writeSessionState: (next, overrides) => callbacks.writeSessionState(next, overrides),
  });
}

export function handleMarkTurnActive(
  callbacks: SessionLifecycleCallbacks,
  sessionId: string,
): void {
  markSessionTurnActive(callbacks, sessionId);
}

export function handleMarkRecoveryReentry(
  callbacks: SessionLifecycleCallbacks,
  sessionId: string,
  boundary: QueryRuntimeRecoveryBoundary,
): void {
  markSessionRecoveryReentry(callbacks, sessionId, boundary);
}

export function handleSaveInterrupted(
  callbacks: SessionLifecycleCallbacks,
  sessionId: string,
  interruptedKind: "prompt" | "turn" = "prompt",
): void {
  saveSessionInterrupted(callbacks, sessionId, interruptedKind);
}

export function handleSaveCompleted(
  callbacks: SessionLifecycleCallbacks,
  sessionId: string,
  terminal?: TerminalPersistence,
): void {
  saveSessionCompleted(callbacks, sessionId, terminal);
}

export function handleSaveError(
  callbacks: SessionLifecycleCallbacks,
  sessionId: string,
  error: string,
  terminal?: TerminalPersistence,
): void {
  saveSessionError(callbacks, sessionId, error, terminal);
}
export function handleSaveTerminated(
  callbacks: SessionLifecycleCallbacks,
  sessionId: string,
): void {
  saveSessionTerminated(callbacks, sessionId);
}

export function handleAddTurn(
  callbacks: SessionLifecycleCallbacks,
  sessionId: string,
  message: SessionMessage,
): void {
  const session = callbacks.loadSession(sessionId);
  appendSessionTurn({
    session,
    message,
    timestamp: callbacks.now(),
    append: (event) => callbacks.appendTranscriptEvent(sessionId, event),
    writeMetadata: (next) => callbacks.writeSessionMetadata(next),
    writeState: (next) => callbacks.writeSessionState(next),
  });
}
