#!/usr/bin/env node
import process from "node:process";
import * as readline from "node:readline";
import { getRuntimeConfig } from "../config/runtimeConfig.js";
import {
  CoreMcpGateway,
  McpGatewayBlockedError,
} from "../core/mcp/gateway.js";
import { ApprovalTrustPolicy } from "../core/shell/approvalTrustPolicy.js";
import {
  bootstrapShellRuntime,
  SessionBootstrapError,
} from "../core/shell/bootstrap.js";
import {
  runResumeLikeShellAction,
} from "../core/shell/continueShellActionRuntime.js";
import {
  renderRootBindingDiagnostics,
  renderStartupSurface,
} from "../core/shell/startupSurfaceRenderer.js";
import {
  resolveProviderCredential,
  type ProviderCredentialResolution,
} from "../core/shell/providerCredentials.js";
import {
  buildNonInteractivePrompts,
  resolveStdinTransportMode,
} from "../core/shell/printPromptInput.js";
import { ShellSessionRuntime } from "../core/shell/sessionRuntime.js";
import {
  isResumeLikeShellAction,
  isShellAction,
} from "../core/shell/shellActionBridge.js";
import {
  handleShellClose,
  handleShellSigint,
} from "../core/shell/signalHandlers.js";
import { isRustDaemonEnabled } from "../daemon/client.js";
import {
  createComponentLogger,
  createTraceContext,
  setGlobalTraceContext,
} from "../observability/index.js";
import { StreamingRenderer } from "../renderer/StreamingRenderer.js";
import type {
  ApprovalAuditMemoryState,
} from "../session/SessionManager.js";
import { SessionManager } from "../session/SessionManager.js";
import { getWorkflowGitContext } from "../workflow/gitContext.js";
import { parseCliArgs, type CliOptions } from "./cliArgs.js";
import {
  buildCliCommandExecution as resolveTurnInputForExecution,
  normalizePromptForExecution,
} from "./cliCommandExecutionBridge.js";
import {
  formatAgentModeStatusLines,
  formatAgentModeUpdatedLines,
  formatViewModeStatusLines,
  formatViewModeUpdatedLine,
  formatWorkspaceInfoLines,
} from "./cliDisplayProjection.js";
import { buildPersistentShellPrompt } from "./cliInteractiveLoopState.js";
import { resolveCliMode } from "./cliModeDispatch.js";
import { runCliPrintMode } from "./cliPrintModeRunner.js";
import { runCliStdinMode } from "./cliStdinModeRunner.js";
import {
  applyPatchDecisionFromApprovalMode,
  createCliEscalationPromptHandler,
  type ApprovalModeObject,
} from "./cliApprovalModule.js";
import {
  executeResolvedPromptTurn,
  runNonInteractivePrompt,
  runNonTtyPromptStream,
  runReplayPromptScript,
  streamOrchestratedResponse,
} from "./cliRuntimeModule.js";
import { runCliPermissionCommand } from "./cliPermissionModule.js";
import {
  runCliSessionCommand,
  switchRuntimeSessionProjectContext,
} from "./cliSessionModule.js";
import {
  isWorkspaceInfoPromptStrict,
  resolveTargetProjectRoot,
  runCliWorkspaceCommand,
} from "./cliWorkspaceModule.js";
import { projectCliStartupPlan } from "./cliStartupPlan.js";
import {
  renderMcpBlockedContract,
  renderMcpDoctorControlPlane,
  renderMcpRefreshControlPlane,
  renderMcpStatusControlPlane,
  renderMcpToolsControlPlane,
} from "./mcpControlCliSurface.js";
import {
  renderSessionCommandMap,
  renderUserHelp,
} from "./slashCommandRegistry.js";

