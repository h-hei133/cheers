import { sessionRootEntryId, type SessionThreadSnapshot } from '../schema/sessionThread.js';
import type { TranscriptEvent } from '../sessionEventCodec.js';
import { compactionPublicationDigest, publishedCompactionEvents } from '../compaction/publication.js';

/** A copied receipt follows the copied root; only an already exact proof may be remapped. */
export function forkTranscriptEvents(events: readonly TranscriptEvent[], sourceId: string, targetId: string): readonly TranscriptEvent[] {
  const sourceRoot = sessionRootEntryId(sourceId); const targetRoot = sessionRootEntryId(targetId);
  const published = new Set(publishedCompactionEvents(events));
  const proofs = new Map<string, { readonly before: string; readonly after: string }>();
  const copied = events.map(event => {
    if (event.type === 'compaction' && event.sourceActivePath) {
      const next = { ...event, sourceActivePath: event.sourceActivePath.map(id => id === sourceRoot ? targetRoot : id) };
      if (event.id && published.has(event)) proofs.set(event.id,
        { before: compactionPublicationDigest(event), after: compactionPublicationDigest(next) });
      return next;
    }
    return event;
  });
  return copied.map(event => {
    const proof = event.type === 'compaction-commit' ? proofs.get(event.compactionId) : undefined;
    return event.type === 'compaction-commit' && proof?.before === event.digest ? { ...event, digest: proof.after } : event;
  });
}

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
