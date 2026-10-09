import { configurationAdmission } from "../core/shell/configuration.js";
import { refreshShellRuntimeConfig } from "../core/shell/runtimeContext.js";
import type { CoreMcpGateway } from "../core/mcp/gateway.js";
import type { PromptAttachments } from "../core/shell/sessionRuntime.js";
import { parseTransportPrompts } from '../core/shell/printPromptInput.js';
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import type { QueryRuntimeStateSeed } from "../core/query/runtime/state.js";
import { runResumeLikeShellAction } from "../core/shell/continueShellActionRuntime.js";
import { toolPoolFor } from "../cli/runtime/tools.js";
import { goalCommandFor, goalPolicyFor } from '../cli/runtime/goal.js';
import { queueCommandFor } from '../cli/runtime/inputQueue.js';
import { advisorCommandFor } from '../cli/runtime/advisor.js';
import { researchCommandFor } from '../cli/runtime/research.js';
import { gitCommandFor, worktreeCommandFor, commitCommandFor } from '../cli/runtime/git.js';
import { securityCommandFor } from '../cli/runtime/security.js';
import { agentsCommandFor } from '../cli/runtime/agents.js';
import { extensionCommandFor } from '../cli/runtime/extensions.js';
import { runPromptInputStream } from '../cli/runtime/inputStream.js';
import { planningCommandFor } from '../cli/runtime/planning.js';
import { schedulerForRuntime } from '../cli/runtime/goalScheduling.js';
import { reportWriter } from '../cli/output/reports.js';
import { runSessionManagement } from '../cli/runtime/management.js';
import type { ShellRuntimeContext } from "../core/shell/runtimeContext.js";
import { ShellSessionRuntime } from "../core/shell/sessionRuntime.js";
import {
  isResumeLikeShellAction,
  renderInteractiveOnlyShellActionBlocked,
} from "../core/shell/shellActionBridge.js";
import {
  formatExecutionStartedLine,
  formatTurnEndBoundary,
  formatTurnStartBoundary,
  renderTurnResultFallback,
  type TurnEndStatus,
} from "../core/shell/turnBoundarySurface.js";
import { recordCount } from "../observability/index.js";
import { flushMetrics } from "../observability/metrics.js";
import type { StructuredLogger } from "../observability/structuredLogger.js";
import { StreamingRenderer } from "../presentation/terminal/streaming.js";
import type { SessionContinuitySnapshot } from "../session/SessionManager.js";
import { SessionManager } from "../session/SessionManager.js";
import {
  analyzeApprovalModeConflict,
  materializeApprovalModeObject,
  type ApprovalModeObject,
} from "./cliApprovalModule.js";
import {
  buildCliCommandExecution as resolveTurnInputForExecution,
} from "./cliCommandExecutionBridge.js";
import { createCliMcpGateway, runCliMcpCommand } from "./cliMcpModule.js";
import { runCliPermissionCommand } from "./cliPermissionModule.js";
import type { ApprovalTrustPolicy } from "../core/shell/approvalTrustPolicy.js";
import { runCliSessionCommand, switchRuntimeSessionProjectContext } from "./cliSessionModule.js";
import { runCliWorkspaceCommand } from "./cliWorkspaceModule.js";
import { renderUserHelp, renderSessionCommandMap } from "./slashCommandRegistry.js";
import { describeCompaction, parseCompactCommand } from "../cli/interactive/compact.js";
import { formatViewModeStatusLines, formatViewModeUpdatedLine } from "./cliDisplayProjection.js";
import { replayTodosFromMessages } from "../core/commands/todoCommandRuntime.js";
import { runPrintSessionAction } from "../cli/print/actions.js";

