import { switchActiveSession, type ShellRuntimeContext } from "../../core/shell/runtimeContext.js";
import { replayTodosFromMessages } from "../../core/commands/todoCommandRuntime.js";
import type { SessionManager } from "../../session/SessionManager.js";

/** Start a new conversation while preserving the selected workspace. */
export async function startNewSession(
  context: ShellRuntimeContext,
  manager: Pick<SessionManager, "createNew" | "discardIfEmpty">,
): Promise<boolean> {
  const blocked = context.workspaceIssue ?? context.workspaceAdmission?.();
  if (blocked) throw new Error(blocked);
  const previous = context.session.id;
  if (context.sessionChange) {
    const result = await context.sessionChange({ reason: 'new', projectRoot: context.projectRoot,
      prepare: assertCurrent => {
        assertCurrent();
        return manager.createNew(context.projectRoot, { activate: false, workspaceRoots: context.session.workspaceRoots,
          rootMode: context.rootMode, requestedWorkspaceRoot: context.projectRoot, targetPathBase: context.projectRoot, gitRoot: context.gitContext.root ?? null });
      }, publish: session => { switchActiveSession(context, session); replayTodosFromMessages(session.id, []); } });
    if (result.status !== 'changed') {
      if (result.status === 'cancelled') return false;
      throw new Error(result.reason);
    }
    manager.discardIfEmpty(previous);
    return true;
  }
  const created = manager.createNew(context.projectRoot, {
    workspaceRoots: context.session.workspaceRoots,
    rootMode: context.rootMode,
    requestedWorkspaceRoot: context.projectRoot,
    targetPathBase: context.projectRoot,
    gitRoot: context.gitContext.root ?? null,
  });
  manager.discardIfEmpty(previous);
  switchActiveSession(context, created);
  replayTodosFromMessages(created.id, []);
  return true;
}
