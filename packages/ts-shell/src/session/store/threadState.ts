import type { Session } from "../schema/sessionRecord.js";
import { randomUUID } from 'node:crypto';
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
import { readStateSnapshotRequired, readStateSnapshotSafely, withSessionStateLock, writeSessionState } from "./sessionStateStore.js";
import { writeJsonFileAtomic } from './sessionFileStore.js';
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
  const thread = { ...createSessionBranch({
    snapshot: current,
    sessionId: input.session.id,
    parentEntryId: input.parentEntryId,
    leafEntryId: input.leafEntryId,
    createdAt: input.createdAt,
    ...(input.branchId ? { branchId: input.branchId } : {}),
    ...(input.switchReason ? { switchReason: input.switchReason } : {}),
  }), navigationRevision: randomUUID() };
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
  readonly expected?: { readonly thread: SessionThreadSnapshot | undefined; readonly projectRoot: string | undefined };
  readonly beforeWrite?: () => void;
}): SessionThreadSnapshot {
  return withSessionStateLock(input.layout, () => {
    const state = readStateSnapshotRequired(input.layout.statePath);
    if (input.expected && (JSON.stringify(state.thread) !== JSON.stringify(input.expected.thread)
      || state.projectRoot !== input.expected.projectRoot)) {
      throw new Error('The session branch or project changed while preparing navigation.');
    }
    const current = catchUpSessionThread(state.thread ?? buildLinearSessionThreadSnapshot(input.session), input.session);
    const thread = { ...switchSessionActiveLeaf({
      snapshot: current,
      leafEntryId: input.leafEntryId,
      ...(input.branchId ? { branchId: input.branchId } : {}),
    }), navigationRevision: randomUUID() };
    input.beforeWrite?.();
    // Navigation changes the thread only, preserving unrelated state read under the lock.
    writeJsonFileAtomic(input.layout.statePath, { ...state, thread });
    return thread;
  }, { requireExisting: true });
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
