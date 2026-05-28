import {
  createEmptyLifecycleIndex,
} from "../../core/tools/toolResultLifecycle.js";
import type { QueryRuntimeRecoveryBoundary } from "../../core/query/runtimeState.js";
import type { Session } from "../schema/sessionRecord.js";
import type { SessionStateSnapshotOverrides } from "../schema/sessionStateSnapshot.js";
import {
  createLifecycleTranscriptEvent,
  type TranscriptEvent,
} from "../sessionEventCodec.js";

interface SessionLifecycleCallbacks {
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

export function markSessionRunStarted(
  callbacks: SessionLifecycleCallbacks,
  sessionId: string,
  prompt: string,
): void {
  const session = callbacks.loadSession(sessionId);
  session.status = "active";
  delete session.lastError;
  session.pendingPrompt = prompt;
  session.updatedAt = callbacks.now();
  callbacks.appendTranscriptEvent(
    sessionId,
    createLifecycleTranscriptEvent({
      event: "run-started",
      timestamp: session.updatedAt,
      detail: prompt,
    }),
  );
  callbacks.writeSessionMetadata(session);
  callbacks.writeSessionState(session, {
    terminalReason: undefined,
    terminalClassification: undefined,
    lastContinuationReason: undefined,
    pendingLifecycle: createEmptyLifecycleIndex(),
  });
}

export function markSessionTurnActive(
  callbacks: SessionLifecycleCallbacks,
  sessionId: string,
): void {
  const session = callbacks.loadSession(sessionId);
  delete session.lastError;
  session.updatedAt = callbacks.now();
  callbacks.writeSessionMetadata(session);
  callbacks.writeSessionState(session, {
    runPhase: "turn-active",
    interruptedKind: undefined,
    terminalReason: undefined,
    terminalClassification: undefined,
    lastContinuationReason: undefined,
    pendingLifecycle: createEmptyLifecycleIndex(),
  });
}

export function markSessionRecoveryReentry(
  callbacks: SessionLifecycleCallbacks,
  sessionId: string,
  boundary: QueryRuntimeRecoveryBoundary,
): void {
  const session = callbacks.loadSession(sessionId);
  session.status = "active";
  delete session.lastError;
  session.updatedAt = callbacks.now();
  callbacks.writeSessionMetadata(session);
  callbacks.writeSessionState(session, {
    runPhase:
      boundary === "mid-turn-reentry" ? "turn-active" : "prompt-persisted",
    interruptedKind: boundary === "mid-turn-reentry" ? "turn" : "prompt",
    terminalReason: undefined,
    terminalClassification: undefined,
    lastContinuationReason: undefined,
  });
}

export function saveSessionInterrupted(
  callbacks: SessionLifecycleCallbacks,
  sessionId: string,
  interruptedKind: "prompt" | "turn" = "prompt",
): void {
  const session = callbacks.loadSession(sessionId);
  session.status = "interrupted";
  delete session.lastError;
  session.updatedAt = callbacks.now();
  callbacks.appendTranscriptEvent(
    sessionId,
    createLifecycleTranscriptEvent({
      event: "run-interrupted",
      timestamp: session.updatedAt,
      detail: session.pendingPrompt,
    }),
  );
  callbacks.writeSessionMetadata(session);
  callbacks.writeSessionState(session, {
    interruptedKind,
    terminalReason: undefined,
    terminalClassification: undefined,
    lastContinuationReason: undefined,
  });
}

export function saveSessionTerminated(
  callbacks: SessionLifecycleCallbacks,
  sessionId: string,
): void {
  const session = callbacks.loadSession(sessionId);
  session.status = "terminated";
  delete session.lastError;
  delete session.pendingPrompt;
  session.updatedAt = callbacks.now();
  callbacks.appendTranscriptEvent(
    sessionId,
    createLifecycleTranscriptEvent({
      event: "run-terminated",
      timestamp: session.updatedAt,
    }),
  );
  callbacks.writeSessionMetadata(session);
  callbacks.writeSessionState(session, {
    runPhase: "idle",
    interruptedKind: undefined,
    terminalReason: undefined,
    terminalClassification: undefined,
    lastContinuationReason: undefined,
    pendingLifecycle: createEmptyLifecycleIndex(),
  });
}
