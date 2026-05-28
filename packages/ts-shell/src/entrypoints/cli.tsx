#!/usr/bin/env node
import process from "node:process";
import * as readline from "node:readline";
import {
  createCliBootstrapRuntimeContext,
  createCliRootContext,
  logCliBootstrapSessionInitialized,
} from "../cli/bootstrap/cliBootstrapContext.js";
import {
  projectAndRenderCliStartupSurface,
} from "../cli/bootstrap/cliStartupSurface.js";
import {
  renderProjectedLines,
} from "../cli/output/projectedLineRenderer.js";
import {
  runCliPrintModeRouter,
} from "../cli/print/printModeRouter.js";
import {
  captureCliStdinPrompts,
} from "../cli/print/stdinPromptCapture.js";
import {
  createCliApprovalModeState,
} from "../cli/approval/cliApprovalModeState.js";
import {
  createCliProviderRuntimeBridge,
} from "../cli/provider/cliProviderRuntimeBridge.js";
import {
  createCliSessionRuntime,
} from "../cli/runtime/cliSessionRuntimeFactory.js";
import { ApprovalTrustPolicy } from "../core/shell/approvalTrustPolicy.js";
import {
  runResumeLikeShellAction,
} from "../core/shell/continueShellActionRuntime.js";
import {
  isResumeLikeShellAction,
  isShellAction,
} from "../core/shell/shellActionBridge.js";
import {
  handleShellClose,
  handleShellSigint,
} from "../core/shell/signalHandlers.js";
import {
  createComponentLogger,
  createTraceContext,
  setGlobalTraceContext,
} from "../observability/index.js";
import { parseCliArgs, type CliOptions } from "./cliArgs.js";
import {
  buildCliCommandExecution as resolveTurnInputForExecution,
  normalizePromptForExecution,
} from "./cliCommandExecutionBridge.js";
import { printCliDoctor } from "./cliDoctor.js";
import {
  formatAgentModeStatusLines,
  formatAgentModeUpdatedLines,
  formatViewModeStatusLines,
  formatViewModeUpdatedLine,
  formatWorkspaceInfoLines,
} from "./cliDisplayProjection.js";
import { buildPersistentShellPrompt } from "./cliInteractiveLoopState.js";
import { createCliMcpGateway, runCliMcpCommand } from "./cliMcpModule.js";
import {
  executeResolvedPromptTurn,
} from "./cliRuntimeModule.js";
import { runCliPermissionCommand } from "./cliPermissionModule.js";
import {
  runCliSessionCommand,
  switchRuntimeSessionProjectContext,
} from "./cliSessionModule.js";
import {
  isWorkspaceInfoPromptStrict,
  runCliWorkspaceCommand,
} from "./cliWorkspaceModule.js";
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
  const approvalModeState = createCliApprovalModeState();
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

  const rootContext = createCliRootContext({ launchCwd, options });

  if (parsedCliArgs.args.doctorRequested) {
    printCliDoctor(rootContext.workspaceRoot, launchCwd);
    return;
  }

  const bootstrapRuntime = createCliBootstrapRuntimeContext({
    launchCwd,
    options,
    rootContext,
    writeError: console.error,
    exit: process.exit,
  });
  const {
    sessionManager,
    renderer,
    recoveryCandidate,
    runtimeContext,
  } = bootstrapRuntime;
  const providerRuntimeBridge = createCliProviderRuntimeBridge({
    projectRoot: runtimeContext.projectRoot,
    options,
  });
  const resolvedCredential =
    providerRuntimeBridge.resolveCredentialSnapshot();
  let mcpGateway = bootstrapRuntime.mcpGateway;

  const stdinPromptCapture = await captureCliStdinPrompts({
    options,
    stdin: process.stdin,
  });
  projectAndRenderCliStartupSurface({
    options,
    cliModePlan: stdinPromptCapture.cliModePlan,
    stdinTransportMode: stdinPromptCapture.stdinTransportMode,
    nonInteractivePromptCount:
      stdinPromptCapture.nonInteractivePrompts.length,
    launchCwd,
    bootstrapRuntime,
    providerCredentialResolution: resolvedCredential,
    providerModeEnv: providerRuntimeBridge.providerModeEnv(),
  });
  logCliBootstrapSessionInitialized({ logger, bootstrapRuntime });

  let rl: readline.Interface | null = null;
  let interactiveTurnNumber = 0;

  const sessionRuntime = createCliSessionRuntime({
    sessionManager,
    renderer,
    runtimeContext,
    options,
    approvalTrustPolicy,
    approvalModeState,
    providerRuntimeBridge,
    getReadline: () => rl,
    isStdinTty: () => Boolean(process.stdin.isTTY),
  });

  const handledPrintMode = await runCliPrintModeRouter({
    cliModePlan: stdinPromptCapture.cliModePlan,
    options,
    nonInteractivePrompts: stdinPromptCapture.nonInteractivePrompts,
    pipedInput: stdinPromptCapture.pipedInput,
    bootstrapRuntime,
    sessionRuntime,
    logger,
    writeError: console.error,
    exit: process.exit,
    setActiveNonInteractiveApprovalMode: (mode) => {
      approvalModeState.set(mode);
    },
  });
  if (handledPrintMode) {
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
                approvalModeState.set(mode);
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
        mcpGateway = createCliMcpGateway(runtimeContext.cwd);
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
            mcpGateway = createCliMcpGateway(runtimeContext.cwd);
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
            mcpGateway = createCliMcpGateway(runtimeContext.cwd);
            refreshInteractivePromptChrome();
          },
        });
        rl.prompt();
        return;
      }

      if (isShellAction(slashResult, "show-mcp")) {
        await runCliMcpCommand({
          renderer,
          gateway: mcpGateway,
          mcpAction: slashResult.mcpAction,
          mcpTarget: slashResult.mcpTarget,
        });
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
            approvalModeState.set(mode);
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

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
