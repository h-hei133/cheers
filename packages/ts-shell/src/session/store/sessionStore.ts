import * as fs from "node:fs";
import { selectSessionReports } from '../reports/projection.js';
import type { SessionMetadata } from "../schema/sessionMetadataCodec.js";
import type { Session } from "../schema/sessionRecord.js";
import { isSessionContextMessage } from '../schema/sessionMessage.js';
import type { SessionStateSnapshot } from "../schema/sessionStateSnapshot.js";
import { buildSessionStateSnapshot } from "../schema/sessionStateSnapshot.js";
import { projectBranchMessages, readTranscriptSnapshot, readTranscriptSnapshotAsync } from "../transcript/sessionTranscript.js";
import type { TranscriptEvent } from "../sessionEventCodec.js";
import { sessionThreadPath } from "../schema/sessionThread.js";
import type { SessionFileLayout } from "./sessionFileLayout.js";
import { readStateSnapshotRequired } from "./sessionStateStore.js";
import { projectSessionAnnotations } from '../context/projection.js';
import { identifyPromptFile, PromptPublicationError, promptIntentPath, readPromptIntent } from './prompt/intent.js';
import { pathIdentity } from '../../core/workspace/files.js';
import { previewTranscriptAppend } from '../transcript/append.js';
import { parseTranscript } from '../transcript/read.js';
import { fileVersion, readSessionFileVersion } from './version.js';
import { projectLoadedSession } from './projection.js';
import { readSessionSnapshot, readSessionSnapshotAsync, SessionSnapshotConflict, type SessionSnapshotLimits } from './snapshot.js';
import { activationRecordText } from './prompt/activation.js';
import { isResumeCommitted, readSessionRegistryStore } from './currentSessionRegistry.js';

export { readSessionMetadataRecord } from './snapshot.js';
export { writeSessionMetadataRecord } from './metadata.js';

export function sessionExistsAtLayout(layout: Pick<SessionFileLayout, "sessionDir">): boolean {
  return fs.existsSync(layout.sessionDir);
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
  readonly registryPath?: string;
}

export interface SessionReadLimits extends SessionSnapshotLimits {
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

export function previewPendingSessionRecord(input: SessionReadInput): { snapshot: SessionRecordSnapshot; assertCurrent: () => void } | undefined {
  const marker = promptIntentPath(input.layout);
  try {
    const version = fs.lstatSync(marker, { throwIfNoEntry: false });
    if (!version) return undefined;
    if (!version.isFile()) throw new PromptPublicationError('unknown');
    const identity = pathIdentity(marker);
    const markerVersion = fileVersion(version).join(':');
    const sourceVersion = readSessionFileVersion(input.layout);
    const assertCurrent = () => {
      if (pathIdentity(marker) !== identity || fileVersion(fs.lstatSync(marker)).join(':') !== markerVersion
        || readSessionFileVersion(input.layout) !== sourceVersion) throw new PromptPublicationError('unknown');
    };
    const intent = readPromptIntent(input.layout, input.sessionId);
    if (!intent || pathIdentity(input.layout.sessionDir) !== intent.directory) throw new PromptPublicationError('unknown');
    if (intent.version === 4 || intent.version === 5) {
      if (!input.registryPath) throw new PromptPublicationError('unknown', 'record');
      const registryPath = input.registryPath;
      const readDecision = () => {
        const registry = readSessionRegistryStore(registryPath);
        if (registry.readError) throw new PromptPublicationError('unknown', 'record');
        return isResumeCommitted(registry.store, intent);
      };
      const committed = readDecision();
      const record = activationRecordText(input.layout, intent, committed);
      const metadata = JSON.parse(record.metadata);
      const state = record.state === undefined ? readStateSnapshotRequired(input.layout.statePath) : JSON.parse(record.state);
      const transcript = readTranscriptSnapshot(input.layout.transcriptPath);
      const snapshot = projectSessionRecordSnapshot(input, metadata, state, transcript);
      const assertActivation = () => {
        if (readDecision() !== committed) throw new PromptPublicationError('unknown', 'record');
        assertCurrent();
      };
      assertActivation();
      return { snapshot, assertCurrent: assertActivation };
    }
    const metadata = identifyPromptFile(input.layout.metadataPath, 'metadata', intent.metadata);
    const state = identifyPromptFile(input.layout.statePath, 'state', intent.state);
    const transcript = previewTranscriptAppend(input.layout.transcriptPath, intent.transcript, intent.rows);
    if (!transcript.complete && (metadata === 'after' || state === 'after')) throw new PromptPublicationError('unknown');
    const parsed = parseTranscript(transcript.text);
    if (parsed.warnings.length) throw new PromptPublicationError('unknown');
    const snapshot = projectSessionRecordSnapshot(input, JSON.parse(intent.metadata.after), JSON.parse(intent.state.after), { ...parsed, truncated: false });
    assertCurrent();
    return { snapshot, assertCurrent };
  } catch { throw new PromptPublicationError('unknown'); }
}

/** All projections share these acquired values; no second transcript or state read. */
export function readSessionRecordSnapshot(input: SessionReadInput): SessionRecordSnapshot {
  assertSessionSources(input);
  try {
    input.signal?.throwIfAborted();
    const { metadata, state, assertCurrent } = readSessionSnapshot(input.layout, { ...input, includeTranscript: true });
    assertSessionEntryLimit(state, input.limits);
    input.signal?.throwIfAborted();
    const transcript = readTranscriptSnapshot(input.layout.transcriptPath, input.limits ? {
      maxBytes: input.limits.transcriptBytes, maxLines: input.limits.transcriptLines,
    } : undefined, input.salvageTranscript === true, input.signal);
    const snapshot = projectSessionRecordSnapshot(input, metadata, state, transcript);
    assertCurrent();
    return snapshot;
  } catch (error) {
    if (input.signal?.aborted || error instanceof PromptPublicationError || error instanceof SessionSnapshotConflict) throw error;
    throw sessionReadError(input.sessionId, error);
  }
}

/** Cancellable counterpart for picker acquisition; transcript reads yield between chunks. */
export async function readSessionRecordSnapshotAsync(input: SessionReadInput): Promise<SessionRecordSnapshot> {
  input.signal?.throwIfAborted();
  assertSessionSources(input);
  try {
    const { metadata, state, assertCurrent } = await readSessionSnapshotAsync(input.layout, { ...input, includeTranscript: true });
    assertSessionEntryLimit(state, input.limits);
    await yieldForAbort(input.signal);
    const transcript = await readTranscriptSnapshotAsync(input.layout.transcriptPath, input.limits ? {
      maxBytes: input.limits.transcriptBytes, maxLines: input.limits.transcriptLines,
    } : undefined, input.salvageTranscript === true, input.signal);
    const snapshot = await projectSessionRecordSnapshotAsync(input, metadata, state, transcript);
    assertCurrent();
    return snapshot;
  } catch (error) {
    if (input.signal?.aborted || error instanceof PromptPublicationError || error instanceof SessionSnapshotConflict) throw error;
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
  Object.assign(session, projectSessionAnnotations(events, state.thread, threadPath?.resolved ? threadPath.path : undefined, turns, input.signal));
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
  Object.assign(session, projectSessionAnnotations(events, state.thread, threadPath?.resolved ? threadPath.path : undefined, turns, input.signal));
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

export function projectInitialStateSnapshot(session: Session): SessionStateSnapshot {
  return buildSessionStateSnapshot(session, undefined);
}
