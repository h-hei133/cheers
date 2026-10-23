import { replayTodosFromMessages } from "../../core/commands/todoCommandRuntime.js";
import type { ShellRuntimeContext } from "../../core/shell/runtimeContext.js";
import type { ShellSessionRuntime } from "../../core/shell/sessionRuntime.js";
import { markContextUnknown } from "../../observability/usageTelemetry.js";
import type { SessionManager } from "../../session/SessionManager.js";
import { readSessionNavigation } from "../../session/query/navigation.js";
import { sessionThreadPath } from "../../session/schema/sessionThread.js";
import { SessionNavigationWarning } from '../../session/navigation/revert.js';
import { normalizePathIdentity } from '../../session/continuation/roots.js';
import type { Session } from '../../session/schema/sessionRecord.js';
import { navigationLines } from '../output/navigation.js';
import type { SessionMessage } from '../../session/schema/sessionMessage.js';

/** The back chooser shares the bounded saved branch and its navigation version. */
export function readBackSource(context: Pick<ShellRuntimeContext, 'session' | 'cwd' | 'projectRoot'>): {
  readonly turns: readonly SessionMessage[];
  readonly version: string;
} {
  const snapshot = readSessionNavigation(context.session.id, context.cwd);
  const root = normalizePathIdentity(context.projectRoot);
  if (!root || normalizePathIdentity(snapshot.session.projectRoot) !== root) {
    throw new Error('The saved conversation belongs to a different project.');
  }
  const branch = sessionThreadPath(snapshot.thread);
  const active = new Set(branch.path.map(entry => entry.id));
  if (!branch.resolved || snapshot.points.some(point => active.has(point.entryId) && point.unavailable)) {
    throw new Error('The saved conversation path is unavailable.');
  }
  return { turns: snapshot.session.turns, version: snapshot.version };
}

export interface SessionNavigationResult {
  /** The outcome of the saved branch navigation, separate from refreshing its view. */
  readonly status: 'unchanged' | 'changed' | 'changed-with-warning' | 'unknown';
  /** A verified replacement for the active runtime view is available. */
  readonly changed: boolean;
  readonly output: string;
  readonly draft?: string;
}

