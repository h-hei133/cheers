import { messageToText } from "../../model-adapters/multimodal.js";
import type { SessionMessage } from "../schema/sessionMessage.js";
import type { SessionThreadSnapshot } from "../schema/sessionThread.js";
import type { Session } from '../schema/sessionRecord.js';
import { buildLinearSessionThreadSnapshot, catchUpSessionThread } from '../schema/sessionThread.js';
import { createSessionStoreLayout, locateExistingSessionLayout, projectSessionFileLayout } from "../store/sessionFileLayout.js";
import { readSessionRecordSnapshot, readSessionRecordSnapshotAsync } from "../store/sessionStore.js";
import { readSessionFileVersion } from '../store/version.js';
import { transcriptEventToSessionMessage, type TranscriptEvent } from "../sessionEventCodec.js";
import { readTranscriptSnapshotAsync } from "../transcript/read.js";
import { readSessionTree, type SessionTreeNodeView } from "./sessionEntries.js";
import { admitNavigationSource, NAVIGATION_LIMITS } from './navigation/limits.js';

export interface SessionNavigationPoint {
  readonly entryId: string;
  readonly depth: number;
  readonly label: string;
  readonly current: boolean;
  readonly prompt?: string;
  readonly unavailable?: string;
  readonly parentId?: string;
  readonly timestamp?: string;
  /** Bounded excerpt for display; the original user prompt remains separate. */
  readonly excerpt?: string;
  readonly searchText?: string;
}

export interface SessionNavigationReadOptions {
  readonly signal?: AbortSignal;
  readonly onSource?: (target: string) => void;
}

const CONTROL_CHECK_INTERVAL = 256;
const YIELD_INTERVAL = 1024;

/** Read every branch, including messages outside the active conversation. */
export function readSessionNavigation(sessionId: string, cwd: string, onSource?: (target: string) => void): {
  readonly thread: SessionThreadSnapshot;
  readonly points: readonly SessionNavigationPoint[];
  readonly session: Session;
  readonly version: string;
  readonly quality: 'complete' | 'partial';
  readonly warnings: readonly string[];
  readonly actionSafe: boolean;
} {
  const store = createSessionStoreLayout();
  for (const sessionsDir of store.sessionsSearchDirs) onSource?.(projectSessionFileLayout({ sessionsDir, sessionId }).sessionDir);
  const layout = locateExistingSessionLayout(store, sessionId);
  const before = readSessionFileVersion(layout);
  admitNavigationSource(layout, { allowTranscriptOverflow: true });
  const { session, state, events, warnings, transcriptTruncated } = readSessionRecordSnapshot({
    sessionId, layout, cwd, limits: NAVIGATION_LIMITS, salvageTranscript: true,
  });
  if (session.id !== sessionId) throw new Error('The stored session identity does not match the requested session.');
  if (state.thread?.activeLeafId !== undefined &&
    !state.thread.entries.some(entry => entry.id === state.thread!.activeLeafId)) {
    throw new Error('The saved tree has a missing active entry.');
  }
  const messages = events.flatMap((event) => {
    const message = transcriptEventToSessionMessage(event);
    return message ? [message] : [];
  });
  if (before !== readSessionFileVersion(layout)
    || locateExistingSessionLayout(store, sessionId).sessionDir !== layout.sessionDir) {
    throw new Error('The session changed while its navigation state was being read.');
  }
  const thread = catchUpSessionThread(state.thread ?? buildLinearSessionThreadSnapshot(session), session, NAVIGATION_LIMITS.entries);
  const projected = projectSessionNavigation(thread, messages);
  return navigationResult(before, thread, projected, session, warnings, transcriptTruncated);
}

