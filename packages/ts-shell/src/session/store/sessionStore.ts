import * as fs from "node:fs";
import { decodeWorkspaceRoots } from '../../core/workspace/model.js';
import { selectSessionReports } from '../reports/projection.js';
import { decodeUsageSnapshot } from "../../observability/usage/snapshot.js";
import type { SessionMetadata } from "../schema/sessionMetadataCodec.js";
import { projectSessionMetadata } from "../schema/sessionMetadataCodec.js";
import type { Session } from "../schema/sessionRecord.js";
import type { SessionMessage } from "../schema/sessionMessage.js";
import { isSessionContextMessage } from '../schema/sessionMessage.js';
import type { SessionStateSnapshot } from "../schema/sessionStateSnapshot.js";
import { buildSessionStateSnapshot } from "../schema/sessionStateSnapshot.js";
import { projectBranchMessages, readTranscriptSnapshot, readTranscriptSnapshotAsync } from "../transcript/sessionTranscript.js";
import { createTranscriptHeader, type TranscriptEvent } from "../sessionEventCodec.js";
import { sessionThreadPath } from "../schema/sessionThread.js";
import { readJsonFileWithRetry, readJsonFileWithRetryAsync, writeJsonFileAtomic } from "./sessionFileStore.js";
import type { SessionFileLayout } from "./sessionFileLayout.js";
import {
  readStateSnapshotRequired,
  readStateSnapshotRequiredAsync,
  writeSessionState,
  withSessionMetadataLock,
} from "./sessionStateStore.js";
import { decodeContextEntries } from '../../context/attachment/entry.js';

export function sessionExistsAtLayout(layout: Pick<SessionFileLayout, "sessionDir">): boolean {
  return fs.existsSync(layout.sessionDir);
}

export function writeSessionRecord(input: {
  readonly session: Session;
  readonly layout: SessionFileLayout;
}): void {
  if (!fs.existsSync(input.layout.sessionDir)) {
    fs.mkdirSync(input.layout.sessionDir, { recursive: true });
  }

  if (!fs.existsSync(input.layout.transcriptPath)) {
    // The header goes in at the moment the file comes into being, while it is
    // still empty. That is what keeps it compatible with append-only: a header
    // has to be the first line, and writing it to a file with nothing in it is
    // not a rewrite of anything. Appending never touches it afterwards.
    fs.writeFileSync(
      input.layout.transcriptPath,
      `${JSON.stringify(
        createTranscriptHeader({
          sessionId: input.session.id,
          timestamp: input.session.createdAt,
          cwd: input.session.projectRoot,
        }),
      )}\n`,
      "utf8",
    );
  }

  writeSessionMetadataRecord(input);
  writeSessionState({
    session: input.session,
    layout: input.layout,
  });
}

export function writeSessionMetadataRecord(input: {
  readonly session: Session;
  readonly layout: Pick<SessionFileLayout, "metadataPath" | "stateLockPath">;
}): void {
  withSessionMetadataLock(input.layout, () => {
  const metadata = projectSessionMetadata(input.session);
  // Pinning is owned by session management, independent of an older live view.
  // Creation and a concurrent catalog read can observe the metadata path
  // between directory setup and its atomic publication. An optional read keeps
  // that window equivalent to "no older pin"; a required read turns it into a
  // false creation failure.
  const current = readJsonFileWithRetry<SessionMetadata>(input.layout.metadataPath, {
    required: false,
    parseErrorDetail: "Failed to load session metadata",
  });
  if (current?.id === metadata.id && current.createdAt === metadata.createdAt) {
    if (current.pinned === true) metadata.pinned = true;
    else delete metadata.pinned;
  }
  writeJsonFileAtomic(input.layout.metadataPath, metadata);
  });
}

export function readSessionMetadataRecord(metadataPath: string, maxBytes?: number, signal?: AbortSignal): SessionMetadata | undefined {
  return readJsonFileWithRetry<SessionMetadata>(metadataPath, {
    required: true,
    parseErrorDetail: "Failed to load session metadata",
    maxBytes,
    signal,
  });
}

export function readSessionMetadataRecordAsync(
  metadataPath: string,
  maxBytes?: number,
  signal?: AbortSignal,
): Promise<SessionMetadata | undefined> {
  return readJsonFileWithRetryAsync<SessionMetadata>(metadataPath, {
    required: true,
    parseErrorDetail: "Failed to load session metadata",
    maxBytes,
    signal,
  });
}

export function deleteSessionRecord(input: {
  readonly sessionId: string;
  readonly layout: Pick<SessionFileLayout, "sessionDir">;
}): void {
  if (!fs.existsSync(input.layout.sessionDir)) {
    throw new Error(`Session ${input.sessionId} not found`);
  }
  fs.rmSync(input.layout.sessionDir, { recursive: true, force: true });
}

interface SessionReadInput {
  readonly sessionId: string;
  readonly layout: SessionFileLayout;
  readonly cwd: string;
  readonly limits?: SessionReadLimits;
  readonly salvageTranscript?: boolean;
  readonly signal?: AbortSignal;
}