/** The same leaf switch and branch summary serve terminal and scripted hosts. */
export async function navigateSession(input: {
  readonly runtimeContext: ShellRuntimeContext;
  readonly sessionManager: Pick<SessionManager, "revertTo">;
  readonly sessionRuntime: Pick<ShellSessionRuntime, "getState" | "summarizeAbandonedTurns">;
}, entryId?: string, expectedVersion?: string, admission?: () => string | undefined): Promise<SessionNavigationResult> {
  const { runtimeContext: context, sessionManager: manager, sessionRuntime: runtime } = input;
  const sessionId = context.session.id;
  const cwd = context.cwd;
  const projectRoot = context.projectRoot;
  const validate = (): void => {
    let issue: string | undefined;
    try { issue = admission?.(); }
    catch { throw new Error('Session navigation is unavailable. Reopen its tree.'); }
    if (issue) throw new Error(issue);
  };
  validate();
  const { thread, points, session, version } = readSessionNavigation(sessionId, cwd);
  if (expectedVersion !== undefined && expectedVersion !== version) return {
    status: 'unchanged', changed: false,
    output: 'The saved conversation changed after selection. Reopen the session tree before navigating.',
  };
  const expectedRoot = normalizePathIdentity(projectRoot);
  if (!expectedRoot || normalizePathIdentity(session.projectRoot) !== expectedRoot) {
    throw new Error('The saved session belongs to a different project. Reopen it in that project before navigating.');
  }
  if (entryId === undefined) {
    return {
      status: 'unchanged',
      changed: false,
      output: ["### Session tree", "", ...navigationLines(points),
      "", "Use /tree <entry-id> to continue from an entry. Other branches and files are kept."].join("\n"),
    };
  }
  if (runtime.getState() === "running") throw new Error("Wait for the current turn to finish before navigating the session.");
  const point = points.find((candidate) => candidate.entryId === entryId);
  if (!point) throw new Error(`No entry with id ${entryId} in this session.`);
  if (point.unavailable || !sessionThreadPath(thread, entryId).resolved) {
    throw new Error(`Cannot navigate to ${entryId}: ${point.unavailable ?? "broken ancestry"}.`);
  }
  if (thread.activeLeafId === entryId) {
    const changed = JSON.stringify(context.session.turns) !== JSON.stringify(session.turns)
      || JSON.stringify(context.session.reports) !== JSON.stringify(session.reports);
    if (changed) adoptSession(context, session);
    return {
      status: 'unchanged', changed,
      output: changed
        ? 'That entry is already active in the saved conversation. The active view was refreshed. Other branches and files are kept.'
        : 'Already at that point in the conversation.',
      ...(point.prompt !== undefined ? { draft: point.prompt } : {}),
    };
  }
  const isCurrent = (): boolean => context.session.id === sessionId && context.cwd === cwd && context.projectRoot === projectRoot;
  let dropped: number | undefined;
  let failed = false;
  let warning = 'A storage error was reported while navigating.';
  try {
    dropped = await manager.revertTo(sessionId, entryId,
      abandoned => runtime.summarizeAbandonedTurns(abandoned),
      () => {
        validate();
        if (!isCurrent() || runtime.getState() === 'running') {
          throw new Error('The active session changed while preparing navigation.');
        }
      }, version);
  } catch (error) {
    failed = true;
    if (error instanceof SessionNavigationWarning) { warning = error.message; dropped = error.dropped; }
  }
  if (!isCurrent()) return {
    status: 'unknown', changed: false,
    output: 'The active session changed while navigating. Its view was preserved; reopen the previous session to check the navigation outcome.',
  };
  if (runtime.getState() === 'running') return {
    status: 'unknown', changed: false,
    output: 'The session became busy while navigating. Its current view was preserved; reload the session tree when it is idle to check the navigation outcome.',
  };
  let verified: ReturnType<typeof readSessionNavigation>;
  try {
    verified = readSessionNavigation(sessionId, cwd);
    if (normalizePathIdentity(verified.session.projectRoot) !== expectedRoot) {
      return {
        status: 'unknown', changed: false,
        output: 'The saved session moved to a different project while navigating. The current view was preserved; reopen the session in its project before continuing.',
      };
    }
    const current = verified.points.find(candidate => candidate.current);
    if (!current || current.unavailable || !sessionThreadPath(verified.thread).resolved) throw new Error('Unreadable active branch');
  } catch {
    return {
      status: 'unknown', changed: false,
      output: 'Navigation outcome is unknown. The current view may be out of date; reopen this session before continuing.',
    };
  }
  if (verified.thread.activeLeafId === thread.activeLeafId) return {
    status: 'unchanged', changed: false,
    output: 'The active conversation is unchanged. Navigation did not reach the requested entry; reload the session tree before retrying.',
  };
  const restored = verified.session;
  adoptSession(context, restored);
  if (verified.thread.activeLeafId !== entryId) return {
    status: 'changed-with-warning', changed: true,
    output: `The active conversation is now at ${verified.thread.activeLeafId}. The requested entry is not active; its draft was not applied. Other branches and files are kept.`,
  };
  const retained = dropped === undefined ? 'Other messages remain in the session tree.'
    : `${dropped} later ${dropped === 1 ? 'message is' : 'messages are'} kept in the session tree.`;
  const prompt = verified.points.find(candidate => candidate.entryId === entryId)?.prompt;
  return {
    status: failed ? 'changed-with-warning' : 'changed',
    changed: true,
    output: `Now at ${entryId}. ${retained} Files are unchanged.${failed ? ` Warning: ${warning}` : ''}`,
    ...(prompt !== undefined ? { draft: prompt } : {}),
  };
}

function adoptSession(context: ShellRuntimeContext, session: Session): void {
  context.session = session;
  markContextUnknown(session.id);
  replayTodosFromMessages(session.id, session.turns);
}
