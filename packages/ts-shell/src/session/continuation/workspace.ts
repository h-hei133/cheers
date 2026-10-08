import { dirname } from 'node:path';
import path from 'node:path';
import { realpathSync } from 'node:fs';
import type { SessionManager } from '../SessionManager.js';
import type { Session } from '../schema/sessionRecord.js';
import { captureWorkspaceRoot, validateWorkspaceRoots } from '../../core/workspace/roots.js';
import { decodeWorkspaceRoots, type WorkspaceRoot } from '../../core/workspace/model.js';
import { normalizePathIdentity } from './roots.js';
import { projectSessionFileLayout } from '../store/sessionFileLayout.js';
import { readSessionMetadataRecord, readSessionRecordSnapshot } from '../store/sessionStore.js';
import { readSessionFileVersion } from '../store/version.js';
import { readStateSnapshotRequired, withSessionStateLock } from '../store/sessionStateStore.js';
import { writeJsonFileAtomic } from '../store/sessionFileStore.js';

export interface WorkspaceChangeResult {
  readonly status: 'changed' | 'unchanged' | 'unknown';
  readonly note: string;
  readonly session?: Session;
}

/** Recheck durable authority at each action boundary without acquiring transcript contents. */
export function sessionWorkspaceAdmission(manager: Pick<SessionManager, 'getSessionDirPath'>, session: Session): string | undefined {
  try {
    const layout = projectSessionFileLayout({ sessionsDir: dirname(manager.getSessionDirPath(session.id)), sessionId: session.id });
    const version = readSessionFileVersion(layout);
    const metadata = readSessionMetadataRecord(layout.metadataPath);
    const state = readStateSnapshotRequired(layout.statePath);
    if (!metadata || metadata.id !== session.id || metadata.createdAt !== session.createdAt
      || normalizePathIdentity(metadata.projectRoot || state.projectRoot || session.projectRoot) !== normalizePathIdentity(session.projectRoot)
      || (state.projectRoot !== undefined && normalizePathIdentity(state.projectRoot) !== normalizePathIdentity(session.projectRoot))
      || JSON.stringify(decodeWorkspaceRoots(state.workspaceRoots)) !== JSON.stringify(session.workspaceRoots ?? [])
      || readSessionFileVersion(layout) !== version || manager.getSessionDirPath(session.id) !== layout.sessionDir) {
      return 'The saved workspace binding or grants changed. Reopen the session before starting new actions.';
    }
  } catch { return 'The saved workspace authority could not be checked. Reopen the session before starting new actions.'; }
  return undefined;
}

/** Reject stale runtime grants before preparing a primary switch or a state update. */
export function requireIdleWorkspaceSession(manager: Pick<SessionManager, 'getSessionDirPath'>, session: Session, busy: () => boolean) {
  if (busy()) throw new Error('The session is busy.');
  const layout = projectSessionFileLayout({ sessionsDir: dirname(manager.getSessionDirPath(session.id)), sessionId: session.id });
  const version = readSessionFileVersion(layout);
  const saved = readSessionRecordSnapshot({ sessionId: session.id, layout, cwd: session.projectRoot });
  if (saved.session.id !== session.id || saved.session.createdAt !== session.createdAt
    || normalizePathIdentity(saved.session.projectRoot) !== normalizePathIdentity(session.projectRoot)
    || (saved.state.projectRoot !== undefined && normalizePathIdentity(saved.state.projectRoot) !== normalizePathIdentity(session.projectRoot))
    || JSON.stringify(saved.session.workspaceRoots ?? []) !== JSON.stringify(session.workspaceRoots ?? [])
    || (saved.state.status === 'active' && (saved.state.runPhase === 'prompt-persisted' || saved.state.runPhase === 'turn-active'))
    || busy() || readSessionFileVersion(layout) !== version || manager.getSessionDirPath(session.id) !== layout.sessionDir) {
    throw new Error('The saved session changed or is busy.');
  }
  return { layout, version, saved };
}