export async function runNonTtyPromptStream(options: {
  sessionManager: SessionManager;
  mcpGateway?: CoreMcpGateway;
  runtimeContext: ShellRuntimeContext;
  renderer: StreamingRenderer;
  sessionRuntime: ShellSessionRuntime;
  logger: StructuredLogger;
  fallbackSessionId?: string;
  lifecycleNotices?: readonly string[];
  /** Passed through so a scripted `/permissions` writes the same trust store. */
  approvalTrustPolicy: ApprovalTrustPolicy;
  setActiveNonInteractiveApprovalMode: (
    mode: ApprovalModeObject | undefined,
  ) => void;
  nonInteractiveCliApprovalMode?: "deny" | "allow-once" | "allow-always";
}): Promise<void> {
  await runPromptInputStream({ runtimeContext: options.runtimeContext, sessionRuntime: options.sessionRuntime,
    renderer: options.renderer, logger: options.logger,
    runPrompt: prompt => runNonInteractivePrompt({ ...options, prompt, printMode: false, awaitGoalScheduling: false }),
  });
}

export async function runNonInteractivePrompt(options: {
  /** A live stdin host owns scheduler drainage while continuing to accept controls. */
  awaitGoalScheduling?: boolean;
  prompt: string;
  sessionManager: SessionManager;
  mcpGateway?: CoreMcpGateway;
  runtimeContext: ShellRuntimeContext;
  renderer: StreamingRenderer;
  sessionRuntime: ShellSessionRuntime;
  logger: StructuredLogger;
  printMode: boolean;
  /** Write the run's events as JSON lines on stdout instead of prose. */
  jsonEvents?: boolean;
  fallbackSessionId?: string;
  lifecycleNotices?: readonly string[];
  /**
   * Required by `/permissions`, whose `revoke`/`reset` forms write the trust
   * store. The interactive surface has always had this policy; the scripted
   * paths now reach the same command rather than reporting it as interactive-only.
   */
  approvalTrustPolicy: ApprovalTrustPolicy;
  setActiveNonInteractiveApprovalMode: (
    mode: ApprovalModeObject | undefined,
  ) => void;
  nonInteractiveCliApprovalMode?: "deny" | "allow-once" | "allow-always";
}): Promise<"exit" | void> {
  const trimmedPrompt = options.prompt.trim();
  if (!trimmedPrompt) {
    return;
  }

  // The same interception the interactive surface makes, for the same reason:
  // bare `/compact` (and `/compact <focus>`) condenses the live history, while
  // the handoff sub-forms (`preview`/`render`/`json`) stay in the command
  // registry because they write an artifact instead of changing the context.
  // Without this the scripted path answered the bare form with a handoff report
  // that says "Preview only: yes" and condenses nothing.
  const compaction = parseCompactCommand(trimmedPrompt);
  if (compaction) {
    const outcome = await options.sessionRuntime.compactHistory(
      options.runtimeContext.session.id,
      compaction.instructions,
    );
    for (const line of describeCompaction(outcome)) {
      options.renderer.renderLine(line);
    }
    return;
  }

  replayTodosFromMessages(options.runtimeContext.session.id, options.sessionManager.getSession(options.runtimeContext.session.id)?.turns ?? []);
  const resolved = await resolveTurnInputForExecution({
    goalCommand: goalCommandFor(options.runtimeContext, options.sessionManager),
    queueCommand: queueCommandFor(options.runtimeContext, options.sessionRuntime),
    advisorCommand: advisorCommandFor(options.runtimeContext, options.sessionManager, options.sessionRuntime, options.renderer),
    researchCommand: researchCommandFor(options.runtimeContext, options.sessionManager, options.sessionRuntime, options.renderer),
    gitCommand: gitCommandFor(options.runtimeContext),
    securityCommand: securityCommandFor(options.runtimeContext),
    agentsCommand: agentsCommandFor(options.runtimeContext),
    extensionCommand: extensionCommandFor(options.runtimeContext),
    worktreeCommand: worktreeCommandFor(options.runtimeContext),
    commitCommand: commitCommandFor(options.runtimeContext),
    planningCommand: planningCommandFor(options.runtimeContext, options.sessionManager, options.sessionRuntime),
    requestPolicy: goalPolicyFor(options.runtimeContext, options.sessionManager),
    prompt: trimmedPrompt,
    cwd: options.runtimeContext.cwd,
    projectRoot: options.runtimeContext.projectRoot,
    renderer: options.renderer,
    printMode: options.printMode,
    interactive: false,
    getToolPool: toolPoolFor(options.runtimeContext, options.mcpGateway),
    sessionId: options.runtimeContext.session.id,
    workspaceRoots: options.runtimeContext.session.workspaceRoots,
    onTurnMessage: (message) => options.sessionManager.addTurn(options.runtimeContext.session.id, message),
    onReport: reportWriter(options.sessionManager, options.runtimeContext.session.id),
    ...(options.runtimeContext.skillOptions
      ? { skillOptions: options.runtimeContext.skillOptions }
      : {}),
    ...(options.runtimeContext.themePaths
      ? { themePaths: options.runtimeContext.themePaths }
      : {}),
    // Offered on the non-interactive path too: a scripted run has the same
    // session and the same one-shot configuration read, so `/reload` must mean
    // the same thing there rather than reporting that it cannot help.
    runtimeConfig: options.runtimeContext.runtimeConfig,
    resolveConfigTarget: options.runtimeContext.resolveConfigTarget,
    readConfiguration: () => options.runtimeContext.configuration.current,
    admission: configurationAdmission(options.runtimeContext),
    refreshRuntimeConfig: () => {
      return refreshShellRuntimeConfig(options.runtimeContext);
    },
  });
  if (resolved.kind === "handled") {
    if (options.awaitGoalScheduling !== false) await schedulerForRuntime(options.sessionRuntime)?.wait();
    return;
  }
  if (resolved.kind === "shell-action") {
    const sessionAction = await runPrintSessionAction(resolved.slashResult, {
      runtimeContext: options.runtimeContext,
      sessionManager: options.sessionManager,
      sessionRuntime: options.sessionRuntime,
      renderLine: (line) => options.renderer.renderLine(line),
    });
    if (sessionAction) return sessionAction === "exit" ? "exit" : undefined;
    if (resolved.slashResult.action === "show-view") {
      for (const line of formatViewModeStatusLines({ viewMode: options.sessionRuntime.getViewMode() })) {
        options.renderer.renderLine(line);
      }
      return;
    }

    if (resolved.slashResult.action === "set-view") {
      const nextMode = resolved.slashResult.viewMode ?? "compact";
      options.sessionRuntime.setViewMode(nextMode);
      options.renderer.renderLine(formatViewModeUpdatedLine({ viewMode: nextMode }));
      return;
    }

    if (resolved.slashResult.action === "show-help") {
      renderUserHelp(options.renderer);
      return;
    }

    if (resolved.slashResult.action === "manage-permissions") {
      runCliPermissionCommand({
        renderer: options.renderer,
        trustPolicy: options.approvalTrustPolicy,
        projectRoot: options.runtimeContext.projectRoot,
        permissionAction: resolved.slashResult.permissionAction,
        permissionSelector: resolved.slashResult.permissionSelector,
      });
      return;
    }

    if (resolved.slashResult.action === "list-sessions") {
      await runCliSessionCommand({
        renderer: options.renderer,
        sessionManager: options.sessionManager,
        runtimeContext: options.runtimeContext,
        sessionAction: resolved.slashResult.sessionAction,
        sessionId: resolved.slashResult.sessionId,
        printMode: options.printMode,
        lifecycleNotices: options.lifecycleNotices,
      });
      return;
    }

    if (resolved.slashResult.action === 'manage-session') {
      await runSessionManagement(options, resolved.slashResult);
      return;
    }

    if (resolved.slashResult.action === "show-workspace") {
      runCliWorkspaceCommand({
        renderer: options.renderer,
        sessionManager: options.sessionManager,
        runtimeContext: options.runtimeContext,
        workspaceAction: resolved.slashResult.workspaceAction,
        workspaceTarget: resolved.slashResult.workspaceTarget,
        workspaceAccess: resolved.slashResult.workspaceAccess,
        busy: () => options.sessionRuntime.getCurrentRunController() !== null,
        printMode: options.printMode,
      });
      return;
    }

    if (resolved.slashResult.action === "show-mcp") {
      const gateway = options.mcpGateway ?? createCliMcpGateway(options.runtimeContext.cwd);
      try {
        await runCliMcpCommand({
          renderer: options.renderer,
          gateway,
          mcpAction: resolved.slashResult.mcpAction,
          mcpTarget: resolved.slashResult.mcpTarget,
          mcpContent: resolved.slashResult.mcpContent,
        });
      } finally {
        if (!options.mcpGateway) await gateway.close();
      }
      return;
    }

    if (resolved.slashResult.action === "fork-session") {
      // Piped sessions fork but do not switch: there is no conversation to
      // continue here, so the id is the answer and the fork is what the caller
      // resumes later.
      const sourceId = resolved.slashResult.sessionId ?? options.runtimeContext.session.id;
      try {
        const forked = options.sessionManager.fork(sourceId, options.runtimeContext.projectRoot);
        options.renderer.renderLine(`Forked ${sourceId} into ${forked.id}. Resume it with: cheers --resume ${forked.id}`);
      } catch (error) {
        options.renderer.renderLine(`Fork failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      return;
    }

    if (isResumeLikeShellAction(resolved.slashResult)) {
      await runResumeLikeShellAction({
        slashResult: resolved.slashResult,
        source: "non-interactive",
        printMode: options.printMode,
        fallbackSessionId: options.fallbackSessionId,
        sessionManager: options.sessionManager,
        runtimeContext: options.runtimeContext,
        renderer: options.renderer,
        switchRuntimeSessionProjectContext,
        renderSessionCommandMap,
        executeResolvedPromptTurn: (turnInput) => {
          return executeResolvedPromptTurn({
            source: "non-interactive",
            effectivePrompt: turnInput.effectivePrompt,
            runtimeSeed: turnInput.runtimeSeed,
            continuityState: turnInput.continuityState,
            sessionManager: options.sessionManager,
            setActiveNonInteractiveApprovalMode:
              options.setActiveNonInteractiveApprovalMode,
            nonInteractiveCliApprovalMode: options.nonInteractiveCliApprovalMode,
            runtimeContext: options.runtimeContext,
            sessionRuntime: options.sessionRuntime,
            logger: options.logger,
            printMode: options.printMode,
            jsonEvents: options.jsonEvents,
            turnNumber: turnInput.turnNumber,
            renderer: options.renderer,
            turnOrigin: turnInput.turnOrigin,
          });
        },
      });
      return;
    }
    renderInteractiveOnlyShellActionBlocked(options.renderer, {
      printMode: options.printMode,
    });
    return;
  }
  await executeResolvedPromptTurn({
    source: "non-interactive",
    effectivePrompt: resolved.effectivePrompt,
    ...(resolved.promptMetadata ? { promptMetadata: resolved.promptMetadata } : {}),
    sessionManager: options.sessionManager,
    setActiveNonInteractiveApprovalMode:
      options.setActiveNonInteractiveApprovalMode,
    nonInteractiveCliApprovalMode: options.nonInteractiveCliApprovalMode,
    runtimeContext: options.runtimeContext,
    sessionRuntime: options.sessionRuntime,
    logger: options.logger,
    printMode: options.printMode,
    jsonEvents: options.jsonEvents,
    renderer: options.renderer,
  });
}

export async function executeResolvedPromptTurn(options: {
  promptMetadata?: Record<string, unknown>;
  source: "interactive" | "non-interactive";
  effectivePrompt: string;
  /** Images that travelled with the prompt; see `PromptAttachments`. */
  attachments?: PromptAttachments;
  runtimeSeed?: QueryRuntimeStateSeed;
  continuityState?: SessionContinuitySnapshot;
  sessionManager: SessionManager;
  setActiveNonInteractiveApprovalMode: (
    mode: ApprovalModeObject | undefined,
  ) => void;
  nonInteractiveCliApprovalMode?: "deny" | "allow-once" | "allow-always";
  runtimeContext: ShellRuntimeContext;
  sessionRuntime: ShellSessionRuntime;
  logger: StructuredLogger;
  printMode: boolean;
  /** Write the run's events as JSON lines on stdout instead of prose. */
  jsonEvents?: boolean;
  turnNumber?: number;
  renderer: StreamingRenderer;
  turnOrigin?: "normal" | "resumed" | "continued";
}): Promise<void> {
  const turnOrigin = options.turnOrigin ?? "normal";
  const interactiveTurn = options.source === "interactive" && !options.printMode;
  const turnLabel = options.turnNumber ?? 0;
  let turnEndStatus: TurnEndStatus = "completed";
  if (interactiveTurn) {
    options.logger.info("CLI interactive turn boundary", {
      sessionId: options.runtimeContext.session.id,
      turn: turnLabel,
      turnOrigin,
    });
    // A host that captures output draws its own turn boundaries; emitting these
    // as prose too would put duplicate chrome inside its transcript.
    if (!options.renderer.captured) {
      options.renderer.renderLine(
        formatTurnStartBoundary({
          turnNumber: turnLabel,
          origin: turnOrigin,
        }),
      );
    }
  }
  options.logger.info(
    options.source === "interactive"
      ? "CLI prompt received"
      : "CLI prompt received (non-interactive)",
    {
      sessionId: options.runtimeContext.session.id,
      promptLength: options.effectivePrompt.length,
    },
  );

  try {
    const continuitySnapshot =
      options.continuityState ??
      options.sessionManager.buildPromptContinuitySnapshot(
        options.runtimeContext.session.id,
        options.effectivePrompt,
      );
    const approvalModeObject = materializeApprovalModeObject({
      prompt: options.effectivePrompt,
      continuity: continuitySnapshot,
    });
    const approvalModeConflict =
      analyzeApprovalModeConflict(approvalModeObject);
    if (
      approvalModeConflict.ambiguousStop &&
      (options.source === "interactive" ||
        !options.nonInteractiveCliApprovalMode)
    ) {
      turnEndStatus = "blocked";
      renderTurnResultFallback(options.renderer, {
        outcome: "blocked",
        detail: approvalModeConflict.stopReason ?? "Approval mode is ambiguous.",
        doNext:
          "Re-run with an explicit verify continuation lineage or set --non-interactive-approval for this run.",
      });
      return;
    }
    if (!options.printMode && !options.renderer.captured) {
      options.renderer.renderLine(formatExecutionStartedLine(turnOrigin));
    }
    recordCount("cli.prompts", 1, {
      sessionId: options.runtimeContext.session.id,
    });
    options.setActiveNonInteractiveApprovalMode(approvalModeObject);
    // The CLI owns one event writer across commands and turns. Suppress the
    // duplicate prose projection during the model turn, then restore its sink
    // so later command output still belongs to the same JSON stream.
    const restoreOutput = options.jsonEvents
      ? options.renderer.setSink({ line: () => {}, chunk: () => {} })
      : undefined;
    try {
      await options.sessionRuntime.executePrompt(
        options.runtimeContext.session.id,
        options.effectivePrompt,
        {
          outputMode: options.printMode ? "print" : "interactive",
          runtimeSeed: options.runtimeSeed,
          continuityState: continuitySnapshot,
          ...(options.attachments ? { attachments: options.attachments } : {}),
          ...(options.promptMetadata ? { promptMetadata: options.promptMetadata } : {}),
        },
      );
    } finally {
      restoreOutput?.();
      // The prompt counter is recorded before the turn runs, so a run that never
      // reached a turn — a readiness failure, an aborted start — would leave it
      // buffered forever. Flushed here so the counter survives the failure that
      // makes it interesting.
      flushMetrics();
    }
  } catch (error) {
    const shellState = options.sessionRuntime.getState();
    if (interactiveTurn && shellState === "interrupted") {
      turnEndStatus = "interrupted";
      // A surface that captures output announces the interruption in its own
      // transcript; only a plain terminal needs the fallback block.
      if (!options.renderer.captured) {
        renderTurnResultFallback(options.renderer, {
          outcome: "interrupted",
          detail: "Current request was cancelled before completion.",
          doNext:
            "Use /resume to continue the interrupted session, or enter a new prompt.",
        });
      }
      return;
    }
    turnEndStatus = "error";
    if (interactiveTurn) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      renderTurnResultFallback(options.renderer, {
        outcome: "error",
        detail: errorMessage,
        doNext: "Review the error, adjust the prompt or environment, and retry.",
      });
      options.logger.error("CLI run failed", {
        sessionId: options.runtimeContext.session.id,
        error: errorMessage,
        shellState,
      });
      return;
    }
    throw error;
  } finally {
    options.setActiveNonInteractiveApprovalMode(undefined);
    options.logger.info(
      options.source === "interactive"
        ? "CLI run completed"
        : "CLI run completed (non-interactive)",
      {
        sessionId: options.runtimeContext.session.id,
        shellState: options.sessionRuntime.getState(),
        turnEndStatus,
      },
    );
    if (interactiveTurn && !options.renderer.captured) {
      options.renderer.renderLine(
        formatTurnEndBoundary({
          turnNumber: turnLabel,
          origin: turnOrigin,
          status: turnEndStatus,
        }),
      );
    }
  }
}

export async function runReplayPromptScript(options: {
  replayFile: string;
  sessionManager: SessionManager;
  mcpGateway?: CoreMcpGateway;
  runtimeContext: ShellRuntimeContext;
  renderer: StreamingRenderer;
  sessionRuntime: ShellSessionRuntime;
  logger: StructuredLogger;
  printMode: boolean;
  jsonEvents?: boolean;
  fallbackSessionId?: string;
  lifecycleNotices?: readonly string[];
  /** Passed through so a scripted `/permissions` writes the same trust store. */
  approvalTrustPolicy: ApprovalTrustPolicy;
  setActiveNonInteractiveApprovalMode: (
    mode: ApprovalModeObject | undefined,
  ) => void;
  nonInteractiveCliApprovalMode?: "deny" | "allow-once" | "allow-always";
}): Promise<void> {
  const resolvedReplayPath = path.resolve(process.cwd(), options.replayFile);
  if (!fs.existsSync(resolvedReplayPath)) {
    throw new Error(`Replay file not found: ${resolvedReplayPath}`);
  }
  const prompts = parseTransportPrompts(
    fs.readFileSync(resolvedReplayPath, "utf8"),
    { allowComments: true },
  );

  if (prompts.length === 0) {
    options.renderer.renderLine(
      `Replay file ${resolvedReplayPath} contains no executable prompts.`,
    );
    return;
  }

  options.renderer.renderLine(
    `Replay mode: running ${prompts.length} prompt(s) in live query loop against session ${options.runtimeContext.session.id}.`,
  );
  for (const prompt of prompts) {
    const outcome = await runNonInteractivePrompt({
      prompt,
      sessionManager: options.sessionManager,
      mcpGateway: options.mcpGateway,
      runtimeContext: options.runtimeContext,
      renderer: options.renderer,
      sessionRuntime: options.sessionRuntime,
      logger: options.logger,
      printMode: options.printMode,
      jsonEvents: options.jsonEvents,
      fallbackSessionId: options.fallbackSessionId,
      lifecycleNotices: options.lifecycleNotices,
      approvalTrustPolicy: options.approvalTrustPolicy,
      setActiveNonInteractiveApprovalMode:
        options.setActiveNonInteractiveApprovalMode,
      nonInteractiveCliApprovalMode: options.nonInteractiveCliApprovalMode,
    });
    if (outcome === "exit") break;
  }
}
