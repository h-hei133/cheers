import { dirname } from 'node:path';
import { lstatSync } from 'node:fs';
import type { SessionManager } from '../SessionManager.js';
import type { Session } from '../schema/sessionRecord.js';
import type { SessionSelectionContext } from '../navigation/selection.js';
import { normalizePathIdentity } from '../continuation/roots.js';
import { projectSessionFileLayout, type SessionFileLayout } from '../store/sessionFileLayout.js';
import { readSessionRecordSnapshot } from '../store/sessionStore.js';
import { readSessionFileVersion } from '../store/version.js';
import { withSessionStateLock } from '../store/sessionStateStore.js';

type Manager = Pick<SessionManager, 'catalog' | 'getSessionDirPath' | 'renameSession' | 'deleteSession' | 'sessionExists'>;
export type SessionManagementAction = 'rename' | 'delete';
export interface SessionManagementPreview {
  readonly action: SessionManagementAction;
  readonly session: Session;
  readonly expected: SessionSelectionContext;
  readonly layout: SessionFileLayout;
  readonly version: string;
}
export type SessionManagementResult = { readonly status: 'changed' | 'unchanged' | 'unknown'; readonly note: string };

/** Resolve the entire saved catalog, then bind approval to one freshly read identity. */
export async function prepareSessionManagement(manager: Manager, context: () => SessionSelectionContext,
  action: SessionManagementAction, reference?: string, signal?: AbortSignal,
): Promise<{ readonly preview: SessionManagementPreview; readonly note?: never } | { readonly note: string; readonly preview?: never }> {
  const expected = { ...context() };
  if (expected.busy) return { note: 'A session operation is running. Wait before changing saved sessions.' };
  const resolved = await manager.catalog.resolve(reference?.trim() || expected.sessionId,
    { projectRoot: expected.projectRoot, strictProject: true, signal });
  signal?.throwIfAborted();
  if (!resolved.ok || !resolved.sessionId) return { note: resolved.reason === 'ambiguous'
    ? 'Session reference is ambiguous. Use an exact session ID.'
    : resolved.reason === 'incomplete' ? 'Saved sessions could not be fully checked. No session was changed.'
    : resolved.reason === 'outside-project' ? 'This session belongs to a different project.'
    : 'Session was not found. No session was changed.' };
  try {
    const layout = layoutFor(manager, resolved.sessionId);
    const version = readSessionFileVersion(layout);
    const snapshot = readSessionRecordSnapshot({ sessionId: resolved.sessionId, layout, cwd: expected.projectRoot });
    const note = block(expected, context(), snapshot.session, resolved.sessionId, action, snapshot.state.status === 'active' ? snapshot.state.runPhase : undefined);
    if (note) return { note };
    if (version !== readSessionFileVersion(layout) || layoutFor(manager, resolved.sessionId).sessionDir !== layout.sessionDir) {
      return { note: 'The saved session changed while preparing the action. Try again.' };
    }
    return { preview: { action, session: snapshot.session, expected, layout, version } };
  } catch {
    signal?.throwIfAborted();
    return { note: 'The saved session is missing or unreadable. No session was changed.' };
  }
}

/** Recheck after confirmation and serialize against cooperating state writers. */
export function applySessionManagement(manager: Manager, context: () => SessionSelectionContext,
  preview: SessionManagementPreview, title?: string,
): SessionManagementResult {
  if (preview.action === 'rename' && invalidSessionTitle(title ?? '')) {
    return { status: 'unchanged', note: invalidSessionTitle(title ?? '')! };
  }
  let started = false;
  let confirmedDeletion = false;
  try {
    return withSessionStateLock(preview.layout, () => {
      const id = preview.session.id;
      const layout = layoutFor(manager, id);
      if (layout.sessionDir !== preview.layout.sessionDir || readSessionFileVersion(layout) !== preview.version) {
        return { status: 'unchanged', note: 'The saved session changed after the preview. Reopen the action.' };
      }
      const snapshot = readSessionRecordSnapshot({ sessionId: id, layout, cwd: preview.expected.projectRoot });
      const note = block(preview.expected, context(), snapshot.session, id, preview.action, snapshot.state.status === 'active' ? snapshot.state.runPhase : undefined);
      if (note) return { status: 'unchanged', note };
      if (readSessionFileVersion(layout) !== preview.version) return { status: 'unchanged', note: 'The saved session changed after the preview. Reopen the action.' };
      started = true;
      if (preview.action === 'delete') {
        manager.deleteSession(id);
        confirmedDeletion = !manager.sessionExists(id) && directoryMissing(layout.sessionDir);
        return !confirmedDeletion ? { status: 'unknown', note: 'Deletion was attempted, but the saved session is still present. Check it before retrying.' }
          : { status: 'changed', note: `Deleted session ${id}.` };
      }
      manager.renameSession(id, title!.trim());
      const saved = readSessionRecordSnapshot({ sessionId: id, layout, cwd: preview.expected.projectRoot }).session;
      return saved.id === id && saved.createdAt === preview.session.createdAt && saved.title === title!.trim()
        ? { status: 'changed', note: `Renamed session ${id} to ${saved.title}.` }
        : { status: 'unknown', note: 'Rename was attempted, but the saved title could not be confirmed. Check it before retrying.' };
    }, { requireExisting: true });
  } catch (error) {
    // Removing the directory deliberately removes its lock too. The lock owner
    // closes its descriptor before reporting ENOENT; only this confirmed case is expected.
    if (confirmedDeletion && (error as NodeJS.ErrnoException).code === 'ENOENT'
      && directoryMissing(preview.layout.sessionDir) && !manager.sessionExists(preview.session.id)) {
      return { status: 'changed', note: `Deleted session ${preview.session.id}.` };
    }
    return { status: started ? 'unknown' : 'unchanged', note: started
      ? 'The session action was attempted, but its result could not be confirmed. Check the saved session before retrying.'
      : 'The saved session is unavailable or locked. No session action was started.' };
  }
}

function directoryMissing(directory: string): boolean {
  try { lstatSync(directory); return false; }
  catch (error) { return (error as NodeJS.ErrnoException).code === 'ENOENT'; }
}

export function invalidSessionTitle(title: string): string | undefined {
  if (!title.trim()) return 'A non-empty session title is required.';
  if (Buffer.byteLength(title) > 4096) return 'Session titles must be at most 4096 bytes.';
  if (/[\x00-\x1f\x7f-\x9f]/.test(title)) return 'Session titles cannot contain control characters.';
  return undefined;
}

function layoutFor(manager: Manager, id: string): SessionFileLayout {
  return projectSessionFileLayout({ sessionsDir: dirname(manager.getSessionDirPath(id)), sessionId: id });
}

function block(expected: SessionSelectionContext, current: SessionSelectionContext, target: Session, id: string,
  action: SessionManagementAction, phase?: string): string | undefined {
  const root = normalizePathIdentity(expected.projectRoot);
  if (!root || expected.sessionId !== current.sessionId || root !== normalizePathIdentity(current.projectRoot)) return 'The active session or project changed. Reopen the action.';
  if (current.busy || phase === 'turn-active' || phase === 'prompt-persisted') return 'A session operation is running. Wait before changing saved sessions.';
  if (target.id !== id) return 'The saved session identity does not match the requested session.';
  if (normalizePathIdentity(target.projectRoot) !== root) return 'This session belongs to a different project.';
  if (action === 'delete' && id === current.sessionId) return 'The current session cannot be deleted. Switch sessions first.';
  return undefined;
}
