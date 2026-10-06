import { sessionRootEntryId, type SessionThreadSnapshot } from '../schema/sessionThread.js';

/** Copied events keep their identities; only the session root belongs to the new session. */
export function forkThread(thread: SessionThreadSnapshot, sourceId: string, targetId: string): SessionThreadSnapshot {
  const sourceRoot = sessionRootEntryId(sourceId); const targetRoot = sessionRootEntryId(targetId);
  const remap = (id: string): string => id === sourceRoot ? targetRoot : id;
  return { ...thread,
    ...(thread.activeLeafId ? { activeLeafId: remap(thread.activeLeafId) } : {}),
    entries: thread.entries.map(entry => ({ ...entry, id: remap(entry.id),
      ...(entry.parentId ? { parentId: remap(entry.parentId) } : {}) })),
    branches: thread.branches.map(branch => ({ ...branch, parentEntryId: remap(branch.parentEntryId), leafEntryId: remap(branch.leafEntryId) })),
    compactions: thread.compactions.map(record => ({ ...record, sourceActivePath: record.sourceActivePath.map(remap),
      retainedEntryIds: record.retainedEntryIds.map(remap), excludedEntryIds: record.excludedEntryIds.map(remap) })),
  };
}
