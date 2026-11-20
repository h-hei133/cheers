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

export type SessionSettlement = {
  session: Session;
  event: Extract<TranscriptEvent, { type: 'lifecycle' }>;
  overrides: SessionStateSnapshotOverrides;
};

export function saveSessionCompleted(
  callbacks: SessionTerminalCallbacks,
  sessionId: string,
  terminal?: TerminalPersistence,
): void {
  publishSettlement(callbacks, prepareSessionCompleted(callbacks.loadSession(sessionId), callbacks.now(), terminal));
}

export function prepareSessionCompleted(session: Session, timestamp: string, terminal?: TerminalPersistence): SessionSettlement {
  const unproven = terminal?.terminalClassification === 'completed_unproven';
  session.status = unproven ? 'completed_unproven' : "completed";
  delete session.lastError;
  delete session.pendingPrompt;
  session.updatedAt = timestamp;
  return { session,
    event: createLifecycleTranscriptEvent({
      event: unproven ? 'run-completed-unproven' : "run-completed",
      ...(unproven ? { detail: terminal?.terminalReasonCode } : {}),
      timestamp: session.updatedAt,
    }), overrides: {
    runPhase: "idle",
    interruptedKind: undefined,
    terminalReason: terminal?.terminalReason ?? "completed",
    terminalClassification: terminal?.terminalClassification ?? "success",
    terminalReasonCode: terminal?.terminalReasonCode,
    lastContinuationReason: terminal?.lastContinuationReason,
    pendingLifecycle: createEmptyLifecycleIndex(),
  } };
}

export function saveSessionError(
  callbacks: SessionTerminalCallbacks,
  sessionId: string,
  error: string,
  terminal?: TerminalPersistence,
): void {
  publishSettlement(callbacks, prepareSessionError(callbacks.loadSession(sessionId), callbacks.now(), error, terminal));
}

export function prepareSessionError(session: Session, timestamp: string, error: string, terminal?: TerminalPersistence): SessionSettlement {
  const terminalClassification = terminal?.terminalClassification ?? "error";
  session.status = "error";
  delete session.pendingPrompt;
  if (terminalClassification === "stopped") {
    delete session.lastError;
  } else {
    session.lastError = error;
  }
  session.updatedAt = timestamp;
  return { session,
    event: createLifecycleTranscriptEvent({
      event: "run-error",
      timestamp: session.updatedAt,
      detail: error,
    }), overrides: {
    runPhase: "idle",
    interruptedKind: undefined,
    terminalReason: terminal?.terminalReason,
    terminalClassification,
    terminalReasonCode: undefined,
    lastContinuationReason: terminal?.lastContinuationReason,
    pendingLifecycle: createEmptyLifecycleIndex(),
  } };
}

export function publishSettlement(callbacks: SessionTerminalCallbacks, settlement: SessionSettlement): void {
  const { session, event, overrides } = settlement;
  callbacks.appendTranscriptEvent(session.id, event);
  callbacks.writeSessionMetadata(session);
  callbacks.writeSessionState(session, overrides);
}
