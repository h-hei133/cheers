import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import * as readline from "node:readline";
import type { QueryRuntimeStateSeed } from "../core/query/runtime/state.js";
import { runResumeLikeShellAction } from "../core/shell/continueShellActionRuntime.js";
import {
  isFenceLine,
  opensMultilineLiteralPrompt,
  parseTransportPrompts,
  updateFenceState,
} from "../core/shell/printPromptInput.js";
import type { ProviderCredentialResolution } from "../core/shell/providerCredentials.js";
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
import type { StructuredLogger } from "../observability/structuredLogger.js";
import { StreamingRenderer } from "../renderer/StreamingRenderer.js";
import type { EscalationPrompt, EscalationResponse } from "../sandbox/index.js";
import type { SessionContinuitySnapshot } from "../session/SessionManager.js";
import { SessionManager } from "../session/SessionManager.js";
import {
  analyzeApprovalModeConflict,
  applyPatchDecisionFromApprovalMode,
  materializeApprovalModeObject,
  type ApprovalModeObject,
} from "./cliApprovalModule.js";
import {
  buildCliCommandExecution as resolveTurnInputForExecution,
} from "./cliCommandExecutionBridge.js";
import { formatCliContextTag } from "./cliInteractiveLoopState.js";
import { createCliMcpGateway, runCliMcpCommand } from "./cliMcpModule.js";
import {
  runCliRuntimeInvocation,
  type CliApplyPatchRuntimeRouteOptions,
} from "./cliRuntimeInvocation.js";
import type { PlanningRuntimeProductExecutionOptions } from "../orchestration/planningRuntimeProductExecution.js";
import { runCliSessionCommand, switchRuntimeSessionProjectContext } from "./cliSessionModule.js";
import { runCliWorkspaceCommand } from "./cliWorkspaceModule.js";
import { renderUserHelp, renderSessionCommandMap } from "./slashCommandRegistry.js";

export async function* streamOrchestratedResponse(
  prompt: string,
  sessionId: string,
  workspaceRoot: string,
  signal: AbortSignal,
  maxTurns: number,
  escalationPromptHandler: (
    prompt: EscalationPrompt,
  ) => Promise<EscalationResponse>,
  providerCredentialResolution: ProviderCredentialResolution,
  agentMode: "plan" | "build",
  runtimeSeed?: QueryRuntimeStateSeed,
  continuityState?: SessionContinuitySnapshot,
  applyPatchRuntimeRoute?: CliApplyPatchRuntimeRouteOptions,
  planningMutationExecution?: PlanningRuntimeProductExecutionOptions,
) {
  const invocation = runCliRuntimeInvocation({
    sessionId,
    prompt,
    workspaceRoot,
    signal,
    maxTurns,
    escalationPromptHandler,
    providerCredentialResolution,
    agentMode,
    runtimeSeed,
    continuityState,
    applyPatchRuntimeRoute,
    planningMutationExecution,
    providerModeEnv: process.env.PRIVATE_AGENTS_PROVIDER_MODE,
  });
  for await (const event of invocation.events) {
    yield event;
  }
}