/** Cancellable navigation acquisition for picker loads; yields between source chunks and graph batches. */
export async function readSessionNavigationAsync(
  sessionId: string,
  cwd: string,
  options: SessionNavigationReadOptions = {},
): Promise<{
  readonly thread: SessionThreadSnapshot;
  readonly points: readonly SessionNavigationPoint[];
  readonly session: Session;
  readonly version: string;
  readonly quality: 'complete' | 'partial';
  readonly warnings: readonly string[];
  readonly actionSafe: boolean;
}> {
  const signal = options.signal;
  await yieldForAbort(signal);
  const store = createSessionStoreLayout();
  for (const sessionsDir of store.sessionsSearchDirs) {
    signal?.throwIfAborted();
    options.onSource?.(projectSessionFileLayout({ sessionsDir, sessionId }).sessionDir);
  }
  const layout = locateExistingSessionLayout(store, sessionId);
  const before = readSessionFileVersion(layout);
  admitNavigationSource(layout, { allowTranscriptOverflow: true });
  const { session, state, events, warnings, transcriptTruncated } = await readSessionRecordSnapshotAsync({
    sessionId, layout, cwd, limits: NAVIGATION_LIMITS, salvageTranscript: true, signal,
  });
  if (session.id !== sessionId) throw new Error('The stored session identity does not match the requested session.');
  if (state.thread?.activeLeafId !== undefined &&
    !state.thread.entries.some(entry => entry.id === state.thread!.activeLeafId)) {
    throw new Error('The saved tree has a missing active entry.');
  }
  const messages: SessionMessage[] = [];
  for (let index = 0; index < events.length; index++) {
    if ((index & (CONTROL_CHECK_INTERVAL - 1)) === 0) signal?.throwIfAborted();
    if ((index & (YIELD_INTERVAL - 1)) === 0) await yieldForAbort(signal);
    const message = transcriptEventToSessionMessage(events[index]!);
    if (message) messages.push(message);
  }
  signal?.throwIfAborted();
  if (before !== readSessionFileVersion(layout)
    || locateExistingSessionLayout(store, sessionId).sessionDir !== layout.sessionDir) {
    throw new Error('The session changed while its navigation state was being read.');
  }
  const thread = catchUpSessionThread(
    state.thread ?? buildLinearSessionThreadSnapshot(session),
    session,
    NAVIGATION_LIMITS.entries,
    signal,
  );
  await yieldForAbort(signal);
  const projected = await projectSessionNavigationAsync(thread, messages, signal);
  await yieldForAbort(signal);
  if (before !== readSessionFileVersion(layout)
    || locateExistingSessionLayout(store, sessionId).sessionDir !== layout.sessionDir) {
    throw new Error('The session changed while its navigation state was being projected.');
  }
  return navigationResult(before, thread, projected, session, warnings, transcriptTruncated, signal);
}

/** Cancellable transcript-only acquisition for completion callers that do not need a tree. */
export async function readSessionTranscriptEventsAsync(
  sessionId: string,
  options: SessionNavigationReadOptions = {},
): Promise<readonly TranscriptEvent[]> {
  const signal = options.signal;
  await yieldForAbort(signal);
  const store = createSessionStoreLayout();
  for (const sessionsDir of store.sessionsSearchDirs) {
    signal?.throwIfAborted();
    options.onSource?.(projectSessionFileLayout({ sessionsDir, sessionId }).transcriptPath);
  }
  const layout = locateExistingSessionLayout(store, sessionId);
  const before = readSessionFileVersion(layout);
  admitNavigationSource(layout, { allowTranscriptOverflow: true });
  const transcript = await readTranscriptSnapshotAsync(layout.transcriptPath, {
    maxBytes: NAVIGATION_LIMITS.transcriptBytes,
    maxLines: NAVIGATION_LIMITS.transcriptLines,
  }, false, signal);
  signal?.throwIfAborted();
  if (before !== readSessionFileVersion(layout)
    || locateExistingSessionLayout(store, sessionId).sessionDir !== layout.sessionDir) {
    throw new Error('The session changed while its transcript was being read.');
  }
  return transcript.events;
}

function navigationResult(
  version: string,
  thread: SessionThreadSnapshot,
  projected: readonly SessionNavigationPoint[],
  session: Session,
  warnings: readonly string[],
  transcriptTruncated: boolean,
  signal?: AbortSignal,
) {
  const partial = warnings.length > 0 || transcriptTruncated;
  let points = projected;
  if (partial) {
    const unavailable = projected.slice();
    for (let index = 0; index < unavailable.length; index++) {
      if ((index & 255) === 0) signal?.throwIfAborted();
      unavailable[index] = {
        ...unavailable[index]!,
        unavailable: unavailable[index]!.unavailable ?? 'partial transcript; reopen after repair',
      };
    }
    points = unavailable;
  }
  signal?.throwIfAborted();
  return {
    thread, points, session, version,
    quality: partial ? 'partial' as const : 'complete' as const,
    warnings,
    actionSafe: !partial,
  };
}

async function yieldForAbort(signal?: AbortSignal): Promise<void> {
  await new Promise<void>(resolve => setImmediate(resolve));
  signal?.throwIfAborted();
}

/** A repaired display edge never grants permission to navigate a broken path. */
export function projectSessionNavigation(
  thread: SessionThreadSnapshot,
  messages: readonly SessionMessage[],
  signal?: AbortSignal,
): SessionNavigationPoint[] {
  const { byId, nodes } = prepareNavigationProjection(thread, messages, signal);
  const points: SessionNavigationPoint[] = [];
  for (const candidate of nodes) {
    signal?.throwIfAborted();
    points.push(navigationPoint(candidate, byId, thread.activeLeafId));
  }
  return points;
}

