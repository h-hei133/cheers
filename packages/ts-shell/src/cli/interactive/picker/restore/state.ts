import type { SessionSelectionContext } from '../../../../session/navigation/selection.js';
import { normalizePathIdentity } from '../../../../session/continuation/roots.js';
import { assertCurrentProfile, currentProfile } from '../../../../core/paths/profile/context.js';
import { captureWorkspaceRoot, assertWorkspaceRoot } from '../../../../core/workspace/roots.js';

export interface RestorePickerAccess {
  readonly context?: () => SessionSelectionContext;
  readonly admission?: () => string | undefined;
  readonly signal?: AbortSignal;
}

/** Owner identity remains separate from admission so same-owner refusal can be reported. */
export function restoreSelection(access: RestorePickerAccess, workspaceRoot: string) {
  const profile = currentProfile();
  let workspace: ReturnType<typeof captureWorkspaceRoot> | undefined;
  let expected: SessionSelectionContext | undefined;
  let unavailable = false;
  try {
    workspace = captureWorkspaceRoot(workspaceRoot, workspaceRoot, 'read');
    const context = access.context?.();
    expected = context ? { ...context } : undefined;
    unavailable = context !== undefined && (!normalizePathIdentity(context.projectRoot)
      || normalizePathIdentity(context.projectRoot) !== normalizePathIdentity(workspaceRoot));
  }
  catch { unavailable = true; }
  const isCurrent = (): boolean => {
    if (unavailable) return false;
    try {
      if (!workspace) return false;
      const currentWorkspace = captureWorkspaceRoot(workspaceRoot, workspaceRoot, 'read');
      if (currentWorkspace.path !== workspace.path || currentWorkspace.identity !== workspace.identity) return false;
      const active = currentProfile();
      if (active?.root !== profile?.root || active?.rootIdentity !== profile?.rootIdentity) return false;
      if (!access.context) return true;
      const current = access.context();
      return current.sessionId === expected?.sessionId
        && normalizePathIdentity(current.projectRoot) === normalizePathIdentity(expected.projectRoot);
    } catch { return false; }
  };
  const check = (): void => {
    access.signal?.throwIfAborted();
    if (!isCurrent()) throw new Error('The snapshot opening owner changed. Reopen /restore.');
    if (!workspace) throw new Error('The snapshot opening workspace is unavailable. Reopen /restore.');
    assertWorkspaceRoot(workspace);
    if (profile) assertCurrentProfile(profile);
    let blocked: string | undefined;
    try { blocked = access.admission?.(); }
    catch { blocked = 'unavailable'; }
    if (blocked) throw new Error('The snapshot opening is unavailable. Reopen /restore.');
  };
  return { check, isCurrent, signal: access.signal };
}
