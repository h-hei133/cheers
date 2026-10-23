import { messageToText } from "../../model-adapters/multimodal.js";
import type { SessionMessage } from "../schema/sessionMessage.js";
import type { SessionThreadSnapshot } from "../schema/sessionThread.js";
import type { Session } from '../schema/sessionRecord.js';
import { buildLinearSessionThreadSnapshot, catchUpSessionThread } from '../schema/sessionThread.js';
import { createSessionStoreLayout, locateExistingSessionLayout, projectSessionFileLayout } from "../store/sessionFileLayout.js";
import { readSessionRecordSnapshot } from "../store/sessionStore.js";
import { readSessionFileVersion } from '../store/version.js';
import { transcriptEventToSessionMessage } from "../sessionEventCodec.js";
import { readSessionTree } from "./sessionEntries.js";
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

/** Read every branch, including messages outside the active conversation. */
export function readSessionNavigation(sessionId: string, cwd: string, onSource?: (target: string) => void): {
  readonly thread: SessionThreadSnapshot;
  readonly points: readonly SessionNavigationPoint[];
  readonly session: Session;
  readonly version: string;
} {
  const store = createSessionStoreLayout();
  for (const sessionsDir of store.sessionsSearchDirs) onSource?.(projectSessionFileLayout({ sessionsDir, sessionId }).sessionDir);
  const layout = locateExistingSessionLayout(store, sessionId);
  const before = readSessionFileVersion(layout);
  admitNavigationSource(layout);
  const { session, state, events } = readSessionRecordSnapshot({ sessionId, layout, cwd, limits: NAVIGATION_LIMITS });
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
  return { thread, points: projectSessionNavigation(thread, messages), session, version: before };
}

/** A repaired display edge never grants permission to navigate a broken path. */
export function projectSessionNavigation(
  thread: SessionThreadSnapshot,
  messages: readonly SessionMessage[],
): SessionNavigationPoint[] {
  if (thread.entries.length > NAVIGATION_LIMITS.entries) throw new Error('The saved tree exceeds the navigation entry limit.');
  const identities = new Set<string>();
  for (const entry of thread.entries) {
    if (typeof entry.id !== 'string' || identities.has(entry.id)) throw new Error('The saved tree has invalid or duplicate identities.');
    identities.add(entry.id);
  }
  if (thread.activeLeafId !== undefined && !identities.has(thread.activeLeafId)) {
    throw new Error('The saved tree has a missing active entry.');
  }
  const tree = readSessionTree(thread.entries);
  if (tree === "unknown-cursor") return [];
  const byId = new Map(messages.map((message) => [message.id, message]));
  const points: SessionNavigationPoint[] = [];
  const pending = tree.map((node) => ({ node, depth: 0, parentId: undefined as string | undefined, valid: true })).reverse();
  while (pending.length > 0) {
    const { node, depth, parentId, valid: parentValid } = pending.pop()!;
    const valid = parentValid && node.entry.parentId === parentId;
    const message = byId.get(node.entry.id);
    const text = message ? messageToText(message.content) : "";
    const unavailable = !valid ? "broken ancestry"
      : node.entry.kind === "turn-message" && !message ? "message unavailable" : undefined;
    points.push({
      entryId: node.entry.id,
      depth,
      label: node.entry.kind === "session-root" ? "Session start"
        : `${node.entry.role ?? node.entry.kind}: ${text.replace(/\s+/g, " ").trim().slice(0, 96)}`,
      current: thread.activeLeafId === node.entry.id,
      ...(node.entry.parentId !== undefined ? { parentId: node.entry.parentId } : {}),
      ...(node.entry.timestamp ? { timestamp: node.entry.timestamp } : {}),
      ...(text ? { excerpt: text.slice(0, 1200) + (text.length > 1200 ? '…' : '') } : {}),
      ...(text ? { searchText: text } : {}),
      ...(message?.role === "user" ? { prompt: text } : {}),
      ...(unavailable ? { unavailable } : {}),
    });
    for (const child of [...node.children].reverse()) {
      pending.push({ node: child, depth: depth + 1, parentId: node.entry.id, valid: unavailable === undefined });
    }
  }
  return points;
}