export interface SessionReadLimits {
  readonly metadataBytes: number;
  readonly stateBytes: number;
  readonly transcriptBytes: number;
  readonly transcriptLines: number;
  readonly entries: number;
}

export interface SessionRecordSnapshot {
  readonly session: Session;
  readonly state: SessionStateSnapshot;
  readonly events: readonly TranscriptEvent[];
  readonly warnings: readonly string[];
  readonly transcriptTruncated: boolean;
}

export function loadSessionRecord(input: SessionReadInput): Session {
  return readSessionRecordSnapshot(input).session;
}

/** All projections share these acquired values; no second transcript or state read. */
export function readSessionRecordSnapshot(input: SessionReadInput): SessionRecordSnapshot {
  assertSessionSources(input);
  try {
    input.signal?.throwIfAborted();
    const metadata = readSessionMetadataRecord(input.layout.metadataPath, input.limits?.metadataBytes, input.signal);
    const state = readStateSnapshotRequired(input.layout.statePath, input.limits?.stateBytes, input.signal);
    assertSessionEntryLimit(state, input.limits);
    input.signal?.throwIfAborted();
    const transcript = readTranscriptSnapshot(input.layout.transcriptPath, input.limits ? {
      maxBytes: input.limits.transcriptBytes, maxLines: input.limits.transcriptLines,
    } : undefined, input.salvageTranscript === true, input.signal);
    return projectSessionRecordSnapshot(input, metadata, state, transcript);
  } catch (error) {
    if (input.signal?.aborted) throw error;
    throw sessionReadError(input.sessionId, error);
  }
}

/** Cancellable counterpart for picker acquisition; transcript reads yield between chunks. */
export async function readSessionRecordSnapshotAsync(input: SessionReadInput): Promise<SessionRecordSnapshot> {
  input.signal?.throwIfAborted();
  assertSessionSources(input);
  try {
    await yieldForAbort(input.signal);
    const metadata = await readSessionMetadataRecordAsync(input.layout.metadataPath, input.limits?.metadataBytes, input.signal);
    const state = await readStateSnapshotRequiredAsync(input.layout.statePath, input.limits?.stateBytes, input.signal);
    assertSessionEntryLimit(state, input.limits);
    await yieldForAbort(input.signal);
    const transcript = await readTranscriptSnapshotAsync(input.layout.transcriptPath, input.limits ? {
      maxBytes: input.limits.transcriptBytes, maxLines: input.limits.transcriptLines,
    } : undefined, input.salvageTranscript === true, input.signal);
    return await projectSessionRecordSnapshotAsync(input, metadata, state, transcript);
  } catch (error) {
    if (input.signal?.aborted) throw error;
    throw sessionReadError(input.sessionId, error);
  }
}

function assertSessionSources(input: SessionReadInput): void {
  if (
    !fs.existsSync(input.layout.sessionDir) ||
    !fs.existsSync(input.layout.metadataPath) ||
    !fs.existsSync(input.layout.transcriptPath)
  ) {
    throw new Error(`Session ${input.sessionId} not found`);
  }
}

function assertSessionEntryLimit(state: SessionStateSnapshot, limits?: SessionReadLimits): void {
  if (limits && state.thread !== undefined &&
    (!Array.isArray(state.thread.entries) || state.thread.entries.length > limits.entries)) {
    throw new Error('The saved tree exceeds the navigation entry limit or is damaged.');
  }
}

function projectSessionRecordSnapshot(
  input: SessionReadInput,
  metadata: SessionMetadata | undefined,
  state: SessionStateSnapshot,
  transcript: ReturnType<typeof readTranscriptSnapshot>,
): SessionRecordSnapshot {
  input.signal?.throwIfAborted();
  // Which branch is in view is a question about the thread, so the thread
  // answers it. Without a thread, every message is the conversation.
  const threadPath = state.thread === undefined ? undefined : sessionThreadPath(state.thread, undefined, input.signal);
  const branchPath = threadPath?.resolved === true
    ? threadPath.path.map((entry) => entry.id)
    : undefined;
  const events = transcript.events;
  const turns = projectBranchMessages(
    events,
    branchPath,
    state.thread?.entries.map((entry) => entry.id),
    input.signal,
  );
  if (input.limits && state.thread === undefined &&
    turns.reduce((count, turn) => count + (isSessionContextMessage(turn) ? 0 : 1), 1) > input.limits.entries) {
    throw new Error('The saved conversation exceeds the navigation entry limit.');
  }

  const session = projectLoadedSession({ metadata, state, turns, cwd: input.cwd });
  input.signal?.throwIfAborted();
  const reports = selectSessionReports(events, session.id, state.thread, input.signal);
  if (events.some((event, index) => {
    if ((index & 255) === 0) input.signal?.throwIfAborted();
    return event.type === 'command-output';
  })) session.hasReportHistory = true;
  if (reports.length) {
    session.reports = reports;
    const timestamp = reports.at(-1)!.timestamp;
    if (Date.parse(timestamp) > Date.parse(session.updatedAt)) session.updatedAt = timestamp;
  }
  input.signal?.throwIfAborted();
  return { session, state, events, warnings: transcript.warnings, transcriptTruncated: transcript.truncated };
}