async function main(): Promise<void> {
  setGlobalTraceContext(createTraceContext());
  const logger = createComponentLogger("cli");
  const args = process.argv.slice(2);
  const launchCwd = process.cwd();
  const approvalTrustPolicy = new ApprovalTrustPolicy();
  let activeNonInteractiveApprovalMode: ApprovalModeObject | undefined;
  let pendingEscPressAt: number | null = null;

  const parsedCliArgs = parseCliArgs(args, { cwd: launchCwd });
  if (parsedCliArgs.ok === false) {
    console.error(parsedCliArgs.error.message);
    process.exit(parsedCliArgs.error.exitCode);
  }
  if (parsedCliArgs.args.versionRequested) {
    console.log("0.1.0 (ts-shell MVP)");
    return;
  }

  const options: CliOptions = parsedCliArgs.args.options;

  const runtimeBaseDir = resolveTargetProjectRoot(
    launchCwd,
    options.projectPath,
  );
  const gitContext = getWorkflowGitContext(runtimeBaseDir);
  const workspaceRoot = gitContext.root ?? runtimeBaseDir;
  const runtimeConfig = getRuntimeConfig(workspaceRoot);

  if (parsedCliArgs.args.doctorRequested) {
    printCliDoctor(workspaceRoot, launchCwd);
    return;
  }

  const resolveCredentialSnapshot = (): ProviderCredentialResolution =>
    resolveProviderCredential({
      runtimeConfig: getRuntimeConfig(runtimeContext.projectRoot),
      cliProvider: options.provider,
      cliApiKey: options.apiKey,
    });
  let resolvedCredential: ProviderCredentialResolution;

  const sessionManager = new SessionManager();
  const renderer = new StreamingRenderer();
  const recoveryCandidate = !options.sessionId
    ? sessionManager.getSuggestedRecoverySession({
        preferredProjectRoot: workspaceRoot,
      })
    : null;
  const recoveryCandidateSummary = recoveryCandidate
    ? sessionManager.describeSessionReentry(recoveryCandidate.id)
    : null;
  const recoveryBlockedNotice =
    !options.sessionId && !recoveryCandidate
      ? sessionManager.getRecoveryTrustBoundaryBlock({
          preferredProjectRoot: workspaceRoot,
        })
      : null;
  const bootstrap = (() => {
    try {
      return bootstrapShellRuntime({
        cwd: workspaceRoot,
        launchCwd,
        runtimeConfig,
        gitContext,
        requestedWorkspaceRoot: runtimeBaseDir,
        sessionManager,
        renderer,
        requestedSessionId: options.sessionId,
        allowSessionRootMigration: options.migrateSessionRoot === true,
        emitLifecycleMessages: false,
      });
    } catch (error) {
      if (error instanceof SessionBootstrapError) {
        if (error.rootBindingDiagnostics.length > 0) {
          renderer.renderLine(
            "Session bootstrap blocked by root binding diagnostics.",
          );
          renderRootBindingDiagnostics(renderer, error.rootBindingDiagnostics);
        } else {
          console.error(error.message);
          console.error(error.recoveryHint);
        }
        process.exit(1);
      }
      throw error;
    }
  })();
  const runtimeContext = bootstrap.context;
  resolvedCredential = resolveCredentialSnapshot();
  let mcpGateway = new CoreMcpGateway(runtimeContext.cwd);

  const stdinTransportMode = resolveStdinTransportMode({
    stdinIsTty: Boolean(process.stdin.isTTY),
    printMode: Boolean(options.printMode),
    hasReplayFile: Boolean(options.replayFile),
    hasPromptArg: Boolean(options.promptArg?.trim()),
  });
  const pipedInput =
    stdinTransportMode === "capture-batch" ? await readStdinToEnd() : null;
  const nonInteractivePrompts = buildNonInteractivePrompts(
    options.promptArg,
    pipedInput,
  );
  const cliModePlan = resolveCliMode({
    options,
    stdinTransportMode,
    nonInteractivePromptCount: nonInteractivePrompts.length,
  });
  const startupPlan = projectCliStartupPlan({
    options,
    cliModePlan,
    stdinTransportMode,
    nonInteractivePromptCount: nonInteractivePrompts.length,
    launchCwd,
    runtimeBaseDir,
    workspaceRoot,
    projectRoot: runtimeContext.projectRoot,
    rootMode: runtimeContext.rootMode,
    providerCredentialResolution: resolvedCredential,
    providerModeEnv: process.env.PRIVATE_AGENTS_PROVIDER_MODE,
    maxTurns: runtimeContext.runtimeConfig.maxTurns,
  });
  const showStartupSurface =
    !options.printMode &&
    !options.replayFile &&
    nonInteractivePrompts.length === 0 &&
    stdinTransportMode !== "capture-batch";

  if (showStartupSurface) {
    renderStartupSurface(renderer, {
      runtimeContext,
      sessionManager,
      lifecycleNotices: bootstrap.lifecycleNotices,
      recoveryCandidate,
      recoveryCandidateSummary: recoveryCandidateSummary ?? undefined,
      recoveryBlockedNotice: recoveryBlockedNotice ?? undefined,
      provider: startupPlan.provider.provider,
      model: startupPlan.provider.model,
      maxTurns: startupPlan.maxTurns,
      executionPath: isRustDaemonEnabled() ? "rust-daemon" : "ts-local",
      stdinTransportMode: startupPlan.stdinTransportMode,
    });
  }
  logger.info("CLI session initialized", {
    sessionId: runtimeContext.session.id,
    phases: bootstrap.phases.join(" -> "),
  });

  let rl: readline.Interface | null = null;
  let interactiveTurnNumber = 0;

  const sessionRuntime = new ShellSessionRuntime({
    sessionManager,
    renderer,
    runPrompt: (prompt, signal, runtimeSeed, continuityState) => {
      resolvedCredential = resolveCredentialSnapshot();
      const escalationPromptHandler = createCliEscalationPromptHandler(
        renderer,
        rl,
        () => sessionRuntime.getViewMode(),
        approvalTrustPolicy,
        () => runtimeContext.projectRoot,
        () =>
          !process.stdin.isTTY ? options.nonInteractiveApproval : undefined,
        () => activeNonInteractiveApprovalMode,
        (record) => {
          const payload: Omit<ApprovalAuditMemoryState, "recordedAt"> = {
            decision: record.decision,
            decisionSource: record.decisionSource,
            persistent: record.persistent,
            cacheEffect: record.cacheEffect,
            projectRoot: record.projectRoot,
            cacheKey: record.cacheKey,
            scopeLabel: record.scopeLabel,
            ...(record.lineage ? { lineage: record.lineage } : {}),
            ...(record.stopReason ? { stopReason: record.stopReason } : {}),
            ...(record.channel ? { channel: record.channel } : {}),
            ...(record.inputKey &&
            (record.inputKey === "y" ||
              record.inputKey === "a" ||
              record.inputKey === "n" ||
              record.inputKey === "other")
              ? { inputKey: record.inputKey }
              : {}),
          };
          sessionManager.recordApprovalAuditDecision(
            runtimeContext.session.id,
            payload,
          );
        },
      );
      return streamOrchestratedResponse(
        prompt,
        runtimeContext.session.id,
        runtimeContext.cwd,
        signal,
        runtimeContext.runtimeConfig.maxTurns,
        escalationPromptHandler,
        resolvedCredential,
        sessionRuntime.getAgentMode(),
        runtimeSeed,
        continuityState,
        options.applyPatchRuntimeRoute === true ||
          options.applyPatchWorkspaceWrite === true
          ? {
              explicitRuntimeOptIn: true,
              requestedUserDecision: applyPatchDecisionFromApprovalMode(
                options.nonInteractiveApproval,
              ),
              runtimeSource: "production-adjacent",
              ...(options.applyPatchWorkspaceWrite === true
                ? {
                    workspaceWrite: {
                      explicitWorkspaceWriteOptIn: true,
                    },
                  }
                : {}),
            }
          : undefined,
      );
    },
  });

  if (cliModePlan.kind === "replay") {
    await runReplayPromptScript({
      replayFile: cliModePlan.replayFile,
      sessionManager,
      runtimeContext,
      renderer,
      sessionRuntime,
      logger,
      printMode: Boolean(options.printMode),
      fallbackSessionId: recoveryCandidate?.id,
      lifecycleNotices: bootstrap.lifecycleNotices,
      setActiveNonInteractiveApprovalMode: (mode) => {
        activeNonInteractiveApprovalMode = mode;
      },
      nonInteractiveCliApprovalMode: options.nonInteractiveApproval,
    });
    return;
  }

  if (cliModePlan.kind === "stdin-stream") {
    await runCliStdinMode({
      mode: "stream-live",
      runStream: () =>
        runNonTtyPromptStream({
          sessionManager,
          runtimeContext,
          renderer,
          sessionRuntime,
          logger,
          fallbackSessionId: recoveryCandidate?.id,
          lifecycleNotices: bootstrap.lifecycleNotices,
          setActiveNonInteractiveApprovalMode: (mode) => {
            activeNonInteractiveApprovalMode = mode;
          },
          nonInteractiveCliApprovalMode: options.nonInteractiveApproval,
        }),
    });
    return;
  }

  if (cliModePlan.kind === "print") {
    await runCliPrintMode({
      prompts: nonInteractivePrompts,
      writeError: console.error,
      exit: process.exit,
      runPrompt: (prompt) =>
        runNonInteractivePrompt({
          prompt,
          sessionManager,
          runtimeContext,
          renderer,
          sessionRuntime,
          logger,
          printMode: true,
          fallbackSessionId: recoveryCandidate?.id,
          lifecycleNotices: bootstrap.lifecycleNotices,
          setActiveNonInteractiveApprovalMode: (mode) => {
            activeNonInteractiveApprovalMode = mode;
          },
          nonInteractiveCliApprovalMode: options.nonInteractiveApproval,
        }),
    });
    return;
  }

  if (cliModePlan.kind === "stdin-batch") {
    await runCliStdinMode({
      mode: "batch",
      prompts: nonInteractivePrompts,
      pipedInput,
      sessionId: runtimeContext.session.id,
      renderLine: (line) => renderer.renderLine(line),
      runPrompt: (prompt) =>
        runNonInteractivePrompt({
          prompt,
          sessionManager,
          runtimeContext,
          renderer,
          sessionRuntime,
          logger,
          printMode: false,
          fallbackSessionId: recoveryCandidate?.id,
          lifecycleNotices: bootstrap.lifecycleNotices,
          setActiveNonInteractiveApprovalMode: (mode) => {
            activeNonInteractiveApprovalMode = mode;
          },
          nonInteractiveCliApprovalMode: options.nonInteractiveApproval,
        }),
    });
    return;
  }

  rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: buildPersistentShellPrompt({
      projectRoot: runtimeContext.projectRoot,
      sessionId: runtimeContext.session.id,
      agentMode: sessionRuntime.getAgentMode(),
    }),
  });

  const refreshInteractivePromptChrome = (): void => {
    if (!rl) {
      return;
    }
    rl.setPrompt(
      buildPersistentShellPrompt({
        projectRoot: runtimeContext.projectRoot,
        sessionId: runtimeContext.session.id,
        agentMode: sessionRuntime.getAgentMode(),
      }),
    );
  };

  process.on("SIGINT", () => {
    handleShellSigint({
      sessionRuntime,
      renderer,
      runtimeContext,
      readline: rl,
      exit: process.exit,
    });
  });

  let interactiveTurnInFlight = false;

  rl.on("line", async (input) => {
    const trimmed = input.trim();
    if (!trimmed) {
      rl.prompt();
      return;
    }
    if (interactiveTurnInFlight) {
      renderer.renderLine(
        "\nA turn is already running. Please wait for completion before submitting another prompt.\n",
      );
      rl.prompt();
      return;
    }
    interactiveTurnInFlight = true;
    rl.pause();

    try {
      if (isWorkspaceInfoPromptStrict(trimmed)) {
        renderProjectedLines(
          renderer,
          formatWorkspaceInfoLines({
            cwd: runtimeContext.cwd,
            projectRoot: runtimeContext.projectRoot,
          }),
        );
        rl.prompt();
        return;
      }

      const resolved = await resolveTurnInputForExecution({
        prompt: trimmed,
        cwd: runtimeContext.cwd,
        renderer,
        printMode: false,
        interactive: true,
        sessionId: runtimeContext.session.id,
      });
      if (resolved.kind === "handled") {
        rl.prompt();
        return;
      }
      const slashResult =
        resolved.kind === "shell-action" ? resolved.slashResult : null;

      if (isResumeLikeShellAction(slashResult)) {
        const resumeBridge = await runResumeLikeShellAction({
          slashResult,
          source: "interactive",
          printMode: false,
          fallbackSessionId: recoveryCandidate?.id,
          sessionManager,
          runtimeContext,
          renderer,
          turnNumber: interactiveTurnNumber,
          normalizePromptForExecution,
          switchRuntimeSessionProjectContext,
          renderSessionCommandMap,
          executeResolvedPromptTurn: (turnInput) => {
            return executeResolvedPromptTurn({
              source: "interactive",
              effectivePrompt: turnInput.effectivePrompt,
              runtimeSeed: turnInput.runtimeSeed,
              continuityState: turnInput.continuityState,
              sessionManager,
              setActiveNonInteractiveApprovalMode: (mode) => {
                activeNonInteractiveApprovalMode = mode;
              },
              runtimeContext,
              sessionRuntime,
              logger,
              printMode: false,
              turnNumber: turnInput.turnNumber,
              renderer,
              turnOrigin: turnInput.turnOrigin,
            });
          },
        });
        interactiveTurnNumber = resumeBridge.turnNumber;
        mcpGateway = new CoreMcpGateway(runtimeContext.cwd);
        refreshInteractivePromptChrome();
        rl.prompt();
        return;
      }

      if (isShellAction(slashResult, "cancel-run")) {
        sessionRuntime.cancelCurrentRun();
        renderer.renderLine("\nRequested cancellation for the current run.\n");
        rl.prompt();
        return;
      }

      if (isShellAction(slashResult, "list-sessions")) {
        await runCliSessionCommand({
          renderer,
          sessionManager,
          runtimeContext,
          sessionAction: slashResult.sessionAction,
          sessionId: slashResult.sessionId,
          printMode: false,
          readline: rl,
          onSessionSwitched: () => {
            mcpGateway = new CoreMcpGateway(runtimeContext.cwd);
            refreshInteractivePromptChrome();
          },
        });
        rl.prompt();
        return;
      }

      if (isShellAction(slashResult, "show-workspace")) {
        runCliWorkspaceCommand({
          renderer,
          sessionManager,
          runtimeContext,
          workspaceAction: slashResult.workspaceAction,
          workspaceTarget: slashResult.workspaceTarget,
          printMode: false,
          onProjectContextSwitched: () => {
            mcpGateway = new CoreMcpGateway(runtimeContext.cwd);
            refreshInteractivePromptChrome();
          },
        });
        rl.prompt();
        return;
      }

      if (isShellAction(slashResult, "show-mcp")) {
        const mcpAction = slashResult.mcpAction ?? "status";
        const mcpTarget = slashResult.mcpTarget?.trim();
        try {
          if (mcpAction === "refresh") {
            const refreshTarget =
              !mcpTarget || mcpTarget.toLowerCase() === "all"
                ? "all"
                : mcpTarget;
            const snapshot = await mcpGateway.refresh(refreshTarget);
            renderMcpRefreshControlPlane(renderer, snapshot, refreshTarget);
            rl.prompt();
            return;
          }

          const snapshot = await mcpGateway.snapshot();
          if (mcpAction === "tools") {
            renderMcpToolsControlPlane(renderer, snapshot, mcpTarget);
            rl.prompt();
            return;
          }
          if (mcpAction === "doctor") {
            renderMcpDoctorControlPlane(renderer, snapshot, mcpTarget);
            rl.prompt();
            return;
          }
          renderMcpStatusControlPlane(renderer, snapshot);
        } catch (error) {
          if (error instanceof McpGatewayBlockedError) {
            renderMcpBlockedContract(renderer, {
              blockerKind: error.blockerKind,
              reason: error.message,
              doNext: error.doNext,
            });
          } else {
            renderMcpBlockedContract(renderer, {
              blockerKind: "unknown",
              reason:
                error instanceof Error
                  ? `MCP control plane failed: ${error.message}`
                  : `MCP control plane failed: ${String(error)}`,
              doNext:
                "Run /mcp refresh all to reload server connections, then retry your MCP command.",
            });
          }
        }
        rl.prompt();
        return;
      }

      if (isShellAction(slashResult, "show-help")) {
        renderUserHelp(renderer);
        rl.prompt();
        return;
      }

      if (isShellAction(slashResult, "show-view")) {
        renderProjectedLines(
          renderer,
          formatViewModeStatusLines({ viewMode: sessionRuntime.getViewMode() }),
        );
        rl.prompt();
        return;
      }

      if (isShellAction(slashResult, "set-view")) {
        const nextMode = slashResult.viewMode ?? "compact";
        sessionRuntime.setViewMode(nextMode);
        renderer.renderLine(formatViewModeUpdatedLine({ viewMode: nextMode }));
        rl.prompt();
        return;
      }

      if (isShellAction(slashResult, "show-agent-mode")) {
        renderProjectedLines(
          renderer,
          formatAgentModeStatusLines({
            agentMode: sessionRuntime.getAgentMode(),
          }),
        );
        rl.prompt();
        return;
      }

      if (isShellAction(slashResult, "set-agent-mode")) {
        const nextMode = slashResult.agentMode ?? "build";
        sessionRuntime.setAgentMode(nextMode);
        refreshInteractivePromptChrome();
        renderProjectedLines(
          renderer,
          formatAgentModeUpdatedLines({ agentMode: nextMode }),
        );
        rl.prompt();
        return;
      }

      if (isShellAction(slashResult, "manage-permissions")) {
        runCliPermissionCommand({
          renderer,
          trustPolicy: approvalTrustPolicy,
          projectRoot: runtimeContext.projectRoot,
          permissionAction: slashResult.permissionAction,
          permissionSelector: slashResult.permissionSelector,
        });
        rl.prompt();
        return;
      }

      try {
        if (resolved.kind !== "execute") {
          rl.prompt();
          return;
        }
        interactiveTurnNumber += 1;
        await executeResolvedPromptTurn({
          source: "interactive",
          effectivePrompt: resolved.effectivePrompt,
          sessionManager,
          setActiveNonInteractiveApprovalMode: (mode) => {
            activeNonInteractiveApprovalMode = mode;
          },
          runtimeContext,
          sessionRuntime,
          logger,
          printMode: false,
          turnNumber: interactiveTurnNumber,
          renderer,
        });
      } catch (error) {
        if (sessionRuntime.getState() !== "interrupted") {
          renderer.renderLine(
            `\nError: ${error instanceof Error ? error.message : String(error)}`,
          );
          logger.error("CLI run failed", {
            sessionId: runtimeContext.session.id,
            error: error instanceof Error ? error.message : String(error),
            shellState: sessionRuntime.getState(),
          });
        }
      }

      rl.prompt();
    } finally {
      interactiveTurnInFlight = false;
      rl.resume();
    }
  });

  rl.on("close", () => {
    handleShellClose({
      sessionRuntime,
      renderer,
      runtimeContext,
      readline: rl,
      exit: process.exit,
    });
  });

  readline.emitKeypressEvents(process.stdin, rl);
  if (process.stdin.isTTY) {
    process.stdin.on("keypress", (_str, key) => {
      if (!key || key.name !== "escape") {
        return;
      }
      if (!sessionRuntime.getCurrentRunController()) {
        return;
      }

      const now = Date.now();
      if (pendingEscPressAt && now - pendingEscPressAt <= 3000) {
        pendingEscPressAt = null;
        sessionRuntime.cancelCurrentRun();
        renderer.renderLine(
          "\nCancellation requested (double Esc detected).",
        );
        return;
      }

      pendingEscPressAt = now;
      renderer.renderLine(
        "\nPress Esc again within 3 seconds to cancel the current response.",
      );
      setTimeout(() => {
        if (pendingEscPressAt && Date.now() - pendingEscPressAt >= 3000) {
          pendingEscPressAt = null;
        }
      }, 3100);
    });
  }

  rl.prompt();
}

