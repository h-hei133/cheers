import { switchActiveSession, type ShellRuntimeContext } from "../../core/shell/runtimeContext.js";
import { replayTodosFromMessages } from "../../core/commands/todoCommandRuntime.js";
import type { SessionManager } from "../../session/SessionManager.js";

/** Start a new conversation while preserving the selected workspace. */
export function startNewSession(
  context: ShellRuntimeContext,
  manager: Pick<SessionManager, "createNew" | "discardIfEmpty">,
): void {
  const previous = context.session.id;
  const created = manager.createNew(context.projectRoot, {
    rootMode: context.rootMode,
    requestedWorkspaceRoot: context.projectRoot,
    targetPathBase: context.projectRoot,
    gitRoot: context.gitContext.root ?? null,
  });
  manager.discardIfEmpty(previous);
  switchActiveSession(context, created);
  replayTodosFromMessages(created.id, []);
}
