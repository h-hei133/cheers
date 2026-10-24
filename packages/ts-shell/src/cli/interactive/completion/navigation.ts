import type { SessionManager } from "../../../session/SessionManager.js";
import type { ShellRuntimeContext } from "../../../core/shell/runtimeContext.js";
import { readSessionNavigationAsync, readSessionTranscriptEventsAsync } from "../../../session/query/navigation.js";
import type { Suggestion } from "../../../presentation/tui/chrome/suggestions.js";
import type { SessionCatalogSnapshot } from '../../../session/store/catalog/model.js';
import type { CatalogProgressSink } from './result.js';

export type SessionCatalog = Pick<SessionManager, "catalog" | "getTranscriptEvents">;

/** Use the command's read owner; completion never switches a leaf or restores a session. */
export async function navigationCatalog(kind: "session" | "entry" | "tree" | "thread", context: ShellRuntimeContext,
  manager: SessionCatalog, onSource?: (target: string) => void, signal?: AbortSignal, progress?: CatalogProgressSink): Promise<readonly Suggestion[]> {
  signal?.throwIfAborted();
  if (kind === "session") {
    let snapshot: SessionCatalogSnapshot | undefined;
    let items: readonly Suggestion[] = [];
    for await (const page of manager.catalog.list({ sessionId: context.session.id, projectRoot: context.projectRoot, busy: false }, signal, 100, onSource)) {
      snapshot = page;
      items = page.sessions.map(session => ({ value: session.id, label: session.title?.trim() || session.id,
        detail: `${session.id} · ${session.status ?? 'status unknown'} · ${session.projectRoot}${session.quality === 'limited' ? ' · preview limited' : ''}` }));
      const status = page.status === 'scanning' ? `Loading sessions: ${page.scanned} checked; results are incomplete.`
        : page.status === 'partial' ? `Session entries are incomplete: ${page.unreadable} unreadable sources, ${page.limited} limited previews.` : undefined;
      progress?.({ items, status });
    }
    signal?.throwIfAborted();
    if (!snapshot) throw new Error('Session catalog unavailable');
    return items;
  }
  if (kind === "entry") return (await readSessionTranscriptEventsAsync(context.session.id, { onSource, signal })).flatMap(event =>
    event.id ? [{ value: event.id, label: event.id, detail: `${event.type} · ${event.timestamp}` }] : []);
  const { thread, points } = await readSessionNavigationAsync(context.session.id, context.cwd, { onSource, signal });
  if (kind === "thread") return thread.entries.map(entry => ({ value: entry.id, label: entry.id, detail: entry.role ?? entry.kind }));
  return points.filter(point => !point.unavailable).map(point => ({ value: point.entryId, label: point.entryId, detail: point.label }));
}