export async function projectSessionNavigationAsync(
  thread: SessionThreadSnapshot,
  messages: readonly SessionMessage[],
  signal?: AbortSignal,
): Promise<SessionNavigationPoint[]> {
  const { byId, nodes } = prepareNavigationProjection(thread, messages, signal);
  const points: SessionNavigationPoint[] = [];
  let index = 0;
  for (const candidate of nodes) {
    if ((index & (CONTROL_CHECK_INTERVAL - 1)) === 0) signal?.throwIfAborted();
    if ((index & (YIELD_INTERVAL - 1)) === 0) await yieldForAbort(signal);
    index += 1;
    points.push(navigationPoint(candidate, byId, thread.activeLeafId));
  }
  await yieldForAbort(signal);
  return points;
}

interface NavigationCandidate {
  readonly node: SessionTreeNodeView;
  readonly depth: number;
  readonly parentId?: string;
  readonly valid: boolean;
}

function prepareNavigationProjection(
  thread: SessionThreadSnapshot,
  messages: readonly SessionMessage[],
  signal?: AbortSignal,
): { readonly byId: ReadonlyMap<string, SessionMessage>; readonly nodes: Iterable<NavigationCandidate> } {
  signal?.throwIfAborted();
  if (thread.entries.length > NAVIGATION_LIMITS.entries) throw new Error('The saved tree exceeds the navigation entry limit.');
  const identities = new Set<string>();
  for (let index = 0; index < thread.entries.length; index++) {
    if ((index & 255) === 0) signal?.throwIfAborted();
    const entry = thread.entries[index]!;
    if (typeof entry.id !== 'string' || identities.has(entry.id)) throw new Error('The saved tree has invalid or duplicate identities.');
    identities.add(entry.id);
  }
  if (thread.activeLeafId !== undefined && !identities.has(thread.activeLeafId)) {
    throw new Error('The saved tree has a missing active entry.');
  }
  const tree = readSessionTree(thread.entries, undefined, signal);
  const byId = new Map<string, SessionMessage>();
  for (let index = 0; index < messages.length; index++) {
    if ((index & 255) === 0) signal?.throwIfAborted();
    const message = messages[index]!;
    if (message.id !== undefined) byId.set(message.id, message);
  }
  return { byId, nodes: navigationCandidates(tree, byId, signal) };
}

function* navigationCandidates(
  tree: ReturnType<typeof readSessionTree>,
  byId: ReadonlyMap<string, SessionMessage>,
  signal?: AbortSignal,
): Iterable<NavigationCandidate> {
  if (tree === "unknown-cursor") return;
  const pending = tree.map((node) => ({ node, depth: 0, parentId: undefined as string | undefined, valid: true })).reverse();
  let index = 0;
  while (pending.length > 0) {
    if ((index++ & 255) === 0) signal?.throwIfAborted();
    const { node, depth, parentId, valid: parentValid } = pending.pop()!;
    const valid = parentValid && node.entry.parentId === parentId;
    yield { node, depth, parentId, valid };
    const available = valid && (node.entry.kind !== "turn-message" || byId.has(node.entry.id));
    for (const child of [...node.children].reverse()) {
      pending.push({ node: child, depth: depth + 1, parentId: node.entry.id, valid: available });
    }
  }
}

function navigationPoint(
  candidate: NavigationCandidate,
  byId: ReadonlyMap<string, SessionMessage>,
  activeLeafId: string | undefined,
): SessionNavigationPoint {
  const { node, depth, parentId, valid } = candidate;
  const message = byId.get(node.entry.id);
  const text = message ? messageToText(message.content) : "";
  const unavailable = !valid ? "broken ancestry"
    : node.entry.kind === "turn-message" && !message ? "message unavailable" : undefined;
  return {
    entryId: node.entry.id,
    depth,
    label: node.entry.kind === "session-root" ? "Session start"
      : `${node.entry.role ?? node.entry.kind}: ${text.replace(/\s+/g, " ").trim().slice(0, 96)}`,
    current: activeLeafId === node.entry.id,
    ...(node.entry.parentId !== undefined ? { parentId: node.entry.parentId } : {}),
    ...(node.entry.timestamp ? { timestamp: node.entry.timestamp } : {}),
    ...(text ? { excerpt: text.slice(0, 1200) + (text.length > 1200 ? '…' : '') } : {}),
    ...(text ? { searchText: text } : {}),
    ...(message?.role === "user" ? { prompt: text } : {}),
    ...(unavailable ? { unavailable } : {}),
  };
}
