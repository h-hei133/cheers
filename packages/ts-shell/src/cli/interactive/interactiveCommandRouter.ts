import { configurationAdmission } from "../../core/shell/configuration.js";
import { refreshShellRuntimeConfig } from "../../core/shell/runtimeContext.js";
import type { KeyBinding } from "../../presentation/tui/chrome/keys.js";
import type { PromptAttachments } from "../../core/shell/sessionRuntime.js";
import type { Interface as ReadlineInterface } from "node:readline";

import { toolPoolFor } from "../runtime/tools.js";
import { goalCommandFor } from '../runtime/goal.js';
import { navigateSession, type SessionNavigationResult } from "../runtime/navigation.js";
import type { ApprovalTrustPolicy } from "../../core/shell/approvalTrustPolicy.js";
import type { ShellRuntimeContext } from "../../core/shell/runtimeContext.js";
import type { ShellSessionRuntime } from "../../core/shell/sessionRuntime.js";
import {
  isResumeLikeShellAction,
  isShellAction,
} from "../../core/shell/shellActionBridge.js";
import type { StructuredLogger } from "../../observability/structuredLogger.js";
import type { StreamingRenderer } from "../../presentation/terminal/streaming.js";
import type { SessionManager } from "../../session/SessionManager.js";
import type { ApprovalModeObject } from "../approval/approvalModeContract.js";
import {
  buildCliCommandExecution,
} from "../../entrypoints/cliCommandExecutionBridge.js";
import {
  formatViewModeStatusLines,
  formatViewModeUpdatedLine,
} from "../../entrypoints/cliDisplayProjection.js";
import {
  type CliMcpGateway,
  runCliMcpCommand,
} from "../../entrypoints/cliMcpModule.js";
import { runCliPermissionCommand } from "../../entrypoints/cliPermissionModule.js";
import { runCliSessionCommand, switchRuntimeSessionProjectContext } from "../../entrypoints/cliSessionModule.js";
import {
  runCliWorkspaceCommand,
} from "../../entrypoints/cliWorkspaceModule.js";
import { renderUserHelp } from "../../entrypoints/slashCommandRegistry.js";
import { renderProjectedLines } from "../output/projectedLineRenderer.js";
import {
  runInteractivePromptExecution,
  runInteractiveResumeAction,
} from "./interactivePromptRunner.js";
import { describeCompaction, parseCompactCommand } from "./compact.js";
import { defaultTheme } from "../../presentation/theme/theme.js";
import { reportWriter } from '../output/reports.js';
import type { ShellActionResult } from '../../core/commands/types.js';

export interface InteractiveCommandRouterInput {
  readonly prompt: string;
  /** Images the draft referred to; carried beside the text, not inside it. */
  readonly attachments?: PromptAttachments;
  readonly readline: ReadlineInterface;
  readonly mcpGateway: CliMcpGateway;
  readonly fallbackSessionId?: string;
  readonly sessionManager: SessionManager;
  readonly runtimeContext: ShellRuntimeContext;
  readonly renderer: StreamingRenderer;
  readonly sessionRuntime: ShellSessionRuntime;
  readonly logger: StructuredLogger;
  readonly approvalTrustPolicy: ApprovalTrustPolicy;
  readonly turnNumber: number;
  /** True when the terminal agreed to report modified keys. */
  readonly keyGuide?: readonly KeyBinding[];
  readonly modifierKeysReported?: boolean;
  readonly setActiveNonInteractiveApprovalMode: (
    mode: ApprovalModeObject | undefined,
  ) => void;
  /**
   * Re-read the user's keybindings.
   *
   * Read at startup like the rest of the configuration, so `/reload` has to
   * re-read them too — otherwise editing the file mid-session does nothing and
   * says nothing, which is exactly the silence `/reload` exists to remove.
   */
  readonly refreshKeybindings?: () => void;
}

