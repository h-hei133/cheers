import type { Interface as ReadlineInterface } from "node:readline";

import type { ApprovalTrustPolicy } from "../../core/shell/approvalTrustPolicy.js";
import type { ShellRuntimeContext } from "../../core/shell/runtimeContext.js";
import type { ShellSessionRuntime } from "../../core/shell/sessionRuntime.js";
import {
  isResumeLikeShellAction,
  isShellAction,
} from "../../core/shell/shellActionBridge.js";
import type { StructuredLogger } from "../../observability/structuredLogger.js";
import type { StreamingRenderer } from "../../renderer/StreamingRenderer.js";
import type { SessionManager } from "../../session/SessionManager.js";
import type { ApprovalModeObject } from "../approval/approvalModeContract.js";
import {
  buildCliCommandExecution,
} from "../../entrypoints/cliCommandExecutionBridge.js";
import {
  formatAgentModeStatusLines,
  formatAgentModeUpdatedLines,
  formatViewModeStatusLines,
  formatViewModeUpdatedLine,
  formatWorkspaceInfoLines,
} from "../../entrypoints/cliDisplayProjection.js";
import {
  type CliMcpGateway,
  runCliMcpCommand,
} from "../../entrypoints/cliMcpModule.js";
import { runCliPermissionCommand } from "../../entrypoints/cliPermissionModule.js";
import { runCliSessionCommand } from "../../entrypoints/cliSessionModule.js";
import {
  runCliWorkspaceCommand,
} from "../../entrypoints/cliWorkspaceModule.js";
import { renderUserHelp } from "../../entrypoints/slashCommandRegistry.js";
import { renderProjectedLines } from "../output/projectedLineRenderer.js";
import {
  runInteractivePromptExecution,
  runInteractiveResumeAction,
} from "./interactivePromptRunner.js";

export interface InteractiveCommandRouterInput {
  readonly prompt: string;
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
  readonly modifierKeysReported?: boolean;
  readonly setActiveNonInteractiveApprovalMode: (
    mode: ApprovalModeObject | undefined,
  ) => void;
}

export interface InteractiveCommandRouterResult {
  readonly turnNumber: number;
  readonly refreshPromptChrome?: boolean;
  readonly refreshMcpGateway?: boolean;
  /** The user asked to leave; the host owns handing the terminal back. */
  readonly exitRequested?: boolean;
  /** The user asked to run the last turn again; only the host knows what it was. */
  readonly retryRequested?: boolean;
}

export async function routeInteractiveCommand(
  input: InteractiveCommandRouterInput,
): Promise<InteractiveCommandRouterResult> {
  let nextTurnNumber = input.turnNumber;

  const resolved = await buildCliCommandExecution({
    prompt: input.prompt,
    cwd: input.runtimeContext.cwd,
    renderer: input.renderer,
    printMode: false,
    interactive: true,
    sessionId: input.runtimeContext.session.id,
    modifierKeysReported: input.modifierKeysReported,
  });
  if (resolved.kind === "handled") {
    return { turnNumber: nextTurnNumber };
  }
  const slashResult = resolved.kind === "shell-action" ? resolved.slashResult : null;

  if (isResumeLikeShellAction(slashResult)) {
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
    };
  }

  if (isShellAction(slashResult, "exit-session")) {
    return { turnNumber: nextTurnNumber, exitRequested: true };
  }

  if (isShellAction(slashResult, "retry-turn")) {
    return { turnNumber: nextTurnNumber, retryRequested: true };
  }

  if (isShellAction(slashResult, "cancel-run")) {
    input.sessionRuntime.cancelCurrentRun();
    input.renderer.renderLine("\nRequested cancellation for the current run.\n");
    return { turnNumber: nextTurnNumber };
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

  if (isShellAction(slashResult, "show-workspace")) {
    let projectContextSwitched = false;
    runCliWorkspaceCommand({
      renderer: input.renderer,
      sessionManager: input.sessionManager,
      runtimeContext: input.runtimeContext,
      workspaceAction: slashResult.workspaceAction,
      workspaceTarget: slashResult.workspaceTarget,
      printMode: false,
      onProjectContextSwitched: () => {
        projectContextSwitched = true;
      },
    });
    return {
      turnNumber: nextTurnNumber,
      refreshPromptChrome: projectContextSwitched,
      refreshMcpGateway: projectContextSwitched,
    };
  }

  if (isShellAction(slashResult, "show-mcp")) {
    await runCliMcpCommand({
      renderer: input.renderer,
      gateway: input.mcpGateway,
      mcpAction: slashResult.mcpAction,
      mcpTarget: slashResult.mcpTarget,
    });
    return { turnNumber: nextTurnNumber };
  }

  if (isShellAction(slashResult, "show-help")) {
    renderUserHelp(input.renderer);
    return { turnNumber: nextTurnNumber };
  }

  if (isShellAction(slashResult, "show-view")) {
    renderProjectedLines(
      input.renderer,
      formatViewModeStatusLines({
        viewMode: input.sessionRuntime.getViewMode(),
      }),
    );
    return { turnNumber: nextTurnNumber };
  }

  if (isShellAction(slashResult, "set-view")) {
    const nextMode = slashResult.viewMode ?? "compact";
    input.sessionRuntime.setViewMode(nextMode);
    input.renderer.renderLine(formatViewModeUpdatedLine({ viewMode: nextMode }));
    return { turnNumber: nextTurnNumber };
  }

  if (isShellAction(slashResult, "show-agent-mode")) {
    renderProjectedLines(
      input.renderer,
      formatAgentModeStatusLines({
        agentMode: input.sessionRuntime.getAgentMode(),
      }),
    );
    return { turnNumber: nextTurnNumber };
  }

  if (isShellAction(slashResult, "set-agent-mode")) {
    const nextMode = slashResult.agentMode ?? "build";
    input.sessionRuntime.setAgentMode(nextMode);
    renderProjectedLines(
      input.renderer,
      formatAgentModeUpdatedLines({ agentMode: nextMode }),
    );
    return { turnNumber: nextTurnNumber, refreshPromptChrome: true };
  }

  if (isShellAction(slashResult, "manage-permissions")) {
    runCliPermissionCommand({
      renderer: input.renderer,
      trustPolicy: input.approvalTrustPolicy,
      projectRoot: input.runtimeContext.projectRoot,
      permissionAction: slashResult.permissionAction,
      permissionSelector: slashResult.permissionSelector,
    });
    return { turnNumber: nextTurnNumber };
  }

  try {
    if (resolved.kind !== "execute") {
      return { turnNumber: nextTurnNumber };
    }
    nextTurnNumber += 1;
    await runInteractivePromptExecution({
      effectivePrompt: resolved.effectivePrompt,
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

  return { turnNumber: nextTurnNumber };
}