export async function runNonTtyPromptStream(options: {
  sessionManager: SessionManager;
  runtimeContext: ShellRuntimeContext;
  renderer: StreamingRenderer;
  sessionRuntime: ShellSessionRuntime;
  logger: StructuredLogger;
  fallbackSessionId?: string;
  lifecycleNotices?: readonly string[];
  setActiveNonInteractiveApprovalMode: (
    mode: ApprovalModeObject | undefined,
  ) => void;
  nonInteractiveCliApprovalMode?: "deny" | "allow-once" | "allow-always";
}): Promise<void> {
  const contextTag = (): string =>
    formatCliContextTag({
      projectRoot: options.runtimeContext.projectRoot,
      sessionId: options.runtimeContext.session.id,
    });
  options.renderer.renderLine(
    `Non-TTY stdin mode ${contextTag()}: waiting for newline-delimited prompts.`,
  );
  options.renderer.renderLine(
    "Send one prompt per line, or paste fenced/multiline content. Close stdin to finish.\n",
  );
  options.logger.info("CLI non-TTY stdin stream mode started", {
    sessionId: options.runtimeContext.session.id,
  });

  const stdinReader = readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
    terminal: false,
  });

  let processedCount = 0;
  let turnChain = Promise.resolve();
  let pendingPrompt: {
    lines: string[];
    inFence: boolean;
    multilineLiteral: boolean;
  } | null = null;

  const enqueuePrompt = (prompt: string) => {
    turnChain = turnChain
      .then(async () => {
        processedCount += 1;
        options.renderer.renderLine(`${contextTag()} > ${prompt}`);
        await runNonInteractivePrompt({
          prompt,
          sessionManager: options.sessionManager,
          runtimeContext: options.runtimeContext,
          renderer: options.renderer,
          sessionRuntime: options.sessionRuntime,
          logger: options.logger,
          printMode: false,
          fallbackSessionId: options.fallbackSessionId,
          lifecycleNotices: options.lifecycleNotices,
          setActiveNonInteractiveApprovalMode:
            options.setActiveNonInteractiveApprovalMode,
          nonInteractiveCliApprovalMode: options.nonInteractiveCliApprovalMode,
        });
      })
      .catch((error) => {
        options.renderer.renderLine(
          `Run failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
  };

  const flushPendingPrompt = () => {
    if (!pendingPrompt) {
      return;
    }
    const prompt = pendingPrompt.lines.join("\n").trim();
    pendingPrompt = null;
    if (prompt.length > 0) {
      enqueuePrompt(prompt);
    }
  };

  stdinReader.on("line", (line) => {
    const normalizedLine = line.replace(/^\uFEFF/, "");
    if (pendingPrompt) {
      if (
        pendingPrompt.multilineLiteral &&
        !pendingPrompt.inFence &&
        normalizedLine.trim().length === 0
      ) {
        flushPendingPrompt();
        return;
      }
      pendingPrompt.lines.push(normalizedLine);
      pendingPrompt.inFence = updateFenceState(
        pendingPrompt.inFence,
        normalizedLine,
      );
      if (!pendingPrompt.inFence && pendingPrompt.lines.some(isFenceLine)) {
        flushPendingPrompt();
      }
      return;
    }

    if (normalizedLine.trim().length === 0) {
      return;
    }

    const startsFence = isFenceLine(normalizedLine);
    if (startsFence || opensMultilineLiteralPrompt(normalizedLine)) {
      pendingPrompt = {
        lines: [normalizedLine],
        inFence: updateFenceState(false, normalizedLine),
        multilineLiteral: opensMultilineLiteralPrompt(normalizedLine),
      };
      if (!pendingPrompt.inFence && startsFence) {
        flushPendingPrompt();
      }
      return;
    }

    for (const prompt of parseTransportPrompts(normalizedLine, {
      allowComments: false,
    })) {
      enqueuePrompt(prompt);
    }
  });

  await new Promise<void>((resolve) => {
    stdinReader.once("close", () => resolve());
  });
  flushPendingPrompt();
  await turnChain;
  options.renderer.renderLine(
    `\nStdin stream closed. Processed ${processedCount} prompt(s).\n`,
  );
  options.logger.info("CLI non-TTY stdin stream mode closed", {
    sessionId: options.runtimeContext.session.id,
    processedCount,
  });
}

export async function runNonInteractivePrompt(options: {
  prompt: string;
  sessionManager: SessionManager;
  runtimeContext: ShellRuntimeContext;
  renderer: StreamingRenderer;
  sessionRuntime: ShellSessionRuntime;
  logger: StructuredLogger;
  printMode: boolean;
  fallbackSessionId?: string;
  lifecycleNotices?: readonly string[];
  setActiveNonInteractiveApprovalMode: (
    mode: ApprovalModeObject | undefined,
  ) => void;
  nonInteractiveCliApprovalMode?: "deny" | "allow-once" | "allow-always";
}): Promise<void> {
  const trimmedPrompt = options.prompt.trim();
  if (!trimmedPrompt) {
    return;
  }
  const resolved = await resolveTurnInputForExecution({
    prompt: trimmedPrompt,
    cwd: options.runtimeContext.cwd,
    renderer: options.renderer,
    printMode: options.printMode,
    interactive: false,
    sessionId: options.runtimeContext.session.id,
  });
  if (resolved.kind === "handled") {
    return;
  }
  if (resolved.kind === "shell-action") {
    if (resolved.slashResult.action === "show-help") {
      renderUserHelp(options.renderer);
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

    if (resolved.slashResult.action === "show-workspace") {
      runCliWorkspaceCommand({
        renderer: options.renderer,
        sessionManager: options.sessionManager,
        runtimeContext: options.runtimeContext,
        workspaceAction: resolved.slashResult.workspaceAction,
        workspaceTarget: resolved.slashResult.workspaceTarget,
        printMode: options.printMode,
      });
      return;
    }

    if (resolved.slashResult.action === "show-mcp") {
      await runCliMcpCommand({
        renderer: options.renderer,
        gateway: createCliMcpGateway(options.runtimeContext.cwd),
        mcpAction: resolved.slashResult.mcpAction,
        mcpTarget: resolved.slashResult.mcpTarget,
      });
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
    sessionManager: options.sessionManager,
    setActiveNonInteractiveApprovalMode:
      options.setActiveNonInteractiveApprovalMode,
    nonInteractiveCliApprovalMode: options.nonInteractiveCliApprovalMode,
    runtimeContext: options.runtimeContext,
    sessionRuntime: options.sessionRuntime,
    logger: options.logger,
    printMode: options.printMode,
    renderer: options.renderer,
  });
}

export async function executeResolvedPromptTurn(options: {
  source: "interactive" | "non-interactive";
  effectivePrompt: string;
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
    await options.sessionRuntime.executePrompt(
      options.runtimeContext.session.id,
      options.effectivePrompt,
      {
        outputMode: options.printMode ? "print" : "interactive",
        runtimeSeed: options.runtimeSeed,
        continuityState: continuitySnapshot,
      },
    );
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
  runtimeContext: ShellRuntimeContext;
  renderer: StreamingRenderer;
  sessionRuntime: ShellSessionRuntime;
  logger: StructuredLogger;
  printMode: boolean;
  fallbackSessionId?: string;
  lifecycleNotices?: readonly string[];
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
    await runNonInteractivePrompt({
      prompt,
      sessionManager: options.sessionManager,
      runtimeContext: options.runtimeContext,
      renderer: options.renderer,
      sessionRuntime: options.sessionRuntime,
      logger: options.logger,
      printMode: options.printMode,
      fallbackSessionId: options.fallbackSessionId,
      lifecycleNotices: options.lifecycleNotices,
      setActiveNonInteractiveApprovalMode:
        options.setActiveNonInteractiveApprovalMode,
      nonInteractiveCliApprovalMode: options.nonInteractiveCliApprovalMode,
    });
  }
}
