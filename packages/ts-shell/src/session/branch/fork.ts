import { sessionRootEntryId, type SessionThreadSnapshot } from '../schema/sessionThread.js';
import type { TranscriptEvent } from '../sessionEventCodec.js';
import { compactionPublicationDigest, publishedCompactionEvents } from '../compaction/publication.js';

/**
 * A fork starts a new direction; it does not inherit work in flight.
 *
 * The recovery read model rebuilds its pending-tool index from the transcript,
 * so copying a `tool.started` whose result never arrived would make the fork
 * look like it owed that call. The call belonged to the source session, and the
 * fork must not be offered as a place to resume it.
 */
function unfinishedToolCallIds(events: readonly TranscriptEvent[]): ReadonlySet<string> {
  const started = new Set<string>();
  const settled = new Set<string>();
  for (const event of events) {
    if (event.type !== 'query-event') continue;
    const inner = event.event;
    // An approval is asked before the tool starts, so a call can be pending with
    // no `tool.started` of its own. Seeding only from `tool.started` left that
    // approval in the fork, which then reported work it never began.
    if (inner.type === 'tool.started' || inner.type === 'approval.requested') started.add(inner.taskId);
    else if (inner.type === 'tool.result' || inner.type === 'tool.settled'
      || inner.type === 'approval.resolved') settled.add(inner.taskId);
  }
  return new Set([...started].filter(id => !settled.has(id)));
}

/** A copied receipt follows the copied root; only an already exact proof may be remapped. */
export function forkTranscriptEvents(events: readonly TranscriptEvent[], sourceId: string, targetId: string): readonly TranscriptEvent[] {
  const sourceRoot = sessionRootEntryId(sourceId); const targetRoot = sessionRootEntryId(targetId);
  const published = new Set(publishedCompactionEvents(events));
  const proofs = new Map<string, { readonly before: string; readonly after: string }>();
  // Events that would recreate a call the fork does not owe are dropped; the
  // message history that describes the conversation is kept.
  const unfinished = unfinishedToolCallIds(events);
  const copied = events
    .filter(event => event.type !== 'query-event' || !('taskId' in event.event)
      || !unfinished.has((event.event as { readonly taskId: string }).taskId))
    .map(event => {
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
