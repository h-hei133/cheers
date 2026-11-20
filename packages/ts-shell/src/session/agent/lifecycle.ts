import type { SessionMessage } from "../schema/sessionMessage.js";
import type { QueryRuntimeRecoveryBoundary } from "../../core/query/runtime/state.js";
import {
  markSessionRecoveryReentry,
  markSessionRunStarted,
  markSessionTurnActive,
  saveSessionTerminated,
} from "../lifecycle/sessionLifecycleStore.js";
import { appendSessionTurn } from "../transcript/sessionTranscript.js";
import type { SessionLifecycleCallbacks } from "./types.js";

export function handleMarkRunStarted(
  callbacks: SessionLifecycleCallbacks,
  sessionId: string,
  prompt: string,
): void {
  markSessionRunStarted(callbacks, sessionId, prompt);
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
