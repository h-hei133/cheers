import {
  createEmptyLifecycleIndex,
} from "../../core/tools/toolResultLifecycle.js";
import type { QueryRuntimeRecoveryBoundary } from "../../core/query/runtime/state.js";
import type { Session } from "../schema/sessionRecord.js";
import type { SessionStateSnapshotOverrides } from "../schema/sessionStateSnapshot.js";
import {
  createLifecycleTranscriptEvent,
  type TranscriptEvent,
} from "../sessionEventCodec.js";
import { publishSettlement, type SessionSettlement } from './sessionTerminalStore.js';

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

export interface SessionLifecycleTransition {
  readonly session: Session;
  readonly events: readonly TranscriptEvent[];
  readonly overrides: SessionStateSnapshotOverrides;
}

/**
 * The subject line of a session, derived from its first prompt.
 *
 * A bare id tells a user nothing about which conversation was which; the first
 * thing they typed does. The first line of the prompt, collapsed and bounded,
 * becomes the title unless the user has already named the session explicitly —
 * an explicit rename always wins over the derivation.
 */
export function deriveSessionTitleFromPrompt(prompt: string): string {
  const title: string[] = [];
  let pendingSpace = false;
  for (const point of prompt) {
    if (point === "\n") {
      if (title.length > 0) break;
      pendingSpace = false;
      continue;
    }
    if (point.trim() === "") {
      if (title.length > 0) pendingSpace = true;
      continue;
    }
    if (pendingSpace) title.push(" ");
    pendingSpace = false;
    title.push(point);
    if (title.length > 60) return `${title.slice(0, 59).join("")}…`;
  }
  return title.join("");
}

export function prepareSessionRunStarted(
  session: Session,
  timestamp: string,
  prompt: string,
): SessionLifecycleTransition {
  session.status = "active";
  delete session.lastError;
  session.pendingPrompt = prompt;
  session.updatedAt = timestamp;
  if (!session.title?.trim()) {
    const derived = deriveSessionTitleFromPrompt(prompt);
    if (derived) session.title = derived;
  }
  return {
    session,
    events: [createLifecycleTranscriptEvent({ event: "run-started", timestamp: session.updatedAt, detail: prompt })],
    overrides: {
      pendingPromptEntryId: undefined,
      terminalReason: undefined,
      terminalClassification: undefined,
      terminalReasonCode: undefined,
      lastContinuationReason: undefined,
      pendingLifecycle: createEmptyLifecycleIndex(),
    },
  };
}

export function markSessionRunStarted(
  callbacks: SessionLifecycleCallbacks,
  sessionId: string,
  prompt: string,
): void {
  const prepared = prepareSessionRunStarted(callbacks.loadSession(sessionId), callbacks.now(), prompt);
  for (const event of prepared.events) callbacks.appendTranscriptEvent(sessionId, event);
  callbacks.writeSessionMetadata(prepared.session);
  callbacks.writeSessionState(prepared.session, prepared.overrides);
}

export function prepareSessionTurnActive(
  session: Session,
  timestamp: string,
): SessionLifecycleTransition {
  delete session.lastError;
  session.updatedAt = timestamp;
  return {
    session,
    events: [],
    overrides: {
      runPhase: "turn-active",
      interruptedKind: undefined,
      terminalReason: undefined,
      terminalClassification: undefined,
      terminalReasonCode: undefined,
      lastContinuationReason: undefined,
      pendingLifecycle: createEmptyLifecycleIndex(),
    },
  };
}

export function markSessionTurnActive(
  callbacks: SessionLifecycleCallbacks,
  sessionId: string,
): void {
  const prepared = prepareSessionTurnActive(callbacks.loadSession(sessionId), callbacks.now());
  callbacks.writeSessionMetadata(prepared.session);
  callbacks.writeSessionState(prepared.session, prepared.overrides);
}

export function prepareSessionRecoveryReentry(
  session: Session,
  timestamp: string,
  boundary: QueryRuntimeRecoveryBoundary,
): SessionLifecycleTransition {
  session.status = "active";
  delete session.lastError;
  session.updatedAt = timestamp;
  return {
    session,
    events: [],
    overrides: {
      runPhase: boundary === "mid-turn-reentry" ? "turn-active" : "prompt-persisted",
      interruptedKind: boundary === "mid-turn-reentry" ? "turn" : "prompt",
      terminalReason: undefined,
      terminalClassification: undefined,
      terminalReasonCode: undefined,
      lastContinuationReason: undefined,
    },
  };
}

export function markSessionRecoveryReentry(
  callbacks: SessionLifecycleCallbacks,
  sessionId: string,
  boundary: QueryRuntimeRecoveryBoundary,
): void {
  const prepared = prepareSessionRecoveryReentry(callbacks.loadSession(sessionId), callbacks.now(), boundary);
  callbacks.writeSessionMetadata(prepared.session);
  callbacks.writeSessionState(prepared.session, prepared.overrides);
}

export function saveSessionInterrupted(
  callbacks: SessionLifecycleCallbacks,
  sessionId: string,
  interruptedKind: "prompt" | "turn" = "prompt",
): void {
  publishSettlement(callbacks, prepareSessionInterrupted(callbacks.loadSession(sessionId), callbacks.now(), interruptedKind));
}

export function prepareSessionInterrupted(
  session: Session, timestamp: string, interruptedKind: "prompt" | "turn"
): SessionSettlement {
  session.status = "interrupted";
  delete session.lastError;
  session.updatedAt = timestamp;
  return { session,
    event: createLifecycleTranscriptEvent({
      event: "run-interrupted",
      timestamp: session.updatedAt,
      detail: session.pendingPrompt,
    }), overrides: {
    interruptedKind,
    terminalReason: undefined,
    terminalClassification: undefined,
    terminalReasonCode: undefined,
    lastContinuationReason: undefined,
  } };
}

export function prepareSessionTerminated(
  session: Session,
  timestamp: string,
): SessionLifecycleTransition {
  session.status = "terminated";
  delete session.lastError;
  delete session.pendingPrompt;
  session.updatedAt = timestamp;
  return {
    session,
    events: [createLifecycleTranscriptEvent({ event: "run-terminated", timestamp: session.updatedAt })],
    overrides: {
      runPhase: "idle",
      interruptedKind: undefined,
      terminalReason: undefined,
      terminalClassification: undefined,
      terminalReasonCode: undefined,
      lastContinuationReason: undefined,
      pendingLifecycle: createEmptyLifecycleIndex(),
    },
  };
}

export function saveSessionTerminated(
  callbacks: SessionLifecycleCallbacks,
  sessionId: string,
): void {
  const prepared = prepareSessionTerminated(callbacks.loadSession(sessionId), callbacks.now());
  for (const event of prepared.events) callbacks.appendTranscriptEvent(sessionId, event);
  callbacks.writeSessionMetadata(prepared.session);
  callbacks.writeSessionState(prepared.session, prepared.overrides);
}
