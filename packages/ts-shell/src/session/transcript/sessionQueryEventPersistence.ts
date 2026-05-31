import type { QueryEvent } from "../../core/query/runtime/events.js";
import {
  applyLifecycleEventToIndex,
  createEmptyLifecycleIndex,
} from "../../core/tools/toolResultLifecycle.js";
import type { Session } from "../schema/sessionRecord.js";
import type { SessionStateSnapshot } from "../schema/sessionStateSnapshot.js";
import type { TranscriptEvent } from "../sessionEventCodec.js";
import { createQueryTranscriptEvent } from "../sessionEventCodec.js";
import type { SessionStateSnapshotOverrides } from "../schema/sessionStateSnapshot.js";
import { isDuplicateDurableResolutionEvent } from "../recovery/sessionLifecycleReadModel.js";

export function appendSessionQueryEvent(input: {
  readonly event: QueryEvent;
  readonly timestamp: string;
  readonly transcriptEvents: readonly TranscriptEvent[];
  readonly appendTranscriptEvent: (event: TranscriptEvent) => void;
  readonly applyQueryEventToState: (event: QueryEvent) => void;
}): void {
  if (
    isDuplicateDurableResolutionEvent({
      events: input.transcriptEvents,
      event: input.event,
    })
  ) {
    return;
  }

  input.appendTranscriptEvent(
    createQueryTranscriptEvent({
      event: input.event,
      timestamp: input.timestamp,
    }),
  );
  input.applyQueryEventToState(input.event);
}

export function applySessionQueryEventToState(input: {
  readonly session: Session;
  readonly event: QueryEvent;
  readonly withSessionStateLock: (write: () => void) => void;
  readonly readCurrentState: () => SessionStateSnapshot | undefined;
  readonly buildSessionStateSnapshot: (
    session: Session,
    current: SessionStateSnapshot | undefined,
    overrides?: SessionStateSnapshotOverrides,
  ) => SessionStateSnapshot;
  readonly applyAutoCompactRetention: (
    workingMemory: unknown,
    event: QueryEvent,
  ) => unknown;
  readonly writeSnapshot: (snapshot: SessionStateSnapshot) => void;
}): void {
  input.withSessionStateLock(() => {
    const current = input.readCurrentState();
    const nextWorkingMemory = input.applyAutoCompactRetention(
      current?.workingMemory,
      input.event,
    );
    const snapshot = input.buildSessionStateSnapshot(input.session, current, {
      pendingLifecycle: applyLifecycleEventToIndex(
        current?.pendingLifecycle ?? createEmptyLifecycleIndex(),
        input.event,
      ),
    });
    if (nextWorkingMemory !== undefined) {
      snapshot.workingMemory = nextWorkingMemory;
    }
    input.writeSnapshot(snapshot);
  });
}
