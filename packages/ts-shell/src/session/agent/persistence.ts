import type { Session } from "../schema/sessionRecord.js";
import type {
  SessionStateSnapshot,
  SessionStateSnapshotOverrides,
} from "../schema/sessionStateSnapshot.js";
import { buildSessionStateSnapshot } from "../schema/sessionStateSnapshot.js";
import type { SessionStoreAccess } from "../store/sessionStoreAccess.js";
import type { QueryEvent } from "../../core/query/runtime/events.js";
import type { TranscriptEvent } from "../sessionEventCodec.js";
import {
  appendSessionQueryEvent,
  applySessionQueryEventToState,
} from "../transcript/sessionQueryEventPersistence.js";
import {
  appendTranscriptEvent as appendTranscriptEventToStore,
  readTranscriptEvents,
} from "../transcript/sessionTranscript.js";
import { applyAutoCompactRetention } from "./compaction.js";

export function handleAppendQueryEvent(
  store: SessionStoreAccess,
  sessionId: string,
  event: QueryEvent,
): void {
  appendSessionQueryEvent({
    event,
    timestamp: new Date().toISOString(),
    transcriptEvents: handleGetTranscriptEvents(store, sessionId),
    appendTranscriptEvent: (transcriptEvent) =>
      handleAppendTranscriptEvent(store, sessionId, transcriptEvent),
    applyQueryEventToState: (queryEvent) =>
      handleApplyQueryEventToState(store, sessionId, queryEvent),
  });
}

export function handleApplyQueryEventToState(
  store: SessionStoreAccess,
  sessionId: string,
  event: QueryEvent,
): void {
  const session = store.load(sessionId);
  const statePath = store.statePath(sessionId);
  applySessionQueryEventToState({
    session,
    event,
    withSessionStateLock: (write) => store.withSessionStateLock(sessionId, write),
    readCurrentState: () => store.readStateSnapshotSafely(statePath),
    buildSessionStateSnapshot: (nextSession, current, overrides) =>
      handleBuildSessionStateSnapshot(nextSession, current, overrides),
    applyAutoCompactRetention: (workingMemory, queryEvent) =>
      applyAutoCompactRetention(workingMemory, queryEvent),
    writeSnapshot: (snapshot) => store.writeJsonFileAtomic(statePath, snapshot),
  });
}

export function handleAppendTranscriptEvent(
  store: SessionStoreAccess,
  sessionId: string,
  event: TranscriptEvent,
): void {
  appendTranscriptEventToStore(store.transcriptPath(sessionId), event);
}

export function handleGetTranscriptEvents(
  store: SessionStoreAccess,
  sessionId: string,
): TranscriptEvent[] {
  return readTranscriptEvents(store.transcriptPath(sessionId));
}

export function handleBuildSessionStateSnapshot(
  session: Session,
  current?: SessionStateSnapshot | null,
  overrides?: SessionStateSnapshotOverrides,
): SessionStateSnapshot {
  return buildSessionStateSnapshot(session, current ?? undefined, overrides);
}
