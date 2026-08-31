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
    entries.push({
      id: sessionTurnEntryId(session.id, order),
      parentId: order === 1 ? rootId : sessionTurnEntryId(session.id, order - 1),
      kind: "turn-message",
      role: turn.role,
      order,
      ...(turn.timestamp ? { timestamp: turn.timestamp } : {}),
    });
  });

  return deepFreeze({
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
  return deepFreeze({
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
  return deepFreeze({
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
  return deepFreeze({
    ...input.snapshot,
    activeLeafId: input.leafEntryId,
    ...(input.branchId ? { activeBranchId: input.branchId } : {}),
  });
}

export function addSessionCompactionRecord(input: {
  readonly snapshot: SessionThreadSnapshot;
  readonly record: SessionCompactionRecord;
}): SessionThreadSnapshot {
  return deepFreeze({
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

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
}
