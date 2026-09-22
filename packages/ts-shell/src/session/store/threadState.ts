import type { Session } from "../schema/sessionRecord.js";
import type {
  SessionCompactionRecord,
  SessionThreadSnapshot,
} from "../schema/sessionThread.js";
import {
  addSessionCompactionRecord,
  buildLinearSessionThreadSnapshot,
  catchUpSessionThread,
  createSessionBranch,
  switchSessionActiveLeaf,
} from "../schema/sessionThread.js";
import { readStateSnapshotSafely, writeSessionState } from "./sessionStateStore.js";
import type { SessionFileLayout } from "./sessionFileLayout.js";

/**
 * The thread as the session currently stands.
 *
 * Caught up on read: a thread is built once and then kept, so it does not follow
 * the session by itself, and a reader that took the stored thread at face value
 * would see a history that stops at whichever turn was written first.
 */
export function readSessionThreadSnapshot(input: {
  readonly session: Session;
  readonly layout: Pick<SessionFileLayout, "statePath">;
}): SessionThreadSnapshot {
  return catchUpSessionThread(
    readStateSnapshotSafely(input.layout.statePath)?.thread ??
      buildLinearSessionThreadSnapshot(input.session),
    input.session,
  );
}

export function createDurableSessionBranch(input: {
  readonly session: Session;
  readonly layout: Pick<SessionFileLayout, "statePath" | "stateLockPath">;
  readonly parentEntryId: string;
  readonly leafEntryId: string;
  readonly createdAt: string;
  readonly branchId?: string;
  readonly switchReason?: string;
}): SessionThreadSnapshot {
  const current = readSessionThreadSnapshot(input);
  const thread = createSessionBranch({
    snapshot: current,
    sessionId: input.session.id,
    parentEntryId: input.parentEntryId,
    leafEntryId: input.leafEntryId,
    createdAt: input.createdAt,
    ...(input.branchId ? { branchId: input.branchId } : {}),
    ...(input.switchReason ? { switchReason: input.switchReason } : {}),
  });
  writeSessionState({
    session: input.session,
    layout: input.layout,
    overrides: { thread },
  });
  return thread;
}

export function switchDurableSessionActiveLeaf(input: {
  readonly session: Session;
  readonly layout: Pick<SessionFileLayout, "statePath" | "stateLockPath">;
  readonly leafEntryId: string;
  readonly branchId?: string;
}): SessionThreadSnapshot {
  const current = readSessionThreadSnapshot(input);
  const thread = switchSessionActiveLeaf({
    snapshot: current,
    leafEntryId: input.leafEntryId,
    ...(input.branchId ? { branchId: input.branchId } : {}),
  });
  writeSessionState({
    session: input.session,
    layout: input.layout,
    overrides: { thread },
  });
  return thread;
}

export function addDurableSessionCompaction(input: {
  readonly session: Session;
  readonly layout: Pick<SessionFileLayout, "statePath" | "stateLockPath">;
  readonly record: SessionCompactionRecord;
}): SessionThreadSnapshot {
  const current = readSessionThreadSnapshot(input);
  const thread = addSessionCompactionRecord({
    snapshot: current,
    record: input.record,
  });
  writeSessionState({
    session: input.session,
    layout: input.layout,
    overrides: { thread },
  });
  return thread;
}
