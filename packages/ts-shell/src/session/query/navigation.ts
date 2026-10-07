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

export interface SessionNavigationPoint {
  readonly entryId: string;
  readonly depth: number;
  readonly label: string;
  readonly current: boolean;
  readonly prompt?: string;
  readonly unavailable?: string;
}

/** Read every branch, including messages outside the active conversation. */
export function readSessionNavigation(sessionId: string, cwd: string, onSource?: (target: string) => void): {
  readonly thread: SessionThreadSnapshot;
  readonly points: readonly SessionNavigationPoint[];
  readonly session: Session;
} {
  const store = createSessionStoreLayout();
  for (const sessionsDir of store.sessionsSearchDirs) onSource?.(projectSessionFileLayout({ sessionsDir, sessionId }).sessionDir);
  const layout = locateExistingSessionLayout(store, sessionId);
  const before = readSessionFileVersion(layout);
  const { session, state, events } = readSessionRecordSnapshot({ sessionId, layout, cwd });
  if (session.id !== sessionId) throw new Error('The stored session identity does not match the requested session.');
  const messages = events.flatMap((event) => {
    const message = transcriptEventToSessionMessage(event);
    return message ? [message] : [];
  });
  if (before !== readSessionFileVersion(layout)
    || locateExistingSessionLayout(store, sessionId).sessionDir !== layout.sessionDir) {
    throw new Error('The session changed while its navigation state was being read.');
  }
  const thread = catchUpSessionThread(state.thread ?? buildLinearSessionThreadSnapshot(session), session);
  return { thread, points: projectSessionNavigation(thread, messages), session };
}

/** A repaired display edge never grants permission to navigate a broken path. */
export function projectSessionNavigation(
  thread: SessionThreadSnapshot,
  messages: readonly SessionMessage[],
): SessionNavigationPoint[] {
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
      ...(message?.role === "user" ? { prompt: text } : {}),
      ...(unavailable ? { unavailable } : {}),
    });
    for (const child of [...node.children].reverse()) {
      pending.push({ node: child, depth: depth + 1, parentId: node.entry.id, valid: unavailable === undefined });
    }
  }
  return points;
}