export interface InteractiveCommandRouterResult {
  readonly sessionManagement?: ShellActionResult;
  readonly turnNumber: number;
  readonly navigation?: SessionNavigationResult;
  readonly refreshPromptChrome?: boolean;
  readonly refreshMcpGateway?: boolean;
  /** The user asked to leave; the host owns handing the terminal back. */
  readonly exitRequested?: boolean;
  /** The user asked to run the last turn again; only the host knows what it was. */
  readonly retryRequested?: boolean;
  /** Start over: a new session, an empty transcript, a screen with nothing on it. */
  readonly clearRequested?: boolean;
  /** A different session is now current; its conversation should be put back on screen. */
  readonly sessionOpened?: boolean;
  /**
   * The theme in effect is not the one that was in effect before the command.
   *
   * The host follows the theme file so an edit to it shows up without a restart,
   * and it has to know which file that is now.
   */
  readonly themeChanged?: boolean;
}

export async function routeInteractiveCommand(
  input: InteractiveCommandRouterInput,
): Promise<InteractiveCommandRouterResult> {
  let nextTurnNumber = input.turnNumber;

  // Compaction changes the live context, which only the session runtime can do;
  // the registry's handoff forms keep their artifact-writing behaviour.
  const compaction = parseCompactCommand(input.prompt);
  if (compaction) {
    const outcome = await input.sessionRuntime.compactHistory(
      input.runtimeContext.session.id,
      compaction.instructions,
    );
    for (const line of describeCompaction(outcome)) input.renderer.renderLine(line);
    return { turnNumber: nextTurnNumber, refreshPromptChrome: true };
  }

  // Which theme is in effect before the command runs. `/theme` and `/reload`
  // both change it, and neither is a special case worth naming here: comparing
  // the name either side covers both, and covers any future command that does.
  const themeBefore = defaultTheme.colorRevision;

  const resolved = await buildCliCommandExecution({
    goalCommand: goalCommandFor(input.runtimeContext, input.sessionManager),
    prompt: input.prompt,
    ...(input.attachments ? { attachments: input.attachments } : {}),
    cwd: input.runtimeContext.cwd,
    projectRoot: input.runtimeContext.projectRoot,
    renderer: input.renderer,
    printMode: false,
    interactive: true,
    sessionId: input.runtimeContext.session.id,
    workspaceRoots: input.runtimeContext.session.workspaceRoots,
    onTurnMessage: (message) => input.sessionManager.addTurn(input.runtimeContext.session.id, message),
    onReport: reportWriter(input.sessionManager, input.runtimeContext.session.id),
    ...(input.runtimeContext.skillOptions ? { skillOptions: input.runtimeContext.skillOptions } : {}),
    ...(input.runtimeContext.themePaths ? { themePaths: input.runtimeContext.themePaths } : {}),
    modifierKeysReported: input.modifierKeysReported,
    keyGuide: input.keyGuide,
    getToolPool: toolPoolFor(input.runtimeContext, input.mcpGateway),
    // The settings live on the context this session carries, so replacing them in
    // place is what makes `/reload` take effect for the rest of the session rather
    // than only for the turn that ran it.
    runtimeConfig: input.runtimeContext.runtimeConfig,
    resolveConfigTarget: input.runtimeContext.resolveConfigTarget,
    readConfiguration: () => input.runtimeContext.configuration.current,
    admission: configurationAdmission(input.runtimeContext),
    refreshRuntimeConfig: () => {
      const result = refreshShellRuntimeConfig(input.runtimeContext);
      if (result.status === "applied") {
        try { input.refreshKeybindings?.(); }
        catch { return { ...result, status: 'application-unverified' as const,
          diagnostics: [...result.diagnostics, 'Configuration was accepted; keybinding application outcome is unverified.'] }; }
      }
      return result;
    },
  });
  const themeChanged = defaultTheme.colorRevision !== themeBefore;
  if (resolved.kind === "handled") {
    return { turnNumber: nextTurnNumber, ...(themeChanged ? { themeChanged: true } : {}) };
  }
  const slashResult = resolved.kind === "shell-action" ? resolved.slashResult : null;

  if (isResumeLikeShellAction(slashResult)) {
    const before = input.runtimeContext.session.id;
    const resumeResult = await runInteractiveResumeAction({
      slashResult,
      fallbackSessionId: input.fallbackSessionId,
      sessionManager: input.sessionManager,
      runtimeContext: input.runtimeContext,
      renderer: input.renderer,
      turnNumber: nextTurnNumber,
      sessionRuntime: input.sessionRuntime,
      logger: input.logger,
      setActiveNonInteractiveApprovalMode:
        input.setActiveNonInteractiveApprovalMode,
    });
    return {
      turnNumber: resumeResult.turnNumber,
      refreshPromptChrome: true,
      refreshMcpGateway: true,
      ...(themeChanged ? { themeChanged: true } : {}),
      // The runtime context is switched in place, so a changed id is the signal
      // that a different session's conversation now belongs on screen.
      sessionOpened: input.runtimeContext.session.id !== before,
    };
  }

  if (isShellAction(slashResult, "exit-session")) {
    return { turnNumber: nextTurnNumber, exitRequested: true };
  }

  if (isShellAction(slashResult, "navigate-session")) {
    const navigation = await navigateSession(input, slashResult.entryId);
    if (!navigation.changed) input.renderer.renderLine(navigation.output);
    return { turnNumber: nextTurnNumber, navigation };
  }

  if (isShellAction(slashResult, "clear-session")) {
    return { turnNumber: nextTurnNumber, clearRequested: true };
  }

  if (isShellAction(slashResult, 'manage-session')) {
    return { turnNumber: nextTurnNumber, sessionManagement: slashResult };
  }

  if (isShellAction(slashResult, "retry-turn")) {
    return { turnNumber: nextTurnNumber, retryRequested: true };
  }

  if (isShellAction(slashResult, "cancel-run")) {
    input.sessionRuntime.cancelCurrentRun();
    input.renderer.renderLine("\nRequested cancellation for the current run.\n");
    return { turnNumber: nextTurnNumber, ...(themeChanged ? { themeChanged: true } : {}) };
  }

  if (isShellAction(slashResult, "list-sessions")) {
    let sessionSwitched = false;
    await runCliSessionCommand({
      renderer: input.renderer,
      sessionManager: input.sessionManager,
      runtimeContext: input.runtimeContext,
      sessionAction: slashResult.sessionAction,
      sessionId: slashResult.sessionId,
      printMode: false,
      readline: input.readline,
      onSessionSwitched: () => {
        sessionSwitched = true;
      },
    });
    return {
      turnNumber: nextTurnNumber,
      refreshPromptChrome: sessionSwitched,
      refreshMcpGateway: sessionSwitched,
    };
  }

  if (isShellAction(slashResult, "fork-session")) {
    // The source is "here" when no id came, which is the session the runtime
    // context holds. Forked, then switched to: the fork exists to be
    // continued in a second direction, and leaving the user on the source
    // would have them type into the wrong conversation.
    const sourceId = slashResult.sessionId ?? input.runtimeContext.session.id;
    try {
      const forked = input.sessionManager.fork(
        sourceId,
        input.runtimeContext.projectRoot,
      );
      switchRuntimeSessionProjectContext(input.runtimeContext, forked);
      renderProjectedLines(input.renderer, [
        `Forked ${sourceId} into ${forked.id}: same conversation, new direction. The source is untouched.`,
        "",
      ]);
      return {
        turnNumber: nextTurnNumber,
        refreshPromptChrome: true,
        refreshMcpGateway: true,
        sessionOpened: true,
        ...(themeChanged ? { themeChanged: true } : {}),
      };
    } catch (error) {
      input.renderer.renderLine(
        `\nFork failed: ${error instanceof Error ? error.message : String(error)}\n`,
      );
      return { turnNumber: nextTurnNumber, ...(themeChanged ? { themeChanged: true } : {}) };
    }
  }
  if (isShellAction(slashResult, "show-workspace")) {
    let projectContextSwitched = false;
    runCliWorkspaceCommand({
      renderer: input.renderer,
      sessionManager: input.sessionManager,
      runtimeContext: input.runtimeContext,
      workspaceAction: slashResult.workspaceAction,
      workspaceTarget: slashResult.workspaceTarget,
      workspaceAccess: slashResult.workspaceAccess,
      busy: () => input.sessionRuntime.getCurrentRunController() !== null,
      printMode: false,
      onProjectContextSwitched: () => {
        projectContextSwitched = true;
      },
    });
    return {
      turnNumber: nextTurnNumber,
      refreshPromptChrome: projectContextSwitched,
      refreshMcpGateway: projectContextSwitched,
      ...(projectContextSwitched ? { themeChanged: true } : {}),
    };
  }

  if (isShellAction(slashResult, "show-mcp")) {
    await runCliMcpCommand({
      renderer: input.renderer,
      gateway: input.mcpGateway,
      mcpAction: slashResult.mcpAction,
      mcpTarget: slashResult.mcpTarget,
    });
    return { turnNumber: nextTurnNumber, ...(themeChanged ? { themeChanged: true } : {}) };
  }

  if (isShellAction(slashResult, "show-help")) {
    renderUserHelp(input.renderer);
    return { turnNumber: nextTurnNumber, ...(themeChanged ? { themeChanged: true } : {}) };
  }

  if (isShellAction(slashResult, "show-view")) {
    renderProjectedLines(
      input.renderer,
      formatViewModeStatusLines({
        viewMode: input.sessionRuntime.getViewMode(),
      }),
    );
    return { turnNumber: nextTurnNumber, ...(themeChanged ? { themeChanged: true } : {}) };
  }

  if (isShellAction(slashResult, "set-view")) {
    const nextMode = slashResult.viewMode ?? "compact";
    input.sessionRuntime.setViewMode(nextMode);
    input.renderer.renderLine(formatViewModeUpdatedLine({ viewMode: nextMode }));
    return { turnNumber: nextTurnNumber, ...(themeChanged ? { themeChanged: true } : {}) };
  }

  if (isShellAction(slashResult, "manage-permissions")) {
    runCliPermissionCommand({
      renderer: input.renderer,
      trustPolicy: input.approvalTrustPolicy,
      projectRoot: input.runtimeContext.projectRoot,
      permissionAction: slashResult.permissionAction,
      permissionSelector: slashResult.permissionSelector,
    });
    return { turnNumber: nextTurnNumber, ...(themeChanged ? { themeChanged: true } : {}) };
  }

  try {
    if (resolved.kind !== "execute") {
      return { turnNumber: nextTurnNumber, ...(themeChanged ? { themeChanged: true } : {}) };
    }
    nextTurnNumber += 1;
    await runInteractivePromptExecution({
      effectivePrompt: resolved.effectivePrompt,
      ...(resolved.attachments ? { attachments: resolved.attachments } : {}),
      sessionManager: input.sessionManager,
      runtimeContext: input.runtimeContext,
      sessionRuntime: input.sessionRuntime,
      logger: input.logger,
      renderer: input.renderer,
      turnNumber: nextTurnNumber,
      setActiveNonInteractiveApprovalMode:
        input.setActiveNonInteractiveApprovalMode,
    });
  } catch (error) {
    if (input.sessionRuntime.getState() !== "interrupted") {
      input.renderer.renderLine(
        `\nError: ${error instanceof Error ? error.message : String(error)}`,
      );
      input.logger.error("CLI run failed", {
        sessionId: input.runtimeContext.session.id,
        error: error instanceof Error ? error.message : String(error),
        shellState: input.sessionRuntime.getState(),
      });
    }
  }

  return { turnNumber: nextTurnNumber, ...(themeChanged ? { themeChanged: true } : {}) };
}
