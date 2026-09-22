import { freezeDeep } from "../../../core/values/freeze.js";
import type { Session } from "../../schema/sessionRecord.js";
import {
  appendSessionThreadChild,
  buildLinearSessionThreadSnapshot,
  type SessionThreadSnapshot,
} from "../../schema/sessionThread.js";
import { projectSessionTree, type SessionTreeProjection } from "../../sessionTreeProjection.js";

export interface HostSessionRecord {
  readonly session: Session;
  readonly thread: SessionThreadSnapshot;
  readonly lifecycle: "running" | "blocked" | "stopped" | "cancelled" | "completed";
  readonly eventCount: number;
  readonly lastTurnId?: string;
}

export interface HostSessionState {
  readonly sessions: readonly HostSessionRecord[];
  readonly currentSessionId?: string;
  readonly terminalSuccessClaim: false;
}

export interface HostSessionMutationResult {
  readonly state: HostSessionState;
  readonly record: HostSessionRecord;
  readonly created: boolean;
  readonly terminalSuccessClaim: false;
}

export function createHostSessionState(): HostSessionState {
  return freezeDeep({
    sessions: [],
    terminalSuccessClaim: false,
  });
}

export function selectOrCreateHostSession(input: {
  readonly state: HostSessionState;
  readonly sessionId?: string;
  readonly projectRoot: string;
  readonly now: string;
}): HostSessionMutationResult {
  const found = input.sessionId
    ? input.state.sessions.find((record) => record.session.id === input.sessionId)
    : undefined;
  if (found) {
    return freezeDeep({
      state: {
        ...input.state,
        currentSessionId: found.session.id,
        terminalSuccessClaim: false,
      },
      record: found,
      created: false,
      terminalSuccessClaim: false,
    });
  }

  const sessionId = input.sessionId ?? `host-session-${input.state.sessions.length + 1}`;
  const session: Session = {
    id: sanitizeId(sessionId),
    projectRoot: input.projectRoot,
    createdAt: input.now,
    updatedAt: input.now,
    status: "active",
    turns: [],
  };
  const record: HostSessionRecord = {
    session,
    thread: buildLinearSessionThreadSnapshot(session),
    lifecycle: "running",
    eventCount: 0,
  };
  return freezeDeep({
    state: {
      sessions: [...input.state.sessions, record],
      currentSessionId: session.id,
      terminalSuccessClaim: false,
    },
    record,
    created: true,
    terminalSuccessClaim: false,
  });
}

export function findHostSession(input: {
  readonly state: HostSessionState;
  readonly sessionId: string;
}): HostSessionRecord | undefined {
  return input.state.sessions.find((record) => record.session.id === input.sessionId);
}

export function appendHostSessionTurn(input: {
  readonly state: HostSessionState;
  readonly sessionId: string;
  readonly role: "user" | "assistant";
  readonly content: string;
  readonly timestamp: string;
  readonly eventCount: number;
  readonly lifecycle?: HostSessionRecord["lifecycle"];
}): HostSessionMutationResult | undefined {
  const record = findHostSession(input);
  if (!record) {
    return undefined;
  }
  const entryId = `${record.session.id}:turn:${record.session.turns.length + 1}:${input.role}`;
  const thread = appendSessionThreadChild({
    snapshot: record.thread,
    session: record.session,
    messageRole: input.role,
    timestamp: input.timestamp,
    entryId,
    parentEntryId: record.thread.activeLeafId,
  });
  const nextRecord: HostSessionRecord = {
    session: {
      ...record.session,
      updatedAt: input.timestamp,
      turns: [
        ...record.session.turns,
        {
          role: input.role,
          content: sanitizeSummary(input.content),
          timestamp: input.timestamp,
        },
      ],
    },
    thread,
    lifecycle: input.lifecycle ?? record.lifecycle,
    eventCount: input.eventCount,
    lastTurnId: entryId,
  };
  return replaceRecord(input.state, nextRecord);
}

export function updateHostSessionLifecycle(input: {
  readonly state: HostSessionState;
  readonly sessionId: string;
  readonly lifecycle: HostSessionRecord["lifecycle"];
  readonly now: string;
  readonly eventCount?: number;
}): HostSessionMutationResult | undefined {
  const record = findHostSession(input);
  if (!record) {
    return undefined;
  }
  const nextRecord: HostSessionRecord = {
    ...record,
    session: {
      ...record.session,
      updatedAt: input.now,
      status: input.lifecycle === "cancelled" || input.lifecycle === "stopped"
        ? "terminated"
        : input.lifecycle === "completed"
          ? "completed"
          : record.session.status,
    },
    lifecycle: input.lifecycle,
    eventCount: input.eventCount ?? record.eventCount,
  };
  return replaceRecord(input.state, nextRecord);
}

export function listHostSessionHeads(
  state: HostSessionState,
): readonly {
  readonly sessionId: string;
  readonly activeLeafId: string;
  readonly activeBranchId?: string;
  readonly lifecycle: HostSessionRecord["lifecycle"];
  readonly updatedAt: string;
  readonly terminalSuccessClaim: false;
}[] {
  return freezeDeep(state.sessions.map((record) => {
    const projection = projectHostSessionProjection(record);
    return {
      sessionId: record.session.id,
      activeLeafId: projection.activeLeafId,
      ...(projection.branchFacts.activeBranchId
        ? { activeBranchId: projection.branchFacts.activeBranchId }
        : {}),
      lifecycle: record.lifecycle,
      updatedAt: record.session.updatedAt,
      terminalSuccessClaim: false,
    };
  }));
}

export function projectHostSessionProjection(
  record: HostSessionRecord,
): SessionTreeProjection {
  return projectSessionTree({
    session: record.session,
    stateSnapshot: {
      status: record.session.status,
      runPhase: record.lifecycle === "running" ? "turn-active" : "idle",
      thread: record.thread,
    },
  });
}

function replaceRecord(
  state: HostSessionState,
  record: HostSessionRecord,
): HostSessionMutationResult {
  const sessions = state.sessions.map((candidate) =>
    candidate.session.id === record.session.id ? record : candidate
  );
  return freezeDeep({
    state: {
      sessions,
      currentSessionId: record.session.id,
      terminalSuccessClaim: false,
    },
    record,
    created: false,
    terminalSuccessClaim: false,
  });
}

function sanitizeId(input: string): string {
  return input.replace(/[^A-Za-z0-9_.:-]/g, "-").slice(0, 120);
}

function sanitizeSummary(input: string): string {
  return input
    .replace(/\/home\/wang\/\.private-agents-real[^\s"']*/g, "[redacted-real-provider-home]")
    .replace(/\boldText[:=][\s\S]*?(?=\snewText[:=]|$)/gi, "oldText=[raw-content-excluded]")
    .replace(/\bnewText[:=][^\n\r]*/gi, "newText=[raw-content-excluded]")
    .slice(0, 240);
}
