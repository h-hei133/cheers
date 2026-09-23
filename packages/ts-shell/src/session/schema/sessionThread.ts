import { freezeDeep } from "../../core/values/freeze.js";
import type { Session } from "./sessionRecord.js";

export type SessionThreadEntryKind = "session-root" | "turn-message";

export interface SessionThreadEntry {
  readonly id: string;
  readonly parentId?: string;
  readonly kind: SessionThreadEntryKind;
  readonly role?: "system" | "user" | "assistant" | "tool";
  readonly order: number;
  readonly timestamp?: string;
}

export interface SessionBranchRecord {
  readonly branchId: string;
  readonly parentEntryId: string;
  readonly leafEntryId: string;
  readonly createdAt: string;
  readonly switchReason?: string;
}

export type SessionCompactionFactStatus =
  | "safe"
  | "stale"
  | "unsafe"
  | "unsupported"
  | "missing";

export interface SessionCompactionFact {
  readonly factId: string;
  readonly status: SessionCompactionFactStatus;
  readonly safeSummary?: string;
}

export interface SessionCompactionRecord {
  readonly compactionId: string;
  readonly sourceActivePath: readonly string[];
  readonly retainedEntryIds: readonly string[];
  readonly excludedEntryIds: readonly string[];
  readonly retainedContextFacts: readonly SessionCompactionFact[];
  readonly excludedContextFacts: readonly SessionCompactionFact[];
  readonly staleInputIds: readonly string[];
  readonly unsafeInputIds: readonly string[];
  readonly missingFactIds: readonly string[];
  readonly unsupportedFactIds: readonly string[];
  readonly firstRetainedEntryId?: string;
  readonly summaryAvailability: "available" | "missing";
  readonly summaryProvenance:
    | "user-provided"
    | "runtime-projected"
    | "synthetic-fixture"
    | "missing";
  readonly createdAt: string;
  readonly tokenMetadata?: {
    readonly tokensBefore?: number;
    readonly sizeBefore?: number;
  };
}

export interface SessionThreadSnapshot {
  readonly schemaVersion: 1;
  readonly entries: readonly SessionThreadEntry[];
  readonly activeLeafId?: string;
  readonly activeBranchId?: string;
  readonly branches: readonly SessionBranchRecord[];
  readonly compactions: readonly SessionCompactionRecord[];
}

export function buildLinearSessionThreadSnapshot(
  session: Session,
): SessionThreadSnapshot {
  const rootId = sessionRootEntryId(session.id);
  const entries: SessionThreadEntry[] = [
    {
      id: rootId,
      kind: "session-root",
      order: 0,
      timestamp: session.createdAt,
    },
  ];

  session.turns.forEach((turn, index) => {
    const order = index + 1;
    // The turn's own id when it has one, matching what catch-up produces, so the
    // two builders cannot name the same turn differently. A turn recorded before
    // ids existed falls back to its position.
    const id = turn.id ?? sessionTurnEntryId(session.id, order);
    entries.push({
      id,
      parentId: entries.at(-1)!.id,
      kind: "turn-message",
      role: turn.role,
      order,
      ...(turn.timestamp ? { timestamp: turn.timestamp } : {}),
    });
  });

  return freezeDeep({
    schemaVersion: 1,
    entries,
    activeLeafId: entries.at(-1)?.id ?? rootId,
    branches: [],
    compactions: [],
  });
}

export function appendSessionThreadChild(input: {
  readonly snapshot: SessionThreadSnapshot | undefined;
  readonly session: Session;
  readonly messageRole: "system" | "user" | "assistant" | "tool";
  readonly timestamp: string;
  readonly entryId?: string;
  readonly parentEntryId?: string;
}): SessionThreadSnapshot {
  const base = input.snapshot ?? buildLinearSessionThreadSnapshot(input.session);
  const parentEntryId =
    input.parentEntryId ?? base.activeLeafId ?? base.entries.at(-1)?.id ?? sessionRootEntryId(input.session.id);
  const entryId =
    input.entryId ?? sessionTurnEntryId(input.session.id, base.entries.filter((entry) => entry.kind === "turn-message").length + 1);
  const entry: SessionThreadEntry = {
    id: entryId,
    parentId: parentEntryId,
    kind: "turn-message",
    role: input.messageRole,
    order: base.entries.length,
    timestamp: input.timestamp,
  };
  return freezeDeep({
    ...base,
    entries: [...base.entries, entry],
    activeLeafId: entryId,
  });
}

export function createSessionBranch(input: {
  readonly snapshot: SessionThreadSnapshot;
  readonly sessionId: string;
  readonly parentEntryId: string;
  readonly leafEntryId: string;
  readonly createdAt: string;
  readonly branchId?: string;
  readonly switchReason?: string;
}): SessionThreadSnapshot {
  const branchId =
    input.branchId ?? `branch:${input.sessionId}:${input.leafEntryId}`;
  const branch: SessionBranchRecord = {
    branchId,
    parentEntryId: input.parentEntryId,
    leafEntryId: input.leafEntryId,
    createdAt: input.createdAt,
    ...(input.switchReason ? { switchReason: input.switchReason } : {}),
  };
  return freezeDeep({
    ...input.snapshot,
    branches: [...input.snapshot.branches, branch],
    activeBranchId: branchId,
    activeLeafId: input.leafEntryId,
  });
}

