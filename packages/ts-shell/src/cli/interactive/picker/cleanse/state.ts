import type { CommandContext } from '../../../../core/commands/types.js';
import { assertCurrentProfile, currentProfile } from '../../../../core/paths/profile/context.js';
import { assertWorkspaceRoot, captureWorkspaceRoot } from '../../../../core/workspace/roots.js';
import type { SessionSelectionContext } from '../../../../session/navigation/selection.js';

/** Admission is replayed separately from identity so a same-owner refusal remains reportable. */
export function cleanseSelection(context: Pick<CommandContext, 'cwd' | 'sessionId' | 'admission' | 'signal'> | undefined,
  current?: () => SessionSelectionContext) {
  let original = context ? { cwd: context.cwd, sessionId: context.sessionId, admission: context.admission, signal: context.signal } : undefined;
  const expected = original ? { cwd: original.cwd, sessionId: original.sessionId } : undefined;
  let live = current ? undefined : context;
  context = undefined;
  let opening: SessionSelectionContext | undefined;
  let profile = currentProfile();
  let workspace: ReturnType<typeof captureWorkspaceRoot> | undefined;
  let unavailable = false;
  let openingError: unknown;
  try {
    original?.signal?.throwIfAborted();
    const active = current?.();
    opening = active ? { sessionId: active.sessionId, projectRoot: active.projectRoot, busy: active.busy } : undefined;
    if (opening && expected?.sessionId && opening.sessionId !== expected.sessionId) throw new Error('Retained diagnostics owner changed. Reopen /cleanse.');
    const refused = original?.admission?.();
    if (refused) throw new Error(refused);
    original?.signal?.throwIfAborted();
    if (original) workspace = captureWorkspaceRoot(original.cwd, original.cwd, 'read');
  }
  catch (error) { unavailable = true; openingError = error; }
  const isCurrent = (): boolean => {
    if (unavailable) return false;
    if (live && expected && (live.cwd !== expected.cwd || live.sessionId !== expected.sessionId)) return false;
    try {
      if (current && opening) {
        const active = current();
        if (active.sessionId !== opening.sessionId || active.projectRoot !== opening.projectRoot) return false;
      }
      if (workspace && expected) {
        const current = captureWorkspaceRoot(expected.cwd, expected.cwd, 'read');
        if (current.path !== workspace.path || current.identity !== workspace.identity) return false;
      }
      const active = currentProfile();
      return active?.root === profile?.root && active?.rootIdentity === profile?.rootIdentity;
    } catch { return false; }
  };
  const check = (): void => {
    original?.signal?.throwIfAborted();
    if (openingError) throw openingError;
    if (!isCurrent()) throw new Error('Retained diagnostics owner changed. Reopen /cleanse.');
    if (workspace) assertWorkspaceRoot(workspace);
    if (profile) assertCurrentProfile(profile);
    const refused = original?.admission?.();
    if (refused) throw new Error(refused);
    original?.signal?.throwIfAborted();
    if (!isCurrent()) throw new Error('Retained diagnostics owner changed. Reopen /cleanse.');
    if (workspace) assertWorkspaceRoot(workspace);
    if (profile) assertCurrentProfile(profile);
  };
  const release = (accepted = false): void => {
    if (!accepted) { unavailable = true; workspace = undefined; profile = undefined; live = undefined; current = undefined; opening = undefined; }
    original = undefined;
    openingError = undefined;
  };
  return { check, isCurrent, release, sessionId: original?.sessionId, root: original?.cwd };
}
