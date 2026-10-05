import type { SessionManager } from "../../../session/SessionManager.js";
import type { ShellRuntimeContext } from "../../../core/shell/runtimeContext.js";
import { readSessionNavigation } from "../../../session/query/navigation.js";
import type { Suggestion } from "../../../presentation/tui/chrome/suggestions.js";

export type SessionCatalog = Pick<SessionManager, "listRecentSessions" | "getTranscriptEvents">;

/** Use the command's read owner; completion never switches a leaf or restores a session. */
export function navigationCatalog(kind: "session" | "entry" | "tree" | "thread", context: ShellRuntimeContext, manager: SessionCatalog): readonly Suggestion[] {
  if (kind === "session") return manager.listRecentSessions(100).map(session => ({
    value: session.id, label: session.title?.trim() || session.id,
    detail: `${session.id} · ${session.status} · ${session.projectRoot}`,
  }));
  if (kind === "entry") return manager.getTranscriptEvents(context.session.id).flatMap(event =>
    event.id ? [{ value: event.id, label: event.id, detail: `${event.type} · ${event.timestamp}` }] : []);
  const { thread, points } = readSessionNavigation(context.session.id, context.cwd);
  if (kind === "thread") return thread.entries.map(entry => ({ value: entry.id, label: entry.id, detail: entry.role ?? entry.kind }));
  return points.filter(point => !point.unavailable).map(point => ({ value: point.entryId, label: point.entryId, detail: point.label }));
}