/** A single durable state update, serialized with the session's existing writers. */
export function changeSessionWorkspaceRoots(input: {
  readonly manager: Pick<SessionManager, 'getSessionDirPath'>;
  readonly session: Session;
  readonly busy: () => boolean;
  readonly action: 'add' | 'remove';
  readonly target: string;
  readonly access?: WorkspaceRoot['access'];
}): WorkspaceChangeResult {
  let started = false;
  try {
    const id = input.session.id;
    const { layout, version } = requireIdleWorkspaceSession(input.manager, input.session, input.busy);
    return withSessionStateLock(layout, () => {
      const saved = readSessionRecordSnapshot({ sessionId: id, layout, cwd: input.session.projectRoot });
      if (input.busy() || saved.session.id !== id || saved.session.createdAt !== input.session.createdAt
        || normalizePathIdentity(saved.session.projectRoot) !== normalizePathIdentity(input.session.projectRoot)
        || JSON.stringify(saved.session.workspaceRoots ?? []) !== JSON.stringify(input.session.workspaceRoots ?? [])
        || (saved.state.status === 'active' && (saved.state.runPhase === 'turn-active' || saved.state.runPhase === 'prompt-persisted'))
        || readSessionFileVersion(layout) !== version) {
        return { status: 'unchanged', note: 'The session changed or is busy. Reopen it before changing workspace roots.' };
      }
      const previous = saved.session.workspaceRoots ?? [];
      const roots = nextRoots(saved.session.projectRoot, previous, input);
      if (JSON.stringify(roots) === JSON.stringify(previous)) return { status: 'unchanged', note: 'The workspace roots are already in the requested state.', session: saved.session };
      if (input.action === 'add') validateWorkspaceRoots(saved.session.projectRoot, roots);
      if (readSessionFileVersion(layout) !== version || input.manager.getSessionDirPath(id) !== layout.sessionDir) {
        return { status: 'unchanged', note: 'The saved session changed before the workspace update.' };
      }
      started = true;
      writeJsonFileAtomic(layout.statePath, { ...saved.state, workspaceRoots: roots });
      const confirmed = readSessionRecordSnapshot({ sessionId: id, layout, cwd: saved.session.projectRoot }).session;
      if (confirmed.id !== id || confirmed.createdAt !== saved.session.createdAt || confirmed.projectRoot !== saved.session.projectRoot
        || JSON.stringify(confirmed.workspaceRoots) !== JSON.stringify(roots)) {
        return { status: 'unknown', note: 'Workspace roots were saved, but the result could not be confirmed. Reopen the session before running tools.' };
      }
      return { status: 'changed', note: input.action === 'add' ? 'Additional workspace root saved. File access uses its declared mode; executable project resources still come from the primary root.'
        : 'Additional workspace root removed.', session: confirmed };
    }, { requireExisting: true });
  } catch {
    return { status: started ? 'unknown' : 'unchanged', note: started
      ? 'The workspace update was attempted, but its result is unknown. Reopen the session before running tools.'
      : 'Workspace update refused. Check that the path exists, roots do not overlap, and the session is available.' };
  }
}

function nextRoots(primary: string, roots: readonly WorkspaceRoot[], input: { action: 'add' | 'remove'; target: string; access?: WorkspaceRoot['access'] }): readonly WorkspaceRoot[] {
  if (input.action === 'add') {
    const root = captureWorkspaceRoot(input.target, primary, input.access ?? 'read');
    return roots.some(item => normalizePathIdentity(item.path) === normalizePathIdentity(root.path))
      ? roots.map(item => normalizePathIdentity(item.path) === normalizePathIdentity(root.path) ? root : item)
      : [...roots, root];
  }
  if (!input.target.trim() || /[\x00-\x1f\x7f-\x9f]/.test(input.target)) throw new Error('Workspace path is invalid.');
  let target = path.resolve(primary, input.target);
  if (roots.some(root => normalizePathIdentity(root.path) === normalizePathIdentity(target))) {
    return roots.filter(root => normalizePathIdentity(root.path) !== normalizePathIdentity(target));
  }
  try { target = realpathSync(target); } catch { /* Missing registered roots must remain removable. */ }
  return roots.filter(root => normalizePathIdentity(root.path) !== normalizePathIdentity(target));
}
