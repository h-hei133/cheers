import path from "node:path";
import type { Interface as ReadlineInterface } from "node:readline";
import { renderProjectedLines } from "../cli/output/projectedLineRenderer.js";
import {
  createSessionRootMismatchDiagnostic,
  resolveRootBindingDiagnostics,
  switchActiveSession,
  type RootBindingDiagnostic,
  type ShellRuntimeContext,
} from "../core/shell/runtimeContext.js";
import { renderRootBindingDiagnostics } from "../core/shell/startupSurfaceRenderer.js";
import { resolveSessionReference } from "../core/shell/recovery.js";
import {
  renderCurrentSessionSurface,
  renderSessionListSurface,
  renderSwitchedSessionSurface,
} from "../core/shell/sessionStateSurface.js";
import { StreamingRenderer } from "../presentation/terminal/streaming.js";
import type {
  Session,
  SessionReentrySummary,
} from "../session/SessionManager.js";
import { SessionManager } from "../session/SessionManager.js";
import { getWorkflowGitContext } from "../workflow/gitContext.js";
import {
  formatSessionPanelSwitchSuccessLines,
  formatSessionSwitchAmbiguousLine,
  formatSessionSwitchFailureLine,
  formatSessionSwitchNotFoundLine,
  formatSessionSwitchSuccessLines,
  formatSessionSwitchUsage,
} from "./cliSessionProjection.js";
import { openSessionsPanel } from "./sessionsPanel.js";
import { renderSessionCommandMap } from "./slashCommandRegistry.js";

