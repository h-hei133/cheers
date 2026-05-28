import {
  createEmptyLifecycleIndex,
} from "../../core/tools/toolResultLifecycle.js";
import type { Session } from "../schema/sessionRecord.js";
import type {
  SessionStateSnapshotOverrides,
  TerminalPersistence,
} from "../schema/sessionStateSnapshot.js";
import {
  createLifecycleTranscriptEvent,
  type TranscriptEvent,
} from "../sessionEventCodec.js";

interface SessionTerminalCallbacks {
  readonly loadSession: (sessionId: string) => Session;
  readonly appendTranscriptEvent: (
    sessionId: string,
    event: TranscriptEvent,
  ) => void;
  readonly writeSessionMetadata: (session: Session) => void;
  readonly writeSessionState: (
    session: Session,
    overrides?: SessionStateSnapshotOverrides,
  ) => void;
  readonly now: () => string;
}

export function saveSessionCompleted(
  callbacks: SessionTerminalCallbacks,
  sessionId: string,
  terminal?: TerminalPersistence,
): void {
  const session = callbacks.loadSession(sessionId);
  session.status = "completed";
  delete session.lastError;
  delete session.pendingPrompt;
  session.updatedAt = callbacks.now();
  callbacks.appendTranscriptEvent(
    sessionId,
    createLifecycleTranscriptEvent({
      event: "run-completed",
      timestamp: session.updatedAt,
    }),
  );
  callbacks.writeSessionMetadata(session);
  callbacks.writeSessionState(session, {
    runPhase: "idle",
    interruptedKind: undefined,
    terminalReason: terminal?.terminalReason ?? "completed",
    terminalClassification: terminal?.terminalClassification ?? "success",
    lastContinuationReason: terminal?.lastContinuationReason,
    pendingLifecycle: createEmptyLifecycleIndex(),
  });
}

export function saveSessionError(
  callbacks: SessionTerminalCallbacks,
  sessionId: string,
  error: string,
  terminal?: TerminalPersistence,
): void {
  const session = callbacks.loadSession(sessionId);
  const terminalClassification = terminal?.terminalClassification ?? "error";
  session.status = "error";
  delete session.pendingPrompt;
  if (terminalClassification === "stopped") {
    delete session.lastError;
  } else {
    session.lastError = error;
  }
  session.updatedAt = callbacks.now();
  callbacks.appendTranscriptEvent(
    sessionId,
    createLifecycleTranscriptEvent({
      event: "run-error",
      timestamp: session.updatedAt,
      detail: error,
    }),
  );
  callbacks.writeSessionMetadata(session);
  callbacks.writeSessionState(session, {
    runPhase: "idle",
    interruptedKind: undefined,
    terminalReason: terminal?.terminalReason,
    terminalClassification,
    lastContinuationReason: terminal?.lastContinuationReason,
    pendingLifecycle: createEmptyLifecycleIndex(),
  });
}
