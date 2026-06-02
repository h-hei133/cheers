import type { Session } from "../schema/sessionRecord.js";
import type {
  SessionCompactionRecord,
  SessionThreadSnapshot,
} from "../schema/sessionThread.js";
import {
  addSessionCompactionRecord,
  appendSessionThreadChild,
  buildLinearSessionThreadSnapshot,
  createSessionBranch,
  switchSessionActiveLeaf,
} from "../schema/sessionThread.js";
import { readStateSnapshotSafely, writeSessionState } from "./sessionStateStore.js";
import type { SessionFileLayout } from "./sessionFileLayout.js";

export function readSessionThreadSnapshot(input: {
  readonly session: Session;
  readonly layout: Pick<SessionFileLayout, "statePath">;
}): SessionThreadSnapshot {
  return readStateSnapshotSafely(input.layout.statePath)?.thread ??
    buildLinearSessionThreadSnapshot(input.session);
}

export function appendDurableSessionChild(input: {
  readonly session: Session;
  readonly layout: Pick<SessionFileLayout, "statePath" | "stateLockPath">;
  readonly messageRole: "user" | "assistant";
  readonly timestamp: string;
  readonly entryId?: string;
  readonly parentEntryId?: string;
}): SessionThreadSnapshot {
  const current = readStateSnapshotSafely(input.layout.statePath)?.thread;
  const thread = appendSessionThreadChild({
    snapshot: current,
    session: input.session,
    messageRole: input.messageRole,
    timestamp: input.timestamp,
    ...(input.entryId ? { entryId: input.entryId } : {}),
    ...(input.parentEntryId ? { parentEntryId: input.parentEntryId } : {}),
  });
  writeSessionState({
    session: input.session,
    layout: input.layout,
    overrides: { thread },
  });
  return thread;
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