function printCliDoctor(targetCwd: string, launchCwd: string): void {
  const runtimeConfig = getRuntimeConfig(targetCwd);
  const gitContext = getWorkflowGitContext(targetCwd);
  console.log("Private Coding Agents CLI Doctor");
  console.log(`Node: ${process.version}`);
  console.log(
    `Execution path: ${isRustDaemonEnabled() ? "rust-daemon" : "ts-local"}`,
  );
  console.log(`Provider: ${runtimeConfig.provider}`);
  console.log(`Max turns: ${runtimeConfig.maxTurns}`);
  console.log(
    `Config sources: ${runtimeConfig.configSources.join(", ") || "none"}`,
  );
  console.log(`Launch directory: ${launchCwd}`);
  console.log(`Target workspace: ${targetCwd}`);
  if (gitContext.insideGit) {
    console.log(`Git branch: ${gitContext.branch ?? "unknown"}`);
    console.log(`Workspace clean: ${gitContext.isClean ? "yes" : "no"}`);
    console.log(`Git root: ${gitContext.root ?? "unknown"}`);
  }
  console.log(
    "Tip: run `npm run doctor` from the repo root for full environment diagnostics.",
  );
}

async function readStdinToEnd(): Promise<string | null> {
  try {
    let content = "";
    process.stdin.setEncoding("utf8");
    for await (const chunk of process.stdin) {
      content += chunk;
    }
    return content.length > 0 ? content : "";
  } catch {
    return "";
  }
}

function renderProjectedLines(
  renderer: { renderLine(line: string): void },
  lines: readonly string[],
): void {
  for (const line of lines) {
    renderer.renderLine(line);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
