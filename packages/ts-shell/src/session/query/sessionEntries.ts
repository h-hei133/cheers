import type { SessionThreadEntry, SessionThreadSnapshot } from "../schema/sessionThread.js";
import type { TranscriptEvent } from "../sessionEventCodec.js";

/**
 * Reading a session the way a client outside this process needs to.
 *
 * The transcript is an append-only log whose every line has a stable id, and the
 * thread records how those lines relate. Both were already here; what was missing
 * was a way to ask for them. Without one a client could read the files itself, but
 * only by knowing the directory layout and the line format, and only by re-reading
 * the whole file to find what it had not seen — which is the difference between a
 * format and a contract.
 *
 * The entry id is the cursor. It is stable across restarts because it is written
 * into the line (or derived from the line number for transcripts written before ids
 * existed), so a client that remembers the last id it saw can ask for what came
 * after it, and gets the same answer whatever else has happened meanwhile.
 */

/** One entry as a client receives it. */
export interface SessionEntryView {
  readonly id: string;
  readonly type: TranscriptEvent["type"];
  readonly timestamp: string;
  /** What the entry carries, in the same shape the transcript stores. */
  readonly entry: TranscriptEvent;
}

export interface SessionEntriesResult {
  /** Entries after the cursor, in append order. */
  readonly entries: readonly SessionEntryView[];
  /** The current leaf, so a client can tell in one round trip whether the branch moved. */
  readonly leafId: string | null;
}

export type SessionEntriesFailure = "unknown-cursor";

/**
 * Entries in append order, optionally only those after `since`.
 *
 * The cursor is exclusive: a client that passes the last id it handled gets only
 * what it has not seen. Passing an id that is not in the session is an error rather
 * than an empty result, because the two mean opposite things to a synchronising
 * client — "nothing new" against "your cursor is from somewhere else, and starting
 * from here would silently skip everything in between".
 *
 * Pre-compaction history and abandoned branches are included. A client that wants
 * only what the conversation currently says wants messages, not entries; this is for
 * one that is tracking the file.
 */
export function readSessionEntries(
  events: readonly TranscriptEvent[],
  leafId: string | null,
  since?: string,
): SessionEntriesResult | SessionEntriesFailure {
  const withIds = events.filter((event): event is TranscriptEvent & { id: string } => event.id !== undefined);

  let start = 0;
  if (since !== undefined) {
    const at = withIds.findIndex((event) => event.id === since);
    if (at === -1) return "unknown-cursor";
    start = at + 1;
  }

  return {
    entries: withIds.slice(start).map((event) => ({
      id: event.id,
      type: event.type,
      timestamp: event.timestamp,
      entry: event,
    })),
    leafId,
  };
}

/** A node in the session tree, with its children in append order. */
export interface SessionTreeNodeView {
  readonly entry: SessionThreadEntry;
  readonly children: readonly SessionTreeNodeView[];
}

export type SessionTreeFailure = "unknown-cursor";

/**
 * The session as a tree of entries.
 *
 * Returned as a list because a session can have more than one root: a branch created
 * from a point whose parent chain no longer resolves starts a new one, and an entry
 * whose parent is missing would otherwise be dropped from the answer entirely. An
 * orphan kept as a root is visible; an orphan silently omitted is not.
 *
 * `since` narrows the result to the subtree containing that entry, which is how a
 * client asks about one branch rather than the whole session.
 */
export function readSessionTree(
  entries: readonly SessionThreadEntry[],
  since?: string,
): readonly SessionTreeNodeView[] | SessionTreeFailure {
  let scope: Set<string> | undefined;
  if (since !== undefined) {
    const target = entries.find((entry) => entry.id === since);
    if (!target) return "unknown-cursor";
    scope = collectSubtree(entries, since);
  }

  const included = scope ? entries.filter((entry) => scope.has(entry.id)) : entries;
  const nodes = new Map<string, { entry: SessionThreadEntry; children: SessionTreeNodeView[] }>();
  for (const entry of included) {
    nodes.set(entry.id, { entry, children: [] });
  }

  const roots: SessionTreeNodeView[] = [];
  for (const entry of included) {
    const node = nodes.get(entry.id)!;
    // An entry that names itself as its parent is a root, not its own child. The
    // chain a client walks has to end somewhere, and this is the shape a writer
    // takes when it has no parent to record but a field it must fill.
    const parent =
      entry.parentId === undefined || entry.parentId === entry.id
        ? undefined
        : nodes.get(entry.parentId);
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  // Append order within each level, so two reads of the same session agree.
  const sort = (list: readonly SessionTreeNodeView[]): SessionTreeNodeView[] =>
    [...list]
      .sort((left, right) => left.entry.order - right.entry.order)
      .map((node) => ({ entry: node.entry, children: sort(node.children) }));
  return sort(roots);
}

/** Every entry reachable downward from `rootId`, including it. */
function collectSubtree(entries: readonly SessionThreadEntry[], rootId: string): Set<string> {
  const childrenOf = new Map<string, string[]>();
  for (const entry of entries) {
    if (entry.parentId === undefined) continue;
    const list = childrenOf.get(entry.parentId);
    if (list) list.push(entry.id);
    else childrenOf.set(entry.parentId, [entry.id]);
  }

  const seen = new Set<string>();
  const queue = [rootId];
  while (queue.length > 0) {
    const id = queue.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    queue.push(...(childrenOf.get(id) ?? []));
  }
  return seen;
}

/** The active leaf of a snapshot, or null when the session is empty. */
export function threadLeafId(snapshot: SessionThreadSnapshot): string | null {
  return snapshot.activeLeafId ?? null;
}