export async function runCliSessionCommand(input: {
  readonly renderer: StreamingRenderer;
  readonly sessionManager: SessionManager;
  readonly runtimeContext: ShellRuntimeContext;
  readonly sessionAction?: "panel" | "list" | "switch" | "current" | "help";
  readonly sessionId?: string;
  readonly printMode: boolean;
  readonly lifecycleNotices?: readonly string[];
  readonly readline?: ReadlineInterface;
  readonly onSessionSwitched?: () => void;
}): Promise<void> {
  const sessionAction = input.sessionAction ?? "panel";
  if (sessionAction === "list") {
    renderSessionListSurface(input.renderer, {
      sessionManager: input.sessionManager,
      activeSessionId: input.runtimeContext.session.id,
      preferredProjectRoot: input.runtimeContext.projectRoot,
    });
    return;
  }

  if (sessionAction === "current") {
    if (input.printMode) {
      renderLatestSessionLifecycleNotice(input.renderer, input.lifecycleNotices);
    }
    renderCurrentSessionSurface(input.renderer, {
      sessionManager: input.sessionManager,
      runtimeContext: input.runtimeContext,
    });
    renderSessionCommandMap(input.renderer, { compact: true });
    return;
  }

  if (sessionAction === "switch") {
    await runCliSessionSwitch(input);
    return;
  }

  if (sessionAction === "help") {
    renderSessionCommandMap(input.renderer);
    return;
  }

  // The interactive panel drives stdin keypresses itself. A host that captures
  // renderer output owns raw stdin, so the panel would fight it for keystrokes;
  // such hosts get the non-interactive overview instead.
  if (!input.readline || input.renderer.captured) {
    renderSessionSurfaceOverview(
      input.renderer,
      input.sessionManager,
      input.runtimeContext,
    );
    return;
  }

  try {
    const sessions = input.sessionManager.listRecentSessions(5);
    if (sessions.length === 0) {
      input.renderer.renderLine("\nNo sessions found.\n");
      return;
    }
    const panelResult = await openSessionsPanel({
      rl: input.readline,
      sessionManager: input.sessionManager,
      runtimeContext: input.runtimeContext,
    });
    if (panelResult.switchedSessionId) {
      const switchDiagnostics = resolveSessionSwitchDiagnostics(
        input.runtimeContext,
        input.sessionManager.describeSessionReentry(
          panelResult.switchedSessionId,
        ),
      );
      if (hasBlockedRootBindingDiagnostic(switchDiagnostics)) {
        input.renderer.renderLine(
          "\nSession switch blocked by root binding diagnostics.",
        );
        renderRootBindingDiagnostics(input.renderer, switchDiagnostics);
        input.renderer.renderLine("");
        return;
      }
      const resumed = input.sessionManager.resume(panelResult.switchedSessionId);
      switchRuntimeSessionProjectContext(input.runtimeContext, resumed);
      renderProjectedLines(
        input.renderer,
        formatSessionPanelSwitchSuccessLines({
          nextSessionId: panelResult.switchedSessionId,
          projectRoot: input.runtimeContext.projectRoot,
        }),
      );
      renderSwitchedSessionSurface(input.renderer, {
        sessionManager: input.sessionManager,
        sessionId: panelResult.switchedSessionId,
      });
      input.renderer.renderLine("");
      input.onSessionSwitched?.();
    } else {
      input.renderer.renderLine("\nSessions panel closed.\n");
    }
  } catch (error) {
    input.renderer.renderLine(
      `\nSessions panel failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
  }
}

export function renderLatestSessionLifecycleNotice(
  renderer: StreamingRenderer,
  lifecycleNotices?: readonly string[],
): void {
  const lifecycleNotice = lifecycleNotices?.at(-1);
  if (lifecycleNotice) {
    renderer.renderLine(`Session lifecycle: ${lifecycleNotice}`);
  }
}

export function renderSessionSurfaceOverview(
  renderer: StreamingRenderer,
  sessionManager: SessionManager,
  runtimeContext: ShellRuntimeContext,
): void {
  renderer.renderLine("\n/resume (session surface)");
  renderCurrentSessionSurface(renderer, { sessionManager, runtimeContext });
  renderSessionListSurface(renderer, {
    sessionManager,
    activeSessionId: runtimeContext.session.id,
    preferredProjectRoot: runtimeContext.projectRoot,
  });
  renderSessionCommandMap(renderer);
}

export function switchRuntimeSessionProjectContext(
  runtimeContext: ShellRuntimeContext,
  resumedSession: Session,
): void {
  const nextProjectRoot =
    resumedSession.projectRoot?.trim() || runtimeContext.projectRoot;
  const nextGitContext = getWorkflowGitContext(nextProjectRoot);
  const nextRootMode =
    resumedSession.rootMode ?? resolveWorkspaceRootMode(nextGitContext);
  const nextTargetPathBase = resumedSession.targetPathBase ?? nextProjectRoot;
  const nextGitRoot = Object.prototype.hasOwnProperty.call(
    resumedSession,
    "gitRoot",
  )
    ? (resumedSession.gitRoot ?? null)
    : (nextGitContext.root ?? null);
  const nextRequestedWorkspaceRoot =
    resumedSession.requestedWorkspaceRoot ??
    runtimeContext.requestedWorkspaceRoot ??
    nextProjectRoot;
  const nextRootBindingDiagnostics = resolveRootBindingDiagnostics({
    projectRoot: nextProjectRoot,
    rootMode: nextRootMode,
    requestedWorkspaceRoot: nextRequestedWorkspaceRoot,
    targetPathBase: nextTargetPathBase,
    gitRoot: nextGitRoot,
    gitContext: nextGitContext,
  });
  switchActiveSession(runtimeContext, resumedSession, nextProjectRoot, {
    cwd: nextProjectRoot,
    projectRoot: nextProjectRoot,
    rootMode: nextRootMode,
    requestedWorkspaceRoot: nextRequestedWorkspaceRoot,
    targetPathBase: nextTargetPathBase,
    gitRoot: nextGitRoot,
    rootBindingDiagnostics: nextRootBindingDiagnostics,
    gitContext: nextGitContext,
  });
}

export function resolveSessionSwitchDiagnostics(
  runtimeContext: {
    projectRoot: string;
    requestedWorkspaceRoot?: string;
  },
  targetSession: Pick<SessionReentrySummary, "id" | "projectRoot">,
): readonly RootBindingDiagnostic[] {
  if (
    normalizePathForCompare(targetSession.projectRoot) ===
    normalizePathForCompare(runtimeContext.projectRoot)
  ) {
    return [];
  }

  return [
    createSessionRootMismatchDiagnostic({
      sessionId: targetSession.id,
      sessionProjectRoot: targetSession.projectRoot,
      requestedWorkspaceRoot:
        runtimeContext.requestedWorkspaceRoot ?? runtimeContext.projectRoot,
      resolvedProjectRoot: runtimeContext.projectRoot,
    }),
  ];
}

export function hasBlockedRootBindingDiagnostic(
  diagnostics: readonly RootBindingDiagnostic[],
): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === "blocked");
}

export async function resolveSwitchSessionReference(input: {
  renderer: StreamingRenderer;
  sessionManager: SessionManager;
  preferredProjectRoot: string;
  reference: string;
  printMode: boolean;
}): Promise<string | null> {
  const resolved = await resolveSessionReference({
    reference: input.reference,
    sessionManager: input.sessionManager,
    preferredProjectRoot: input.preferredProjectRoot,
  });
  if (resolved.ok && resolved.sessionId) {
    return resolved.sessionId;
  }

  if (resolved.reason === 'incomplete') {
    input.renderer.renderLine('Saved sessions could not be fully checked. Use an exact session ID or retry after the unavailable records are repaired. No session was switched.');
    return null;
  }

  if (resolved.reason === "ambiguous") {
    input.renderer.renderLine(
      formatSessionSwitchAmbiguousLine({
        reference: input.reference,
        candidates: resolved.candidates ?? [],
        printMode: input.printMode,
      }),
    );
    return null;
  }

  input.renderer.renderLine(
    formatSessionSwitchNotFoundLine({
      reference: input.reference,
      printMode: input.printMode,
    }),
  );
  return null;
}

async function runCliSessionSwitch(input: {
  readonly renderer: StreamingRenderer;
  readonly sessionManager: SessionManager;
  readonly runtimeContext: ShellRuntimeContext;
  readonly sessionId?: string;
  readonly printMode: boolean;
  readonly onSessionSwitched?: () => void;
}): Promise<void> {
  const targetSessionReference = input.sessionId?.trim();
  if (!targetSessionReference) {
    input.renderer.renderLine(formatSessionSwitchUsage({ printMode: input.printMode }));
    return;
  }

  const expectedSessionId = input.runtimeContext.session.id;
  const expectedProjectRoot = input.runtimeContext.projectRoot;
  const resolvedSessionId = await resolveSwitchSessionReference({
    renderer: input.renderer,
    sessionManager: input.sessionManager,
    preferredProjectRoot: input.runtimeContext.projectRoot,
    reference: targetSessionReference,
    printMode: input.printMode,
  });
  if (input.runtimeContext.session.id !== expectedSessionId || input.runtimeContext.projectRoot !== expectedProjectRoot) {
    input.renderer.renderLine('The active session or project changed while resolving the reference. No session was switched.');
    return;
  }
  if (!resolvedSessionId) {
    return;
  }

  try {
    const switchDiagnostics = resolveSessionSwitchDiagnostics(
      input.runtimeContext,
      input.sessionManager.describeSessionReentry(resolvedSessionId),
    );
    if (hasBlockedRootBindingDiagnostic(switchDiagnostics)) {
      input.renderer.renderLine(
        input.printMode
          ? "Session switch blocked by root binding diagnostics."
          : "\nSession switch blocked by root binding diagnostics.",
      );
      renderRootBindingDiagnostics(input.renderer, switchDiagnostics);
      if (!input.printMode) {
        input.renderer.renderLine("");
      }
      return;
    }
    const resumed = input.sessionManager.resume(resolvedSessionId);
    const previousSessionId = input.runtimeContext.session.id;
    switchRuntimeSessionProjectContext(input.runtimeContext, resumed);
    renderProjectedLines(
      input.renderer,
      formatSessionSwitchSuccessLines({
        previousSessionId,
        nextSessionId: resumed.id,
        projectRoot: input.runtimeContext.projectRoot,
        printMode: input.printMode,
      }),
    );
    renderSwitchedSessionSurface(input.renderer, {
      sessionManager: input.sessionManager,
      sessionId: resumed.id,
    });
    renderSessionCommandMap(input.renderer, { compact: true });
    if (!input.printMode) {
      input.renderer.renderLine("");
    }
    input.onSessionSwitched?.();
  } catch (error) {
    input.renderer.renderLine(
      formatSessionSwitchFailureLine({
        message: error instanceof Error ? error.message : String(error),
        printMode: input.printMode,
      }),
    );
  }
}

function normalizePathForCompare(value: string): string {
  return path.resolve(value).toLowerCase();
}

function resolveWorkspaceRootMode(
  gitContext: ReturnType<typeof getWorkflowGitContext>,
): "git-root" | "direct" {
  return gitContext.insideGit && gitContext.root ? "git-root" : "direct";
}
