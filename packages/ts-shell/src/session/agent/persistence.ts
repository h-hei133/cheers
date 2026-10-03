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
import { persistSessionUsage } from "../../observability/usageTelemetry.js";
import { continuityBranchScope, selectBranchResultMemory } from "../continuation/branch.js";

export function handleAppendQueryEvent(
  store: SessionStoreAccess,
  sessionId: string,
  event: QueryEvent,
  source?: { readonly entryId?: string },
): void {
  const state = store.readStateSnapshotSafely(store.statePath(sessionId));
  appendSessionQueryEvent({
    event,
    // An explicitly unavailable producer source must not fall back to a cursor
    // that may have moved while the run was awaiting output.
    sourceEntryId: source ? source.entryId ?? "" : state?.thread?.activeLeafId,
    timestamp: new Date().toISOString(),
    transcriptEvents: handleGetTranscriptEvents(store, sessionId),
    appendTranscriptEvent: (transcriptEvent) =>
      handleAppendTranscriptEvent(store, sessionId, transcriptEvent),
    applyQueryEventToState: (queryEvent, envelope) =>
      handleApplyQueryEventToState(store, sessionId, queryEvent, envelope),
  });
}

export function handleApplyQueryEventToState(
  store: SessionStoreAccess,
  sessionId: string,
  event: QueryEvent,
  envelope?: Extract<TranscriptEvent, { type: "query-event" }>,
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
    applyAutoCompactRetention: (workingMemory, queryEvent, current) => {
      const events = handleGetTranscriptEvents(store, sessionId);
      const selectedMemory = selectBranchResultMemory(workingMemory, current?.thread, events);
      if (!continuityBranchScope(current?.thread, events).admitsEntry(envelope?.sourceEntryId)) return selectedMemory;
      return applyAutoCompactRetention(
        selectedMemory,
        queryEvent,
        { source: envelope?.id && envelope.sourceEntryId !== undefined
          ? { eventId: envelope.id, entryId: envelope.sourceEntryId } : undefined },
      );
    },
    writeSnapshot: (snapshot) => persistSessionUsage(sessionId, snapshot.usage, (usage) => {
      store.writeJsonFileAtomic(statePath, { ...snapshot, usage });
    }),
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
