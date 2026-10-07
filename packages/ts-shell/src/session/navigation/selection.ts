import type { Session } from '../schema/sessionRecord.js';
import { sessionHasReentrySurface } from '../presentation/sessionReentrySurface.js';
import { normalizePathIdentity } from '../continuation/roots.js';

export interface SessionSelectionContext {
  readonly sessionId: string;
  readonly projectRoot: string;
  readonly busy: boolean;
}

export function sessionChoices(sessions: readonly Session[], context: SessionSelectionContext, limit = 40): {
  readonly sessions: readonly Session[];
  readonly currentUnavailable?: string;
} {
  const root = normalizePathIdentity(context.projectRoot);
  const scoped = sessions.filter(session => root !== undefined && normalizePathIdentity(session.projectRoot) === root && sessionHasReentrySurface(session));
  scoped.sort((left, right) => (Date.parse(right.updatedAt) - Date.parse(left.updatedAt)) || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  const recent = scoped.slice(0, limit);
  const current = scoped.find(session => session.id === context.sessionId);
  if (current && !recent.includes(current)) recent.push(current);
  if (current) return { sessions: recent };
  const stored = sessions.find(session => session.id === context.sessionId);
  const currentUnavailable = !stored ? 'Current session is missing or unreadable.'
    : normalizePathIdentity(stored.projectRoot) !== root ? 'Current session belongs to a different project.'
    : 'Current session has no saved conversation to reopen.';
  return { sessions: recent, currentUnavailable };
}

/** Validate the runtime identity and freshly read target before a selection action. */
export function sessionSelectionBlock(input: {
  readonly expected: SessionSelectionContext;
  readonly current: SessionSelectionContext;
  readonly target: Session | undefined;
  readonly targetId: string;
  readonly action: 'resume' | 'rename' | 'delete';
}): string | undefined {
  const { expected, current, target, targetId, action } = input;
  const root = normalizePathIdentity(current.projectRoot);
  if (!root || current.sessionId !== expected.sessionId || root !== normalizePathIdentity(expected.projectRoot)) {
    return 'The active session or project changed. Reopen the session picker.';
  }
  if (current.busy) return 'A session operation is running. Wait before changing saved sessions.';
  if (!target) return 'This session is missing or unreadable. Reopen the session picker.';
  if (target.id !== targetId) return 'The saved session identity does not match the selected session.';
  if (normalizePathIdentity(target.projectRoot) !== root || !sessionHasReentrySurface(target)) {
    return 'This session is no longer available in the current project.';
  }
  if (action === 'delete' && targetId === current.sessionId) return 'The current session cannot be deleted. Switch sessions first.';
  return undefined;
}