async function projectSessionRecordSnapshotAsync(
  input: SessionReadInput,
  metadata: SessionMetadata | undefined,
  state: SessionStateSnapshot,
  transcript: ReturnType<typeof readTranscriptSnapshot>,
): Promise<SessionRecordSnapshot> {
  input.signal?.throwIfAborted();
  await yieldForAbort(input.signal);
  const threadPath = state.thread === undefined ? undefined : sessionThreadPath(state.thread, undefined, input.signal);
  await yieldForAbort(input.signal);
  let branchPath: string[] | undefined;
  if (threadPath?.resolved === true) {
    branchPath = [];
    for (let index = 0; index < threadPath.path.length; index++) {
      if ((index & 255) === 0) input.signal?.throwIfAborted();
      branchPath.push(threadPath.path[index]!.id);
    }
  }
  const knownEntryIds: string[] = [];
  for (let index = 0; index < (state.thread?.entries.length ?? 0); index++) {
    if ((index & 255) === 0) input.signal?.throwIfAborted();
    knownEntryIds.push(state.thread!.entries[index]!.id);
  }
  const events = transcript.events;
  const turns = projectBranchMessages(
    events,
    branchPath,
    state.thread === undefined ? undefined : knownEntryIds,
    input.signal,
  );
  await yieldForAbort(input.signal);
  if (input.limits && state.thread === undefined) {
    let count = 1;
    for (let index = 0; index < turns.length; index++) {
      if ((index & 255) === 0) input.signal?.throwIfAborted();
      if (!isSessionContextMessage(turns[index]!)) count++;
      if (count > input.limits.entries) throw new Error('The saved conversation exceeds the navigation entry limit.');
    }
  }

  input.signal?.throwIfAborted();
  const session = projectLoadedSession({ metadata, state, turns, cwd: input.cwd });
  const reports = selectSessionReports(events, session.id, state.thread, input.signal);
  if (events.some((event, index) => {
    if ((index & 255) === 0) input.signal?.throwIfAborted();
    return event.type === 'command-output';
  })) session.hasReportHistory = true;
  if (reports.length) {
    session.reports = reports;
    const timestamp = reports.at(-1)!.timestamp;
    if (Date.parse(timestamp) > Date.parse(session.updatedAt)) session.updatedAt = timestamp;
  }
  input.signal?.throwIfAborted();
  return { session, state, events, warnings: transcript.warnings, transcriptTruncated: transcript.truncated };
}

function sessionReadError(sessionId: string, error: unknown): Error {
  return new Error(`Failed to load session ${sessionId}: ${error instanceof Error ? error.message : String(error)}`);
}

async function yieldForAbort(signal?: AbortSignal): Promise<void> {
  await new Promise<void>(resolve => setImmediate(resolve));
  signal?.throwIfAborted();
}

export function projectLoadedSession(input: {
  readonly metadata: SessionMetadata | undefined;
  readonly state: SessionStateSnapshot;
  readonly turns: SessionMessage[];
  readonly cwd: string;
}): Session {
  const metadata = input.metadata;
  if (!metadata) {
    throw new Error("Session metadata missing");
  }
  return {
    id: metadata.id,
    ...(input.state.contextSelection === undefined ? {} : { contextSelection: input.state.contextSelection }),
    ...(input.state.contextAttachments === undefined ? {} : { contextAttachments: decodeContextEntries(input.state.contextAttachments) }),
    ...([input.state.goal, input.state.plan, input.state.goalDraft, input.state.goalAcceptance, input.state.advisor, input.state.research, input.state.gitWorkflow, input.state.security, input.state.jobs].some(value => value !== undefined)
      ? { hasPlanningState: true } : {}),
    ...(input.state.workspaceRoots !== undefined ? { workspaceRoots: decodeWorkspaceRoots(input.state.workspaceRoots) } : {}),
    projectRoot:
      metadata.projectRoot?.trim() ||
      input.state.projectRoot?.trim() ||
      input.cwd,
    ...(metadata.rootMode ? { rootMode: metadata.rootMode } : {}),
    ...(metadata.requestedWorkspaceRoot?.trim()
      ? { requestedWorkspaceRoot: metadata.requestedWorkspaceRoot.trim() }
      : {}),
    ...(metadata.targetPathBase?.trim()
      ? { targetPathBase: metadata.targetPathBase.trim() }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(metadata, "gitRoot")
      ? { gitRoot: metadata.gitRoot?.trim() || null }
      : {}),
    title: metadata.title,
    ...(metadata.pinned === true ? { pinned: true } : {}),
    ...(metadata.parentSession ? { parentSession: metadata.parentSession } : {}),
    createdAt: metadata.createdAt,
    updatedAt: metadata.updatedAt,
    status: input.state.status,
    usage: decodeUsageSnapshot(input.state.usage),
    pendingPrompt: input.state.pendingPrompt,
    lastError: input.state.lastError,
    turns: input.turns,
  };
}

export function projectInitialStateSnapshot(session: Session): SessionStateSnapshot {
  return buildSessionStateSnapshot(session, undefined);
}
