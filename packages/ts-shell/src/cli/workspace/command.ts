import { resolveRuntimeProjectRoot, normalizePathForCompare } from './binding.js';
import type { ShellActionResult } from '../../core/commands/types.js';
import { changeSessionWorkspaceRoots, requireIdleWorkspaceSession } from '../../session/continuation/workspace.js';
import { migrateWorkspaceSession } from './migration.js';
import {
  createWorkspaceAttachSwitchDiagnostic,
  switchActiveSession,
  type ShellRuntimeContext,
} from "../../core/shell/runtimeContext.js";
import { StreamingRenderer } from "../../presentation/terminal/streaming.js";
import { SessionManager } from "../../session/SessionManager.js";
import {
  renderRecentProjectContexts,
  renderWorkspaceSummary,
} from "./surface.js";

export function runCliWorkspaceCommand(input: {
  readonly renderer: StreamingRenderer;
  readonly sessionManager: SessionManager;
  readonly runtimeContext: ShellRuntimeContext;
  readonly workspaceAction?: ShellActionResult['workspaceAction'];
  readonly workspaceAccess?: 'read' | 'write';
  readonly busy?: () => boolean;
  readonly workspaceTarget?: string;
  readonly printMode: boolean;
  readonly onProjectContextSwitched?: () => void;
}): void {
  const workspaceAction = input.workspaceAction ?? "status";
  if (workspaceAction === 'add' || workspaceAction === 'remove' || workspaceAction === 'rebind') {
    const target = input.workspaceTarget?.trim();
    if (!target) { input.renderer.renderLine(`Usage: /workspace ${workspaceAction} <path>`); return; }
    if (workspaceAction === 'rebind') {
      const result = migrateWorkspaceSession(input.sessionManager, input.runtimeContext, target, input.busy ?? (() => false));
      input.renderer.renderLine(result.note);
      if (result.changed) input.onProjectContextSwitched?.();
    } else {
      const result = changeSessionWorkspaceRoots({ manager: input.sessionManager, session: input.runtimeContext.session,
        busy: input.busy ?? (() => false), action: workspaceAction, target, access: input.workspaceAccess });
      input.renderer.renderLine(result.note);
      if (result.status === 'unknown') input.runtimeContext.workspaceIssue = result.note;
      if (result.status === 'changed' && result.session) {
        input.runtimeContext.session = result.session;
        input.runtimeContext.workspaceIssue = undefined;
        input.runtimeContext.workspaceRevision = (input.runtimeContext.workspaceRevision ?? 0) + 1;
        input.onProjectContextSwitched?.();
      }
    }
    renderWorkspaceSummary(input.renderer, input.runtimeContext);
    return;
  }
  if (workspaceAction === "recent") {
    renderRecentProjectContexts(
      input.renderer,
      input.sessionManager.listRecentProjectContexts(8),
    );
    return;
  }

  if (workspaceAction === "attach") {
    if (input.busy?.()) { input.renderer.renderLine('Wait for the current session operation before switching workspaces.'); return; }
    runCliWorkspaceAttach(input);
    return;
  }

  renderWorkspaceSummary(input.renderer, input.runtimeContext);
}

function runCliWorkspaceAttach(input: {
  readonly renderer: StreamingRenderer;
  readonly sessionManager: SessionManager;
  readonly runtimeContext: ShellRuntimeContext;
  readonly workspaceTarget?: string;
  readonly printMode: boolean;
  readonly busy?: () => boolean;
  readonly onProjectContextSwitched?: () => void;
}): void {
  const attachTarget = input.workspaceTarget?.trim();
  if (!attachTarget) {
    input.renderer.renderLine(
      input.printMode ? "Usage: /workspace attach <path>" : "\nUsage: /workspace attach <path>\n",
    );
    return;
  }

  let createdId: string | undefined;
  let switched = false;
  try {
    requireIdleWorkspaceSession(input.sessionManager, input.runtimeContext.session, input.busy ?? (() => false));
    const attached = resolveRuntimeProjectRoot(
      input.runtimeContext.cwd,
      attachTarget,
    );
    const previousProjectRoot = input.runtimeContext.projectRoot;
    const attachDiagnostics =
      normalizePathForCompare(previousProjectRoot) ===
      normalizePathForCompare(attached.projectRoot)
        ? attached.rootBindingDiagnostics
        : [
            ...attached.rootBindingDiagnostics,
            createWorkspaceAttachSwitchDiagnostic({
              currentProjectRoot: previousProjectRoot,
              requestedWorkspaceRoot: attached.requestedRoot,
              resolvedProjectRoot: attached.projectRoot,
            }),
          ];
    if (
      normalizePathForCompare(previousProjectRoot) ===
      normalizePathForCompare(attached.projectRoot)
    ) {
      const result = migrateWorkspaceSession(input.sessionManager, input.runtimeContext, attachTarget, input.busy ?? (() => false));
      if (!result.changed) { input.renderer.renderLine(result.note); return; }
      input.renderer.renderLine(result.note);
      input.onProjectContextSwitched?.();
      input.renderer.renderLine(
        input.printMode
          ? `Already attached to ${attached.projectRoot}; requested path resolves to this project root.`
          : `\nAlready attached to ${attached.projectRoot}; requested path resolves to this project root.`,
      );
      renderWorkspaceSummary(input.renderer, input.runtimeContext);
      return;
    }

    const attachedSession = input.sessionManager.createNew(attached.projectRoot, {
      rootMode: attached.rootMode,
      requestedWorkspaceRoot: attached.requestedRoot,
      targetPathBase: attached.targetPathBase,
      gitRoot: attached.gitRoot,
    });
    createdId = attachedSession.id;
    switchActiveSession(input.runtimeContext, attachedSession, attached.projectRoot, {
      cwd: attached.projectRoot,
      projectRoot: attached.projectRoot,
      rootMode: attached.rootMode,
      requestedWorkspaceRoot: attached.requestedRoot,
      targetPathBase: attached.targetPathBase,
      gitRoot: attached.gitRoot,
      rootBindingDiagnostics: attachDiagnostics,
      gitContext: attached.gitContext,
    });
    switched = true;

    input.renderer.renderLine(
      input.printMode
        ? `Attached project context: ${previousProjectRoot} -> ${attached.projectRoot}`
        : `\nAttached project context: ${previousProjectRoot} -> ${attached.projectRoot}`,
    );
    input.renderer.renderLine(`New project session: ${attachedSession.id}`);
    renderWorkspaceSummary(input.renderer, input.runtimeContext);
    renderRecentProjectContexts(
      input.renderer,
      input.sessionManager.listRecentProjectContexts(8),
    );
    input.onProjectContextSwitched?.();
  } catch (error) {
    if (createdId) {
      const note = switched ? `Project session ${createdId} was attached, but a follow-up refresh failed. Reopen the session before running tools.`
        : `Project session ${createdId} was created, but its runtime attachment could not be confirmed. Reopen the saved session before running tools.`;
      input.runtimeContext.workspaceIssue = note;
      input.renderer.renderLine(note);
      return;
    }
    input.renderer.renderLine(
      input.printMode
        ? `Failed to attach project: ${error instanceof Error ? error.message : String(error)}`
        : `\nFailed to attach project: ${error instanceof Error ? error.message : String(error)}\n`,
    );
  }
}