export function switchSessionActiveLeaf(input: {
  readonly snapshot: SessionThreadSnapshot;
  readonly leafEntryId: string;
  readonly branchId?: string;
}): SessionThreadSnapshot {
  return freezeDeep({
    ...input.snapshot,
    activeLeafId: input.leafEntryId,
    ...(input.branchId ? { activeBranchId: input.branchId } : {}),
  });
}

export function addSessionCompactionRecord(input: {
  readonly snapshot: SessionThreadSnapshot;
  readonly record: SessionCompactionRecord;
}): SessionThreadSnapshot {
  return freezeDeep({
    ...input.snapshot,
    compactions: [...input.snapshot.compactions, input.record],
  });
}

export function sessionRootEntryId(sessionId: string): string {
  return `${sessionId}:root`;
}

export function sessionTurnEntryId(sessionId: string, order: number): string {
  return `${sessionId}:turn-${order}`;
}

/**
 * The entries from the root down to the active leaf — the branch in view.
 *
 * This is what makes a branch mean something. The entries are a tree, and the
 * conversation the model sees is one path through it, chosen by `activeLeafId`.
 * Everything else in the tree is what the user stepped away from, kept so they
 * can come back to it.
 *
 * Returns an empty path when the leaf is not in the thread, which the caller can
 * tell apart from a root-only path: a leaf that cannot be resolved is a damaged
 * thread, not an empty conversation.
 */
export function sessionThreadPath(
  thread: SessionThreadSnapshot,
  leafId?: string,
): { readonly path: readonly SessionThreadEntry[]; readonly resolved: boolean } {
  const byId = new Map(thread.entries.map((entry) => [entry.id, entry]));
  const target = leafId ?? thread.activeLeafId;
  const leaf = target === undefined ? thread.entries.at(-1) : byId.get(target);
  if (leaf === undefined) return { path: [], resolved: target === undefined };

  const path: SessionThreadEntry[] = [];
  const seen = new Set<string>();
  let cursor: SessionThreadEntry | undefined = leaf;
  while (cursor) {
    // A cycle would otherwise hang the caller in a walk it cannot finish.
    if (seen.has(cursor.id)) return { path: [], resolved: false };
    seen.add(cursor.id);
    path.unshift(cursor);
    cursor = cursor.parentId === undefined ? undefined : byId.get(cursor.parentId);
  }
  return { path, resolved: true };
}

/**
 * Extend a thread so it accounts for every turn the session has recorded.
 *
 * A thread is built once and then kept, so it does not follow the session on its
 * own: turns recorded after it was written have no entry until something extends
 * it. Calling this more than once changes nothing after the first time.
 *
 * Counting is done along the branch in view, not across the whole tree. A thread
 * that has been branched holds every branch's turns, so counting all of them
 * would compare a number that includes abandoned work against the session's
 * current turns and either skip turns that need entries or invent ones that do
 * not exist.
 */
export function catchUpSessionThread(
  thread: SessionThreadSnapshot,
  session: Session,
): SessionThreadSnapshot {
  // A turn the tree already represents is not missing, whichever branch it is
  // on. Selecting by name rather than by counting from the end is what keeps a
  // turn that was stepped away from — and then returned to — from being added a
  // second time under a new parent.
  const known = new Set(thread.entries.map((entry) => entry.id));
  const branch = sessionThreadPath(thread);
  const missing = session.turns.filter((turn, index) => {
    const id = turn.id ?? sessionTurnEntryId(session.id, index + 1);
    return !known.has(id);
  });
  if (missing.length === 0) return thread;

  const entries = [...thread.entries];
  // New turns continue the active leaf, which is where the conversation is. The
  // fallback covers a thread that records no active leaf at all.
  let leafId = branch.resolved && thread.activeLeafId !== undefined
    ? thread.activeLeafId
    : sessionRootEntryId(session.id);
  missing.forEach((turn) => {
    // Named after the turn it records, so the thread entry and the transcript
    // line agree. A turn with no id of its own — recorded before ids existed —
    // takes its position, which is the name the linear builder gives it too.
    const id = turn.id ?? sessionTurnEntryId(session.id, entries.length);
    entries.push({
      id,
      parentId: leafId,
      kind: "turn-message",
      role: turn.role,
      order: entries.length,
      ...(turn.timestamp ? { timestamp: turn.timestamp } : {}),
    });
    leafId = id;
  });

  return freezeDeep({
    ...thread,
    entries,
    activeLeafId: leafId,
  });
}
