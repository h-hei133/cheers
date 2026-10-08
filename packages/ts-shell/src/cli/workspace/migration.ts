import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import { switchActiveSession } from '../../core/shell/runtimeContext.js';
import { configurationAdmission } from '../../core/shell/configuration.js';
import type { SessionManager } from '../../session/SessionManager.js';
import { SessionRootRebindError } from '../../session/continuation/sessionProjectRootRebind.js';
import { normalizePathIdentity } from '../../session/continuation/roots.js';
import { captureWorkspaceRoot, assertWorkspaceRoot, validateWorkspaceRoots } from '../../core/workspace/roots.js';
import { requireIdleWorkspaceSession } from '../../session/continuation/workspace.js';
import { readSessionRecordSnapshot } from '../../session/store/sessionStore.js';
import { readSessionFileVersion } from '../../session/store/version.js';
import { resolveRuntimeProjectRoot } from './binding.js';

const UNKNOWN = 'The session root migration is partial or unverified. Reopen the saved session before running tools.';

/** Migrate the saved identity first; publish runtime bindings only from a confirmed record. */
export function migrateWorkspaceSession(manager: SessionManager, context: ShellRuntimeContext, target: string, busy: () => boolean): { changed: boolean; note: string } {
  let committed = false;
  let warning = false;
  try {
    if (busy()) return { changed: false, note: 'Wait for the current session operation before migrating.' };
    const expected = context.session;
    const source = context.projectRoot;
    const { layout, version } = requireIdleWorkspaceSession(manager, expected, busy);
    const destination = resolveRuntimeProjectRoot(context.cwd, target);
    const root = captureWorkspaceRoot(destination.projectRoot, context.cwd, 'write');
    const roots = (expected.workspaceRoots ?? []).filter(item => normalizePathIdentity(item.path) !== normalizePathIdentity(root.path));
    validateWorkspaceRoots(root.path, roots);
    const binding = { rootMode: destination.rootMode, requestedWorkspaceRoot: destination.requestedRoot,
      targetPathBase: destination.targetPathBase, gitRoot: destination.gitRoot };
    try {
      manager.rebindSessionProjectRoot(expected.id, destination.projectRoot, { binding, workspaceRoots: roots,
        beforeCommit: () => {
          if (busy() || context.session !== expected || context.projectRoot !== source
            || readSessionFileVersion(layout) !== version || manager.getSessionDirPath(expected.id) !== layout.sessionDir) {
            throw new Error('Session changed before migration.');
          }
          assertWorkspaceRoot(root);
          validateWorkspaceRoots(root.path, roots);
        },
      });
      committed = true;
    } catch (error) {
      if (!(error instanceof SessionRootRebindError)) throw error;
      if (error.outcome === 'unchanged' || error.outcome === 'restored') return { changed: false, note: 'Session root migration did not commit; the previous binding is retained.' };
      if (error.outcome !== 'committed') { context.workspaceIssue = UNKNOWN; return { changed: false, note: UNKNOWN }; }
      committed = true;
      warning = true;
    }
    const saved = readSessionRecordSnapshot({ sessionId: expected.id, layout, cwd: source }).session;
    assertWorkspaceRoot(root);
    if (saved.id !== expected.id || saved.createdAt !== expected.createdAt || saved.projectRoot !== destination.projectRoot
      || saved.rootMode !== binding.rootMode || saved.requestedWorkspaceRoot !== binding.requestedWorkspaceRoot
      || saved.targetPathBase !== binding.targetPathBase || saved.gitRoot !== binding.gitRoot
      || JSON.stringify(saved.workspaceRoots ?? []) !== JSON.stringify(roots)) throw new Error('Saved migration could not be confirmed.');
    switchActiveSession(context, saved, destination.projectRoot, { cwd: destination.projectRoot, projectRoot: destination.projectRoot,
      ...binding, rootBindingDiagnostics: destination.rootBindingDiagnostics, gitContext: destination.gitContext });
    const blocked = configurationAdmission(context)();
    return { changed: true, note: `Session ${saved.id} migrated to ${destination.projectRoot}.`
      + (warning ? ' Saved binding was confirmed after a follow-up failure; check session selection before restarting.' : '')
      + (blocked ? ' Configuration is blocked; reload valid settings before starting new actions.' : '') };
  } catch {
    if (committed) context.workspaceIssue = UNKNOWN;
    return { changed: false, note: committed ? UNKNOWN : 'Session migration refused. Check the destination path, root conflicts and saved session.' };
  }
}
