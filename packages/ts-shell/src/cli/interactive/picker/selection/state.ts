import type { CommandContext } from '../../../../core/commands/types.js';
import { assertCurrentProfile, currentProfile } from '../../../../core/paths/profile/context.js';
import { assertWorkspaceRoot, captureWorkspaceRoot } from '../../../../core/workspace/roots.js';
import type { SessionSelectionContext } from '../../../../session/navigation/selection.js';
import { normalizePathIdentity } from '../../../../session/continuation/roots.js';

/** Admission is replayed separately from identity so a same-owner refusal remains reportable. */
export function pickerSelection(context: Pick<CommandContext, 'cwd' | 'projectRoot' | 'sessionId' | 'admission' | 'signal'> | undefined,
  current?: () => SessionSelectionContext, unavailableMessage = "The picker opening owner changed. Reopen it.") {
  let original = context ? { cwd: context.cwd, projectRoot: context.projectRoot ?? context.cwd,
    sessionId: context.sessionId, admission: context.admission, signal: context.signal } : undefined;
  const expected = original ? { cwd: original.cwd, projectRoot: original.projectRoot, sessionId: original.sessionId } : undefined;
  let live = current ? undefined : context;
  context = undefined;
  let opening: SessionSelectionContext | undefined;
  let profile = currentProfile();
  let workspace: ReturnType<typeof captureWorkspaceRoot> | undefined;
  let project: ReturnType<typeof captureWorkspaceRoot> | undefined;
  let unavailable = false;
  let openingError: unknown;
  try {
    original?.signal?.throwIfAborted();
    const active = current?.();
    opening = active ? { sessionId: active.sessionId, projectRoot: active.projectRoot, busy: active.busy } : undefined;
    if (opening && expected?.sessionId && opening.sessionId !== expected.sessionId) throw new Error(unavailableMessage);
    if (opening && expected && normalizePathIdentity(opening.projectRoot) !== normalizePathIdentity(expected.projectRoot)) throw new Error(unavailableMessage);
    const refused = original?.admission?.();
    if (refused) throw new Error(refused);
    original?.signal?.throwIfAborted();
    if (original) {
      workspace = captureWorkspaceRoot(original.cwd, original.cwd, 'read');
      project = captureWorkspaceRoot(original.projectRoot, original.cwd, 'read');
    }
  }
  catch (error) { unavailable = true; openingError = error; }
  const isCurrent = (): boolean => {
    if (unavailable) return false;
    if (live && expected && (live.cwd !== expected.cwd || live.sessionId !== expected.sessionId
      || normalizePathIdentity(live.projectRoot ?? live.cwd) !== normalizePathIdentity(expected.projectRoot))) return false;
    try {
      if (current && opening) {
        const active = current();
        if (active.sessionId !== opening.sessionId || active.projectRoot !== opening.projectRoot) return false;
      }
      if (workspace && expected) {
        const current = captureWorkspaceRoot(expected.cwd, expected.cwd, 'read');
        if (current.path !== workspace.path || current.identity !== workspace.identity) return false;
      }
      if (project && expected) {
        const active = captureWorkspaceRoot(expected.projectRoot, expected.cwd, 'read');
        if (active.path !== project.path || active.identity !== project.identity) return false;
      }
      const active = currentProfile();
      return active?.root === profile?.root && active?.rootIdentity === profile?.rootIdentity;
    } catch { return false; }
  };
  const check = (): void => {
    original?.signal?.throwIfAborted();
    if (openingError) throw openingError;
    if (!isCurrent()) throw new Error(unavailableMessage);
    if (workspace) assertWorkspaceRoot(workspace);
    if (project) assertWorkspaceRoot(project);
    if (profile) assertCurrentProfile(profile);
    const refused = original?.admission?.();
    if (refused) throw new Error(refused);
    original?.signal?.throwIfAborted();
    if (!isCurrent()) throw new Error(unavailableMessage);
    if (workspace) assertWorkspaceRoot(workspace);
    if (project) assertWorkspaceRoot(project);
    if (profile) assertCurrentProfile(profile);
  };
  const release = (accepted = false): void => {
    if (!accepted) { unavailable = true; workspace = undefined; project = undefined; profile = undefined; live = undefined; current = undefined; opening = undefined; }
    original = undefined;
    openingError = undefined;
  };
  return { check, isCurrent, release, sessionId: original?.sessionId, root: original?.cwd, projectRoot: original?.projectRoot };
}
