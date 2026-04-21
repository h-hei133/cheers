#!/usr/bin/env node
import process from "node:process";
import * as readline from "node:readline";
import path from "node:path";
import fs from "node:fs";
import { execSync } from "node:child_process";
import { getRuntimeConfig } from "../config/runtimeConfig.js";
import { routeSlashCommand } from "../core/commands/slashRouter.js";
import type { ShellActionResult } from "../core/commands/types.js";
import { CoreMcpGateway } from "../core/mcp/gateway.js";
import type { McpClientSnapshot } from "../core/mcp/types.js";
import type { QueryRuntimeStateSeed } from "../core/query/runtimeState.js";
import { bootstrapShellRuntime } from "../core/shell/bootstrap.js";
import { SessionBootstrapError } from "../core/shell/bootstrap.js";
import {
  resolveProviderCredential,
  type ProviderCredentialResolution,
} from "../core/shell/providerCredentials.js";
import { resolveRepoAwarePromptResponse } from "../core/shell/repoAwareRouting.js";
import {
  checkRealProviderReadiness,
  createProviderReadinessTerminalEvent,
} from "../core/shell/providerReadiness.js";
import { ApprovalTrustPolicy } from "../core/shell/approvalTrustPolicy.js";
import { resumeShellSession } from "../core/shell/recovery.js";
import { switchActiveSession } from "../core/shell/runtimeContext.js";
import { ShellSessionRuntime } from "../core/shell/sessionRuntime.js";
import type { SessionResumeProvenance } from "../core/shell/runtimeContext.js";
import {
  handleShellClose,
  handleShellSigint,
} from "../core/shell/signalHandlers.js";
import { isRustDaemonEnabled } from "../daemon/client.js";
import {
  createComponentLogger,
  createTraceContext,
  recordCount,
  setGlobalTraceContext,
} from "../observability/index.js";
import { streamMvpIntegratedFlow } from "../orchestration/runMvpIntegratedFlow.js";
import { StreamingRenderer } from "../renderer/StreamingRenderer.js";
import type { EscalationPrompt, EscalationResponse } from "../sandbox/index.js";
import { SessionManager } from "../session/SessionManager.js";
import type { SessionContinuitySnapshot } from "../session/SessionManager.js";
import type { SessionMaterializedStepHint } from "../session/SessionManager.js";
import { getWorkflowGitContext } from "../workflow/gitContext.js";
import { openSessionsPanel } from "./sessionsPanel.js";

interface CliOptions {
  sessionId?: string;
  migrateSessionRoot?: boolean;
  provider?:
    | "openai"
    | "anthropic"
    | "openai-compatible"
    | "google"
    | "antigravity"
    | "claudecode";
  apiKey?: string;
  projectPath?: string;
  replayFile?: string;
  printMode?: boolean;
  promptArg?: string;
}

type StdinTransportMode = "none" | "capture-batch" | "stream-live";

type SlashRouteResult = Awaited<ReturnType<typeof routeSlashCommand>>;
type ResumeLikeShellAction = ShellActionResult & {
  action: "resume-session" | "continue-session";
};
type TurnInputResolution =
  | { kind: "handled" }
  | { kind: "shell-action"; slashResult: Extract<SlashRouteResult, { kind: "shell-action" }> }
  | { kind: "execute"; effectivePrompt: string };
type PromptPreparationResult =
  | { kind: "ready"; prompt: string }
  | { kind: "blocked"; reason: string };
type StdinDecodeResult =
  | { kind: "ok"; text: string }
  | { kind: "blocked"; reason: string };
type ShellEncodingTrust = "supported" | "risky" | "unsupported";
interface ShellEncodingProfile {
  readonly shell: "powershell" | "pwsh" | "cmd" | "bash" | "zsh" | "unknown";
  readonly platform: NodeJS.Platform;
  readonly stdinIsTty: boolean;
  readonly transportMode: StdinTransportMode;
  readonly windowsCodePage?: number;
  readonly trust: ShellEncodingTrust;
  readonly reason: string;
  readonly fallbackHints: readonly string[];
}

async function main(): Promise<void> {
  setGlobalTraceContext(createTraceContext());
  const logger = createComponentLogger("cli");
  const args = process.argv.slice(2);
  const launchCwd = process.cwd();
  const approvalTrustPolicy = new ApprovalTrustPolicy();
  let pendingEscPressAt: number | null = null;

  if (
    args.length === 1 &&
    (args[0] === "--version" || args[0] === "-v" || args[0] === "-V")
  ) {
    console.log("0.1.0 (ts-shell MVP)");
    return;
  }

  const options: CliOptions = {};
  const positionalArgs = args.filter((arg) => !arg.startsWith("--"));
  const projectIdx = (() => {
    const explicitIdx = args.indexOf("--project");
    if (explicitIdx !== -1) {
      return explicitIdx;
    }
    return args.indexOf("--attach");
  })();
  if (projectIdx !== -1) {
    if (!args[projectIdx + 1]) {
      console.error(
        `Missing value for ${args[projectIdx]}. Example: --project D:\\path\\to\\your-project`,
      );
      process.exit(1);
    }
    options.projectPath = args[projectIdx + 1];
  } else {
    // npm start can parse unknown --project/--attach flags as npm configs and
    // forward only the value as a positional arg. Accept that positional path
    // so end users can keep using `npm start -- --project <path>`.
    const positionalProject = positionalArgs.find((arg) =>
      /[\\/]/.test(arg),
    );
    if (positionalProject) {
      options.projectPath = positionalProject;
    }
  }

  const runtimeBaseDir = resolveTargetProjectRoot(
    launchCwd,
    options.projectPath,
  );
  const gitContext = getWorkflowGitContext(runtimeBaseDir);
  const workspaceRoot = gitContext.root ?? runtimeBaseDir;
  const runtimeConfig = getRuntimeConfig(workspaceRoot);

  if (args.includes("--doctor")) {
    printCliDoctor(workspaceRoot, launchCwd);
    return;
  }

  const sessionIdIdx = args.indexOf("--session-id");
  if (sessionIdIdx !== -1 && args[sessionIdIdx + 1]) {
    options.sessionId = args[sessionIdIdx + 1];
  }
  options.migrateSessionRoot = args.includes("--migrate-session-root");
  const providerIdx = args.indexOf("--provider");
  if (providerIdx !== -1 && args[providerIdx + 1]) {
    const provider = args[providerIdx + 1].trim().toLowerCase();
    if (
      provider === "openai" ||
      provider === "anthropic" ||
      provider === "openai-compatible" ||
      provider === "google" ||
      provider === "antigravity" ||
      provider === "claudecode"
    ) {
      options.provider = provider;
    } else {
      console.error(
        `Invalid --provider value: ${args[providerIdx + 1]}. Expected openai, anthropic, openai-compatible, google, antigravity, or claudecode.`,
      );
      process.exit(1);
    }
  }
  const apiKeyIdx = args.indexOf("--api-key");
  if (apiKeyIdx !== -1 && args[apiKeyIdx + 1]) {
    options.apiKey = args[apiKeyIdx + 1];
  }
  const replayIdx = args.indexOf("--replay-file");
  if (replayIdx !== -1) {
    const replayPath = args[replayIdx + 1];
    if (!replayPath) {
      console.error("Missing value for --replay-file. Example: --replay-file .\\replay.txt");
      process.exit(1);
    }
    options.replayFile = replayPath;
  }
  options.printMode = args.includes("--print") || args.includes("-p");
  options.promptArg = derivePromptArgument(args, options.projectPath);

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
  let bootstrap;
  try {
    bootstrap = bootstrapShellRuntime({
      cwd: workspaceRoot,
      launchCwd,
      runtimeConfig,
      gitContext,
      sessionManager,
      renderer,
      requestedSessionId: options.sessionId,
      allowSessionRootMigration: options.migrateSessionRoot,
    });
  } catch (error) {
    if (error instanceof SessionBootstrapError) {
      renderer.renderLine(error.message);
      if (error.hint?.trim()) {
        renderer.renderLine(`Hint: ${error.hint}`);
      }
      return;
    }
    throw error;
  }
  const runtimeContext = bootstrap.context;
  resolvedCredential = resolveCredentialSnapshot();
  let mcpGateway = new CoreMcpGateway(runtimeContext.cwd);

  const stdinTransportMode = resolveStdinTransportMode({
    stdinIsTty: Boolean(process.stdin.isTTY),
    printMode: Boolean(options.printMode),
    hasReplayFile: Boolean(options.replayFile),
    hasPromptArg: Boolean(options.promptArg?.trim()),
  });
  const quietStartup = Boolean(options.printMode);
  const shellEncodingProfile = detectShellEncodingProfile({
    stdinIsTty: Boolean(process.stdin.isTTY),
    transportMode: stdinTransportMode,
  });
  if (
    !quietStartup &&
    stdinTransportMode !== "none" &&
    shellEncodingProfile.trust !== "supported"
  ) {
    renderer.renderLine(
      `stdin compatibility: ${shellEncodingProfile.trust} (${shellEncodingProfile.reason})`,
    );
    renderer.renderLine(
      `Recommended fallback: ${shellEncodingProfile.fallbackHints.join(" | ")}`,
    );
  }
  const pipedInputBuffer =
    stdinTransportMode === "capture-batch" ? await readStdinToEnd() : null;
  const pipedDecodeResult =
    pipedInputBuffer !== null
      ? decodeStdinPayload(pipedInputBuffer, shellEncodingProfile)
      : null;
  if (pipedDecodeResult?.kind === "blocked") {
    renderer.renderLine(
      options.printMode
        ? pipedDecodeResult.reason
        : `\n${pipedDecodeResult.reason}\n`,
    );
    return;
  }
  const nonInteractivePrompts = buildNonInteractivePrompts(
    options.promptArg,
    pipedDecodeResult?.text ?? null,
  );

  if (!quietStartup) {
    renderer.renderLine("Private Coding Agents Shell (ts-shell MVP)");
    renderer.renderLine(
      `Workspace context: ${path.basename(runtimeContext.projectRoot) || runtimeContext.projectRoot}`,
    );
    if (
      path.resolve(runtimeContext.originalCwd) !==
      path.resolve(runtimeContext.projectRoot)
    ) {
      renderer.renderLine(
        `Attached target project: ${runtimeContext.projectRoot}`,
      );
    }
    renderer.renderLine(`Project root: ${runtimeContext.projectRoot}`);
    renderer.renderLine(`Launch directory: ${runtimeContext.originalCwd}`);
    renderer.renderLine(`Session: ${runtimeContext.session.id}`);
    renderer.renderLine(
      `Execution path: ${isRustDaemonEnabled() ? "rust-daemon" : "ts-local"}`,
    );
    renderer.renderLine(`Workspace: ${runtimeContext.cwd}`);
    if (runtimeContext.gitContext.insideGit) {
      renderer.renderLine(
        `Git branch: ${runtimeContext.gitContext.branch ?? "unknown"}`,
      );
      renderer.renderLine(
        `Workspace clean: ${runtimeContext.gitContext.isClean ? "yes" : "no"}`,
      );
    }
    renderer.renderLine(`Provider: ${resolvedCredential.provider}`);
    renderer.renderLine(
      `Credential source: ${resolvedCredential.credential?.source ?? "missing"}`,
    );
    if (resolvedCredential.credential) {
      renderer.renderLine(
        `Credential mode: ${resolvedCredential.credential.authMode}`,
      );
    }
    if (resolvedCredential.baseUrl) {
      renderer.renderLine(`Endpoint: ${resolvedCredential.baseUrl}`);
    }
    if (resolvedCredential.model) {
      renderer.renderLine(`Model: ${resolvedCredential.model}`);
    }
    renderer.renderLine(`Max turns: ${runtimeContext.runtimeConfig.maxTurns}`);
    if (recoveryCandidate && recoveryCandidateSummary) {
      if (recoveryCandidateSummary.autoResumeReady) {
        renderer.renderLine(
          `Recovery available: rerun with --session-id ${recoveryCandidate.id} to continue the latest interrupted session`,
        );
      } else {
        renderer.renderLine(
          `Recovery context available: rerun with --session-id ${recoveryCandidate.id} to reopen context, then submit an explicit follow-up prompt`,
        );
      }
    } else if (recoveryBlockedNotice) {
      renderer.renderLine(
        `Recovery blocked for session ${recoveryBlockedNotice.sessionId}: ${recoveryBlockedNotice.detail}`,
      );
      renderer.renderLine(recoveryBlockedNotice.recoveryHint);
    }
    renderer.renderLine(
      "Type your prompt, /help for command guide, Ctrl+C to cancel run, Ctrl+D to exit\n",
    );
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
      );
    },
  });

  if (options.replayFile) {
    await runReplayPromptScript({
      replayFile: options.replayFile,
      sessionManager,
      runtimeContext,
      renderer,
      sessionRuntime,
      logger,
      printMode: false,
      fallbackSessionId: recoveryCandidate?.id,
      onSessionSwitched: () => {
        mcpGateway = new CoreMcpGateway(runtimeContext.cwd);
      },
    });
    return;
  }

  if (stdinTransportMode === "stream-live") {
    await runNonTtyPromptStream({
      sessionManager,
      runtimeContext,
      renderer,
      sessionRuntime,
      logger,
      fallbackSessionId: recoveryCandidate?.id,
      onSessionSwitched: () => {
        mcpGateway = new CoreMcpGateway(runtimeContext.cwd);
      },
    });
    return;
  }

  if (options.printMode || nonInteractivePrompts.length > 0) {
    if (nonInteractivePrompts.length === 0) {
      if (options.printMode) {
        console.error(
          "No prompt provided for --print mode. Pass a prompt argument or pipe stdin.",
        );
        process.exit(1);
      }
      return;
    }
    if (
      pipedInputBuffer !== null &&
      nonInteractivePrompts.length > 1 &&
      !options.printMode
    ) {
      renderer.renderLine(
        `Stdin batch mode: running ${nonInteractivePrompts.length} prompt(s) sequentially in session ${runtimeContext.session.id}.`,
      );
    }
    for (const prompt of nonInteractivePrompts) {
      await runNonInteractivePrompt({
        prompt,
        sessionManager,
        runtimeContext,
        renderer,
        sessionRuntime,
        logger,
        printMode: Boolean(options.printMode),
        fallbackSessionId: recoveryCandidate?.id,
        onSessionSwitched: () => {
          mcpGateway = new CoreMcpGateway(runtimeContext.cwd);
        },
      });
    }
    return;
  }

  rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "> ",
  });

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
        renderer.renderLine("");
        renderer.renderLine(
          `Current working directory: ${runtimeContext.cwd}`,
        );
        renderer.renderLine(`Project root: ${runtimeContext.projectRoot}`);
        renderer.renderLine(
          "Use /cd <path> (or /workspace attach <path>) to switch target project.",
        );
        renderer.renderLine("");
        rl.prompt();
        return;
      }

      const resolved = await resolveTurnInputForExecution({
        prompt: trimmed,
        cwd: runtimeContext.cwd,
        sessionId: runtimeContext.session.id,
        sessionManager,
        renderer,
        printMode: false,
        interactive: true,
      });
      if (resolved.kind === "handled") {
        rl.prompt();
        return;
      }
      const slashResult = resolved.kind === "shell-action" ? resolved.slashResult : null;

      if (
        slashResult?.kind === "shell-action" &&
        (slashResult.action === "continue-session" ||
          slashResult.action === "resume-session")
      ) {
        const resumeSlash = slashResult as ResumeLikeShellAction;
        const resumeBridge = await runResumeLikeShellAction({
          slashResult: resumeSlash,
          source: "interactive",
          printMode: false,
          fallbackSessionId: recoveryCandidate?.id,
          sessionManager,
          runtimeContext,
          sessionRuntime,
          logger,
          renderer,
          turnNumber: interactiveTurnNumber,
        });
        interactiveTurnNumber = resumeBridge.turnNumber;
        mcpGateway = new CoreMcpGateway(runtimeContext.cwd);
        rl.prompt();
        return;
      }

    if (
      slashResult?.kind === "shell-action" &&
      slashResult.action === "cancel-run"
    ) {
      sessionRuntime.cancelCurrentRun();
      renderer.renderLine("\nRequested cancellation for the current run.\n");
      rl.prompt();
      return;
    }

    if (
      slashResult?.kind === "shell-action" &&
      slashResult.action === "list-sessions"
    ) {
      await handleSessionsShellAction({
        slashResult,
        interactive: true,
        rl,
        sessionManager,
        runtimeContext,
        renderer,
        onSessionSwitched: () => {
          mcpGateway = new CoreMcpGateway(runtimeContext.cwd);
        },
      });
      rl.prompt();
      return;
    }

    if (
      slashResult?.kind === "shell-action" &&
      slashResult.action === "show-workspace"
    ) {
      const workspaceAction = slashResult.workspaceAction ?? "status";
      if (workspaceAction === "recent") {
        renderRecentProjectContexts(renderer, sessionManager);
        rl.prompt();
        return;
      }

      if (workspaceAction === "attach") {
        const attachTarget = slashResult.workspaceTarget?.trim();
        if (!attachTarget) {
          renderer.renderLine(
            "\nUsage: /workspace attach <path>\n",
          );
          rl.prompt();
          return;
        }

        try {
          const attached = resolveRuntimeProjectRoot(runtimeContext.cwd, attachTarget);
          const previousProjectRoot = runtimeContext.projectRoot;
          if (
            normalizePathForCompare(previousProjectRoot) ===
            normalizePathForCompare(attached.projectRoot)
          ) {
            renderer.renderLine(
              `\nAlready attached to ${attached.projectRoot}.`,
            );
            renderWorkspaceSummary(renderer, runtimeContext);
            rl.prompt();
            return;
          }

          const attachedSession = sessionManager.createNew(attached.projectRoot);
          switchActiveSession(
            runtimeContext as never,
            attachedSession as never,
            attached.projectRoot,
            {
              cwd: attached.projectRoot,
              projectRoot: attached.projectRoot,
              gitContext: attached.gitContext,
            },
          );
          mcpGateway = new CoreMcpGateway(runtimeContext.cwd);

          renderer.renderLine(
            `\nAttached project context: ${previousProjectRoot} -> ${attached.projectRoot}`,
          );
          renderer.renderLine(`New project session: ${attachedSession.id}`);
          renderWorkspaceSummary(renderer, runtimeContext);
          renderRecentProjectContexts(renderer, sessionManager);
        } catch (error) {
          renderer.renderLine(
            `\nFailed to attach project: ${error instanceof Error ? error.message : String(error)}\n`,
          );
        }
        rl.prompt();
        return;
      }

      renderWorkspaceSummary(renderer, runtimeContext);
      rl.prompt();
      return;
    }

    if (
      slashResult?.kind === "shell-action" &&
      slashResult.action === "show-mcp"
    ) {
      const mcpAction = slashResult.mcpAction ?? "status";
      const mcpTarget = slashResult.mcpTarget?.trim();
      try {
        if (mcpAction === "refresh") {
          const refreshTarget =
            !mcpTarget || mcpTarget.toLowerCase() === "all"
              ? "all"
              : mcpTarget;
          const snapshot = await mcpGateway.refresh(refreshTarget);
          renderer.renderLine(
            `\nMCP refresh complete (${refreshTarget === "all" ? "all servers" : refreshTarget}).`,
          );
          renderMcpStatusControlPlane(renderer, snapshot);
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
          renderMcpDoctorControlPlane(renderer, snapshot);
          rl.prompt();
          return;
        }
        renderMcpStatusControlPlane(renderer, snapshot);
      } catch (error) {
        renderer.renderLine(
          `\nMCP control plane failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        renderer.renderLine("Try /mcp refresh all to reload server connections.\n");
      }
      rl.prompt();
      return;
    }

    if (
      slashResult?.kind === "shell-action" &&
      slashResult.action === "show-help"
    ) {
      renderUserHelp(renderer);
      rl.prompt();
      return;
    }

    if (
      slashResult?.kind === "shell-action" &&
      slashResult.action === "show-view"
    ) {
      const activeMode =
        sessionRuntime.getViewMode() === "compact" ? "user" : "developer";
      renderer.renderLine(
        `\nCurrent view mode: ${activeMode} (${sessionRuntime.getViewMode()})`,
      );
      renderer.renderLine(
        "Use /view user for product-style output, or /view developer for runtime-level diagnostics.\n",
      );
      rl.prompt();
      return;
    }

    if (
      slashResult?.kind === "shell-action" &&
      slashResult.action === "set-view"
    ) {
      const nextMode = slashResult.viewMode ?? "compact";
      sessionRuntime.setViewMode(nextMode);
      const activeMode = nextMode === "compact" ? "user" : "developer";
      renderer.renderLine(
        `\nView mode updated to ${activeMode} (${nextMode}). Use /view status to inspect current mode.\n`,
      );
      rl.prompt();
      return;
    }

    if (
      slashResult?.kind === "shell-action" &&
      slashResult.action === "show-agent-mode"
    ) {
      const activeMode = sessionRuntime.getAgentMode();
      renderer.renderLine(
        `\nCurrent agent mode: ${activeMode}`,
      );
      renderer.renderLine(
        "Use /plan for planning-oriented reasoning, or /build for coding/build execution (default).\n",
      );
      rl.prompt();
      return;
    }

    if (
      slashResult?.kind === "shell-action" &&
      slashResult.action === "set-agent-mode"
    ) {
      const nextMode = slashResult.agentMode ?? "build";
      sessionRuntime.setAgentMode(nextMode);
      renderer.renderLine(
        `\nAgent mode updated to ${nextMode}.`,
      );
      renderer.renderLine(
        nextMode === "plan"
          ? "Plan mode prioritizes planning and diagnosis over direct edits/tool execution."
          : "Build mode prioritizes direct coding workflow (read/search/edit/verify).",
      );
      renderer.renderLine("");
      rl.prompt();
      return;
    }

    if (
      slashResult?.kind === "shell-action" &&
      slashResult.action === "manage-permissions"
    ) {
      const permissionAction = slashResult.permissionAction ?? "list";
      if (permissionAction === "list") {
        renderPermissionsList(
          renderer,
          approvalTrustPolicy,
          runtimeContext.projectRoot,
        );
        rl.prompt();
        return;
      }

      if (permissionAction === "explain") {
        renderPermissionExplain(
          renderer,
          approvalTrustPolicy,
          runtimeContext.projectRoot,
        );
        rl.prompt();
        return;
      }

      if (permissionAction === "revoke") {
        const selector = slashResult.permissionSelector?.trim();
        if (!selector) {
          renderer.renderLine(
            "\nUsage: /permissions revoke <index|scope-key>\n",
          );
          rl.prompt();
          return;
        }
        const revokeResult = approvalTrustPolicy.revokeGrant(
          runtimeContext.projectRoot,
          selector,
        );
        if (revokeResult.removed > 0) {
          renderer.renderLine(
            `\nRemoved trust grant: ${revokeResult.removedGrant?.scopeLabel ?? selector}\n`,
          );
        } else {
          renderer.renderLine(
            `\nNo trust grant matched selector "${selector}" in current project.\n`,
          );
        }
        rl.prompt();
        return;
      }

      if (permissionAction === "reset") {
        const selector = slashResult.permissionSelector?.trim().toLowerCase();
        if (selector === "all") {
          const resetAll = approvalTrustPolicy.resetAll();
          renderer.renderLine(
            `\nReset all persisted trust grants (${resetAll.removed} removed).\n`,
          );
          rl.prompt();
          return;
        }
        const resetProject = approvalTrustPolicy.resetProject(
          runtimeContext.projectRoot,
        );
        renderer.renderLine(
          `\nReset current project trust grants (${resetProject.removed} removed).\n`,
        );
        rl.prompt();
        return;
      }
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
          "\nCurrent response cancelled (double Esc detected).\n",
        );
        rl.prompt();
        return;
      }

      pendingEscPressAt = now;
      renderer.renderLine(
        "\nPress Esc again within 3 seconds to cancel the current response.\n",
      );
      rl.prompt();
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

async function* streamOrchestratedResponse(
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
) {
  const providerMode =
    process.env.PRIVATE_AGENTS_PROVIDER_MODE === "synthetic"
      ? "synthetic"
      : "real";

  if (providerMode === "real") {
    const readiness = await checkRealProviderReadiness({
      provider: providerCredentialResolution.provider,
      apiKey: providerCredentialResolution.credential?.apiKey,
      accountAuth: providerCredentialResolution.credential?.accountAuth,
      baseUrl: providerCredentialResolution.baseUrl,
      model: providerCredentialResolution.model,
    });
    if (readiness.ok === false) {
      yield createProviderReadinessTerminalEvent({
        sessionId,
        prompt,
        stopReason: readiness.failure.stopReason,
      });
      return;
    }
  }

  for await (const event of streamMvpIntegratedFlow({
    sessionId,
    prompt,
    continuityState,
    workspaceRoot,
    escalationPromptHandler,
    providerMode,
    maxTurns,
    realProvider: providerCredentialResolution.credential,
    agentMode,
    runtimeSeed,
  })) {
    if (signal.aborted) {
      throw new Error("Aborted");
    }

    yield event;
  }
}

function createCliEscalationPromptHandler(
  renderer: StreamingRenderer,
  rl: readline.Interface | null,
  getViewMode: () => "compact" | "verbose",
  trustPolicy: ApprovalTrustPolicy,
  getProjectRoot: () => string,
): (prompt: EscalationPrompt) => Promise<EscalationResponse> {
  return async (prompt) => {
    const projectRoot = getProjectRoot();
    const evaluation = trustPolicy.evaluate(prompt, projectRoot);

    if (trustPolicy.hasAllowOnce(evaluation.cacheKey)) {
      trustPolicy.recordLastHit({
        source: "allow-once-cache",
        projectRoot,
        scopeLabel: evaluation.scopeLabel,
        cacheKey: evaluation.cacheKey,
      });
      renderApprovalHeader(renderer, "cached-approval");
      renderer.renderLine(`- Tool: ${prompt.context.toolName}`);
      renderer.renderLine(`- Action: ${prompt.context.operation}`);
      renderer.renderLine(`- Target: ${prompt.context.target}`);
      renderer.renderLine("- Decision: allow-once (cached in current shell run)");
      renderer.renderLine("");
      return {
        promptId: prompt.id,
        decision: "allow-once",
        respondedAt: Date.now(),
        userComment: "CLI auto-approval from allow-once cache",
      };
    }
    if (evaluation.matchedGrant) {
      trustPolicy.recordLastHit({
        source: "allow-always-policy",
        projectRoot,
        scopeLabel: evaluation.scopeLabel,
        cacheKey: evaluation.cacheKey,
      });
      renderApprovalHeader(renderer, "cached-approval");
      renderer.renderLine(`- Tool: ${prompt.context.toolName}`);
      renderer.renderLine(`- Action: ${prompt.context.operation}`);
      renderer.renderLine(`- Target: ${prompt.context.target}`);
      renderer.renderLine("- Decision: allow-always (project policy match)");
      renderer.renderLine(`- Scope: ${evaluation.scopeLabel}`);
      renderer.renderLine(`- Rule key: ${evaluation.matchedGrant.scopeKey}`);
      renderer.renderLine("");
      return {
        promptId: prompt.id,
        decision: "allow-always",
        respondedAt: Date.now(),
        userComment: "CLI auto-approval from project allow-always trust policy",
      };
    }

    renderApprovalHeader(renderer, "approval-required");
    renderer.renderLine(`- Tool: ${prompt.context.toolName}`);
    renderer.renderLine(`- Action: ${prompt.context.operation}`);
    renderer.renderLine(`- Target: ${prompt.context.target}`);
    renderer.renderLine(`- Risk: ${prompt.severity}`);
    for (const line of trustPolicy.explain(
      evaluation,
      projectRoot,
      getViewMode(),
    )) {
      renderer.renderLine(`- ${line}`);
    }
    if (getViewMode() === "verbose") {
      renderer.renderLine(`- Recommended default: ${prompt.recommendedAction}`);
      renderer.renderLine("");
      renderer.renderLine(prompt.message);
    } else {
      renderer.renderLine(
        "- Tip: use /view developer to see policy and full escalation details.",
      );
    }
    renderer.renderLine("Decision: y=allow-once, a=allow-always, n=deny (default n)");

    const answer = await askReadline(rl, "approval> ");
    const normalized = answer.trim().toLowerCase();
    const decision =
      normalized === "y"
        ? "allow-once"
        : normalized === "a"
          ? "allow-always"
          : "deny";

    if (decision === "allow-once") {
      trustPolicy.rememberAllowOnce(evaluation.cacheKey);
    }
    if (decision === "allow-always") {
      const persisted = trustPolicy.rememberAllowAlways(prompt, projectRoot);
      renderer.renderLine(
        `Trust policy updated: ${persisted.scopeLabel} @ ${path.basename(projectRoot) || projectRoot}`,
      );
    }

    renderer.renderLine(`Approval decision: ${decision}`);
    renderer.renderLine("");
    return {
      promptId: prompt.id,
      decision,
      respondedAt: Date.now(),
      userComment: `CLI explicit approval: ${decision}`,
    };
  };
}

function renderApprovalHeader(
  renderer: StreamingRenderer,
  mode: "approval-required" | "cached-approval",
): void {
  if (mode === "cached-approval") {
    renderer.renderLine("\nApproval");
    renderer.renderLine("- Mode: cached grant");
    return;
  }
  renderer.renderLine("\nApproval");
  renderer.renderLine("- Mode: user confirmation required");
}

function askReadline(
  rl: readline.Interface | null,
  question: string,
): Promise<string> {
  if (!rl) {
    return Promise.resolve("n");
  }
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

async function readStdinToEnd(): Promise<Buffer | null> {
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      if (typeof chunk === "string") {
        chunks.push(Buffer.from(chunk, "utf8"));
      } else {
        chunks.push(chunk as Buffer);
      }
    }
    if (chunks.length === 0) {
      return Buffer.alloc(0);
    }
    return Buffer.concat(chunks);
  } catch {
    return Buffer.alloc(0);
  }
}

function decodeStdinPayload(
  buffer: Buffer,
  profile: ShellEncodingProfile,
): StdinDecodeResult {
  if (buffer.length === 0) {
    return { kind: "ok", text: "" };
  }

  const strictDecoder = new TextDecoder("utf-8", { fatal: true });
  try {
    strictDecoder.decode(buffer);
  } catch {
    return {
      kind: "blocked",
      reason: buildCorruptedInputReason(
        profile,
        "Input bytes are not valid UTF-8.",
      ),
    };
  }

  const text = buffer.toString("utf8");
  const trimmed = text.trim();
  if (!trimmed) {
    return { kind: "ok", text };
  }

  const replacementCount = (text.match(/\uFFFD/g) ?? []).length;
  const questionCount = (text.match(/[?？]/g) ?? []).length;
  const visibleCount = (text.match(/[^\s]/g) ?? []).length;
  const hasCjk = /[\u3400-\u9FFF]/u.test(text);
  const hasAsciiWord = /[A-Za-z0-9]/.test(text);
  const severeMojibakeSignal = /(?:\u00C3.|\u00E2.|\uFFFD{2,}|鍏|锟)/u.test(text);
  const questionRatio = visibleCount > 0 ? questionCount / visibleCount : 0;

  if (
    replacementCount > 0 ||
    (questionRatio >= 0.6 && !hasAsciiWord && !hasCjk) ||
    (severeMojibakeSignal && !hasCjk && !hasAsciiWord)
  ) {
    return {
      kind: "blocked",
      reason: buildCorruptedInputReason(
        profile,
        "Input appears corrupted before orchestration (shell/codepage boundary).",
      ),
    };
  }

  return { kind: "ok", text };
}
async function runNonTtyPromptStream(options: {
  sessionManager: SessionManager;
  runtimeContext: {
    session: { id: string; projectRoot: string };
    cwd: string;
    originalCwd: string;
    projectRoot: string;
    gitContext: ReturnType<typeof getWorkflowGitContext>;
    runtimeConfig: { maxTurns: number };
    resumeProvenance?: SessionResumeProvenance;
  };
  renderer: StreamingRenderer;
  sessionRuntime: ShellSessionRuntime;
  logger: ReturnType<typeof createComponentLogger>;
  fallbackSessionId?: string;
  onSessionSwitched?: () => void;
}): Promise<void> {
  options.renderer.renderLine(
    `Non-TTY stdin mode: waiting for newline-delimited prompts on session ${options.runtimeContext.session.id}.`,
  );
  options.renderer.renderLine(
    "Send one prompt per line. Close stdin to finish.\n",
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

  stdinReader.on("line", (line) => {
    const prompts = parseTransportPrompts(line, { allowComments: false });
    for (const prompt of prompts) {
      turnChain = turnChain
        .then(async () => {
          processedCount += 1;
          options.renderer.renderLine(`> ${prompt}`);
          await runNonInteractivePrompt({
            prompt,
            sessionManager: options.sessionManager,
            runtimeContext: options.runtimeContext,
            renderer: options.renderer,
            sessionRuntime: options.sessionRuntime,
            logger: options.logger,
            printMode: false,
            fallbackSessionId: options.fallbackSessionId,
            onSessionSwitched: options.onSessionSwitched,
          });
        })
        .catch((error) => {
          options.renderer.renderLine(
            `Run failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        });
    }
  });

  await new Promise<void>((resolve) => {
    stdinReader.once("close", () => resolve());
  });
  await turnChain;
  options.renderer.renderLine(
    `\nStdin stream closed. Processed ${processedCount} prompt(s).\n`,
  );
  options.logger.info("CLI non-TTY stdin stream mode closed", {
    sessionId: options.runtimeContext.session.id,
    processedCount,
  });
}

async function runNonInteractivePrompt(options: {
  prompt: string;
  sessionManager: SessionManager;
  runtimeContext: {
    session: { id: string; projectRoot: string };
    cwd: string;
    originalCwd: string;
    projectRoot: string;
    gitContext: ReturnType<typeof getWorkflowGitContext>;
    runtimeConfig: { maxTurns: number };
    resumeProvenance?: SessionResumeProvenance;
  };
  renderer: StreamingRenderer;
  sessionRuntime: ShellSessionRuntime;
  logger: ReturnType<typeof createComponentLogger>;
  printMode: boolean;
  fallbackSessionId?: string;
  onSessionSwitched?: () => void;
}): Promise<void> {
  const trimmedPrompt = options.prompt.trim();
  if (!trimmedPrompt) {
    return;
  }
  const resolved = await resolveTurnInputForExecution({
    prompt: trimmedPrompt,
    cwd: options.runtimeContext.cwd,
    sessionId: options.runtimeContext.session.id,
    sessionManager: options.sessionManager,
    renderer: options.renderer,
    printMode: options.printMode,
    interactive: false,
  });
  if (resolved.kind === "handled") {
    return;
  }
  if (resolved.kind === "shell-action") {
    if (resolved.slashResult.action === "list-sessions") {
      await handleSessionsShellAction({
        slashResult: resolved.slashResult,
        interactive: false,
        sessionManager: options.sessionManager,
        runtimeContext: options.runtimeContext as never,
        renderer: options.renderer,
        printMode: options.printMode,
        onSessionSwitched: options.onSessionSwitched,
      });
      return;
    }
    if (
      resolved.slashResult.action === "resume-session" ||
      resolved.slashResult.action === "continue-session"
    ) {
      const resumeSlash = resolved.slashResult as ResumeLikeShellAction;
      await runResumeLikeShellAction({
        slashResult: resumeSlash,
        source: "non-interactive",
        printMode: options.printMode,
        fallbackSessionId: options.fallbackSessionId,
        sessionManager: options.sessionManager,
        runtimeContext: options.runtimeContext,
        sessionRuntime: options.sessionRuntime,
        logger: options.logger,
        renderer: options.renderer,
      });
      return;
    }
    options.renderer.renderLine(
      options.printMode
        ? "This shell action is interactive-only."
        : "\nThis shell action is interactive-only.\n",
    );
    return;
  }
  await executeResolvedPromptTurn({
    source: "non-interactive",
    effectivePrompt: resolved.effectivePrompt,
    runtimeContext: options.runtimeContext,
    sessionRuntime: options.sessionRuntime,
    logger: options.logger,
    printMode: options.printMode,
    renderer: options.renderer,
  });
}

async function resolveTurnInputForExecution(options: {
  prompt: string;
  cwd: string;
  sessionId: string;
  sessionManager: SessionManager;
  renderer: StreamingRenderer;
  printMode: boolean;
  interactive: boolean;
}): Promise<TurnInputResolution> {
  const preparedPrompt = preparePromptForExecution({
    prompt: options.prompt,
    sessionId: options.sessionId,
    sessionManager: options.sessionManager,
  });
  if (preparedPrompt.kind === "blocked") {
    options.renderer.renderLine(
      options.printMode ? preparedPrompt.reason : `\n${preparedPrompt.reason}\n`,
    );
    return { kind: "handled" };
  }

  let promptForRouting = preparedPrompt.prompt;
  const clauses = decomposeQueryClauses(preparedPrompt.prompt);
  const reflectiveAnswers: string[] = [];
  const conversationalAnswers: string[] = [];
  const repoAwareAnswers: string[] = [];
  const residualClauses: string[] = [];
  let continuationPrompt: string | undefined;
  let continuationStepHint: SessionMaterializedStepHint | undefined;

  for (const clause of clauses) {
    const reflectiveStatusHandoff =
      options.sessionManager.resolveReflectiveStatusHandoff(
        options.sessionId,
        clause,
      );
    if (reflectiveStatusHandoff) {
      reflectiveAnswers.push(reflectiveStatusHandoff.answer);
      if (!continuationPrompt && reflectiveStatusHandoff.continuationPrompt) {
        continuationPrompt = reflectiveStatusHandoff.continuationPrompt;
      }
      continue;
    }

    if (!continuationPrompt && isActionContinuationClause(clause)) {
      const materialized =
        options.sessionManager.materializeContinuationFromActionClause(
          options.sessionId,
          clause,
        );
      if (materialized?.prompt) {
        continuationPrompt = materialized.prompt;
        continuationStepHint = materialized.stepHint;
        continue;
      }
      if (materialized?.blockedReason) {
        options.renderer.renderLine(
          options.printMode
            ? materialized.blockedReason
            : `\n${materialized.blockedReason}\n`,
        );
        return { kind: "handled" };
      }
      continuationPrompt = clause;
      continue;
    }

    const conversationalHandoff =
      options.sessionManager.resolveConversationalActionHandoff(
        options.sessionId,
        clause,
      );
    if (conversationalHandoff) {
      conversationalAnswers.push(conversationalHandoff.answer);
      if (!continuationPrompt && conversationalHandoff.continuationPrompt) {
        continuationPrompt = conversationalHandoff.continuationPrompt;
      }
      continue;
    }

    if (shouldAllowRepoAwareRouting(clause)) {
      const normalizedRepoClause = normalizeRepoAwareClause(clause);
      const repoAwareResponse = resolveRepoAwarePromptResponse(
        normalizedRepoClause,
        options.cwd,
      );
      if (repoAwareResponse) {
        repoAwareAnswers.push(repoAwareResponse);
        continue;
      }
    }

    residualClauses.push(clause);
  }

  const renderedAnswers = [
    ...reflectiveAnswers,
    ...conversationalAnswers,
    ...repoAwareAnswers,
  ];
  if (renderedAnswers.length > 0) {
    const combined = renderedAnswers.join("\n\n");
    options.renderer.renderLine(
      options.printMode ? combined : `\n${combined}\n`,
    );
  }

  if (!continuationPrompt) {
    continuationPrompt = residualClauses.length > 0
      ? residualClauses.join(" then ")
      : undefined;
  }

  if (!continuationPrompt) {
    return { kind: "handled" };
  }
  promptForRouting = continuationPrompt;
  if (!options.printMode && renderedAnswers.length > 0) {
    options.renderer.renderLine(
      `\nContinuing with normalized action: ${promptForRouting}\n`,
    );
  }

  const slashResult = await routeSlashCommand(promptForRouting, {
    cwd: options.cwd,
  });
  if (slashResult?.kind === "local") {
    options.renderer.renderLine(
      options.printMode ? slashResult.output : `\n${slashResult.output}\n`,
    );
    return { kind: "handled" };
  }

  if (slashResult?.kind === "shell-action") {
    return { kind: "shell-action", slashResult };
  }

  if (slashResult?.kind === "prompt" && options.interactive) {
    options.renderer.renderLine(
      `\nSlash command expanded into prompt:\n${slashResult.prompt}\n`,
    );
  }
  const rawPrompt =
    slashResult?.kind === "prompt" ? slashResult.prompt : promptForRouting;
  const promptWithStepContext = continuationStepHint
    ? attachFollowUpStepContext(rawPrompt, continuationStepHint)
    : rawPrompt;
  const normalizedPrompt = normalizePromptForExecution(promptWithStepContext);
  const budgetedPrompt = options.sessionManager.buildBudgetedPromptWithContinuityContext(
    options.sessionId,
    normalizedPrompt,
  );
  return { kind: "execute", effectivePrompt: budgetedPrompt };
}

function attachFollowUpStepContext(
  prompt: string,
  stepHint: SessionMaterializedStepHint,
): string {
  const lines = ["[FOLLOW-UP STEP CONTEXT]"];
  lines.push(`step-kind: ${stepHint.kind}`);
  lines.push(`step-confidence: ${stepHint.confidence}`);
  if (stepHint.targetPath?.trim()) {
    lines.push(`step-target: ${stepHint.targetPath.trim()}`);
  }
  if (stepHint.command?.trim()) {
    lines.push(`step-command: ${stepHint.command.trim()}`);
  }
  if (stepHint.replaceFrom?.trim()) {
    lines.push(`step-replace-from: ${stepHint.replaceFrom.trim()}`);
  }
  if (stepHint.replaceTo?.trim()) {
    lines.push(`step-replace-to: ${stepHint.replaceTo.trim()}`);
  }
  if (stepHint.readLineCount !== undefined && Number.isFinite(stepHint.readLineCount)) {
    lines.push(`step-read-line-count: ${Math.max(1, Math.trunc(stepHint.readLineCount))}`);
  }
  if (stepHint.readFilter) {
    lines.push(`step-read-filter: ${stepHint.readFilter}`);
  }
  if (stepHint.readFragmentStart !== undefined && Number.isFinite(stepHint.readFragmentStart)) {
    lines.push(`step-read-fragment-start: ${Math.max(0, Math.trunc(stepHint.readFragmentStart))}`);
  }
  if (stepHint.readFragmentEnd !== undefined && Number.isFinite(stepHint.readFragmentEnd)) {
    lines.push(`step-read-fragment-end: ${Math.max(0, Math.trunc(stepHint.readFragmentEnd))}`);
  }
  if ((stepHint.readFragmentLineIndexes?.length ?? 0) > 0) {
    lines.push(
      `step-read-fragment-line-indexes: ${stepHint.readFragmentLineIndexes
        .map((value) => Math.max(0, Math.trunc(value)))
        .join(",")}`,
    );
  }
  if ((stepHint.readFragmentRanges?.length ?? 0) > 0) {
    lines.push(`step-read-fragment-ranges: ${stepHint.readFragmentRanges.join(";")}`);
  }
  if (
    stepHint.readFragmentSourceWindowStart !== undefined &&
    Number.isFinite(stepHint.readFragmentSourceWindowStart)
  ) {
    lines.push(
      `step-read-fragment-source-window-start: ${Math.max(0, Math.trunc(stepHint.readFragmentSourceWindowStart))}`,
    );
  }
  if (
    stepHint.readFragmentSourceWindowEnd !== undefined &&
    Number.isFinite(stepHint.readFragmentSourceWindowEnd)
  ) {
    lines.push(
      `step-read-fragment-source-window-end: ${Math.max(0, Math.trunc(stepHint.readFragmentSourceWindowEnd))}`,
    );
  }
  if (stepHint.readFragmentFingerprint?.trim()) {
    lines.push(`step-read-fragment-fingerprint: ${stepHint.readFragmentFingerprint.trim()}`);
  }
  if (stepHint.readFragmentStructureSignature?.trim()) {
    lines.push(
      `step-read-fragment-structure-signature: ${stepHint.readFragmentStructureSignature.trim()}`,
    );
  }
  if (stepHint.readFragmentNeighborhoodSignature?.trim()) {
    lines.push(
      `step-read-fragment-neighborhood-signature: ${stepHint.readFragmentNeighborhoodSignature.trim()}`,
    );
  }
  if (stepHint.continuationPrompt?.trim()) {
    lines.push(`step-continuation-prompt: ${stepHint.continuationPrompt.trim()}`);
  }
  lines.push("[END STEP CONTEXT]");
  return `${prompt.trim()}\n${lines.join("\n")}`.trim();
}

async function runResumeLikeShellAction(options: {
  slashResult: ResumeLikeShellAction;
  source: "interactive" | "non-interactive";
  printMode: boolean;
  fallbackSessionId?: string;
  sessionManager: SessionManager;
  runtimeContext: {
    session: { id: string };
    cwd: string;
    projectRoot: string;
    runtimeConfig: { maxTurns: number };
  };
  sessionRuntime: ShellSessionRuntime;
  logger: ReturnType<typeof createComponentLogger>;
  renderer: StreamingRenderer;
  turnNumber?: number;
}): Promise<{ turnNumber: number }> {
  const resumed = await resumeShellSession({
    requestedSessionId: options.slashResult.sessionId,
    fallbackSessionId: options.fallbackSessionId,
    sessionManager: options.sessionManager,
    runtimeContext: options.runtimeContext as never,
    renderer: options.renderer,
  });
  if (!resumed.resumed) {
    return { turnNumber: options.turnNumber ?? 0 };
  }

  const continuationPrompt =
    options.slashResult.action === "continue-session"
      ? options.slashResult.continuationPrompt?.trim()
      : undefined;

  if (continuationPrompt) {
    const nextTurn = (options.turnNumber ?? 0) + 1;
    const effectiveFollowUp = normalizePromptForExecution(continuationPrompt);
    await executeResolvedPromptTurn({
      source: options.source,
      effectivePrompt: effectiveFollowUp,
      runtimeContext: options.runtimeContext,
      sessionRuntime: options.sessionRuntime,
      logger: options.logger,
      printMode: options.printMode,
      turnNumber: options.source === "interactive" ? nextTurn : undefined,
      renderer: options.renderer,
      turnOrigin: "continued",
    });
    return { turnNumber: nextTurn };
  }

  if (resumed.autoResume) {
    const nextTurn = (options.turnNumber ?? 0) + 1;
    await executeResolvedPromptTurn({
      source: options.source,
      effectivePrompt: resumed.autoResume.prompt,
      runtimeSeed: resumed.autoResume.runtimeSeed,
      continuityState: resumed.autoResume.continuityState,
      runtimeContext: options.runtimeContext,
      sessionRuntime: options.sessionRuntime,
      logger: options.logger,
      printMode: options.printMode,
      turnNumber: options.source === "interactive" ? nextTurn : undefined,
      renderer: options.renderer,
      turnOrigin: "resumed",
    });
    return { turnNumber: nextTurn };
  }

  if (options.slashResult.action === "continue-session") {
    options.renderer.renderLine(
      options.printMode
        ? "Session continuation ready. Submit an explicit follow-up prompt."
        : "Session continuation ready. Enter your next instruction, or use /continue <follow-up prompt>.\n",
    );
  }

  return { turnNumber: options.turnNumber ?? 0 };
}

async function executeResolvedPromptTurn(options: {
  source: "interactive" | "non-interactive";
  effectivePrompt: string;
  runtimeSeed?: QueryRuntimeStateSeed;
  continuityState?: SessionContinuitySnapshot;
  runtimeContext: {
    session: { id: string };
    resumeProvenance?: SessionResumeProvenance;
  };
  sessionRuntime: ShellSessionRuntime;
  logger: ReturnType<typeof createComponentLogger>;
  printMode: boolean;
  turnNumber?: number;
  renderer: StreamingRenderer;
  turnOrigin?: "normal" | "resumed" | "continued";
}): Promise<void> {
  const turnOrigin = options.turnOrigin ?? "normal";
  const turnTag =
    turnOrigin === "resumed"
      ? " (resumed)"
      : turnOrigin === "continued"
        ? " (continued)"
        : "";
  if (options.source === "interactive" && !options.printMode) {
    const turnLabel = options.turnNumber ?? 0;
    options.logger.info("CLI interactive turn boundary", {
      sessionId: options.runtimeContext.session.id,
      turn: turnLabel,
      turnOrigin,
    });
    options.renderer.renderLine(`\n=== Turn ${turnLabel}${turnTag} ===`);
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
  recordCount("cli.prompts", 1, {
    sessionId: options.runtimeContext.session.id,
  });
  await options.sessionRuntime.executePrompt(
    options.runtimeContext.session.id,
    options.effectivePrompt,
    {
      outputMode: options.printMode ? "print" : "interactive",
      runtimeSeed: options.runtimeSeed,
      continuityState: options.continuityState,
      resumeProvenance: options.runtimeContext.resumeProvenance,
    },
  );
  options.logger.info(
    options.source === "interactive"
      ? "CLI run completed"
      : "CLI run completed (non-interactive)",
    {
      sessionId: options.runtimeContext.session.id,
      shellState: options.sessionRuntime.getState(),
    },
  );
  if (options.source === "interactive" && !options.printMode) {
    options.renderer.renderLine(
      `=== End Turn ${options.turnNumber ?? 0}${turnTag} ===\n`,
    );
  }
}

async function runReplayPromptScript(options: {
  replayFile: string;
  sessionManager: SessionManager;
  runtimeContext: {
    session: { id: string; projectRoot: string };
    cwd: string;
    originalCwd: string;
    projectRoot: string;
    gitContext: ReturnType<typeof getWorkflowGitContext>;
    runtimeConfig: { maxTurns: number };
    resumeProvenance?: SessionResumeProvenance;
  };
  renderer: StreamingRenderer;
  sessionRuntime: ShellSessionRuntime;
  logger: ReturnType<typeof createComponentLogger>;
  printMode: boolean;
  fallbackSessionId?: string;
  onSessionSwitched?: () => void;
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
    options.renderer.renderLine(`\n> ${prompt}`);
    await runNonInteractivePrompt({
      prompt,
      sessionManager: options.sessionManager,
      runtimeContext: options.runtimeContext,
      renderer: options.renderer,
      sessionRuntime: options.sessionRuntime,
      logger: options.logger,
      printMode: options.printMode,
      fallbackSessionId: options.fallbackSessionId,
      onSessionSwitched: options.onSessionSwitched,
    });
  }
}

function buildNonInteractivePrompts(
  promptArg: string | undefined,
  pipedInput: string | null,
): string[] {
  const prompt = promptArg?.trim() ?? "";
  if (pipedInput === null) {
    return prompt.length > 0 ? [prompt] : [];
  }

  const pipedPrompts = parseTransportPrompts(pipedInput, { allowComments: false });
  if (pipedPrompts.length === 0) {
    return prompt.length > 0 ? [prompt] : [];
  }

  if (!prompt) {
    return pipedPrompts;
  }

  return [prompt, ...pipedPrompts];
}

function parseTransportPrompts(
  raw: string,
  options: { allowComments: boolean },
): string[] {
  const normalizedRaw = raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  return normalizedRaw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => {
      if (line.length === 0) {
        return false;
      }
      if (options.allowComments && line.startsWith("#")) {
        return false;
      }
      return true;
    });
}

function resolveStdinTransportMode(input: {
  stdinIsTty: boolean;
  printMode: boolean;
  hasReplayFile: boolean;
  hasPromptArg: boolean;
}): StdinTransportMode {
  if (input.stdinIsTty || input.hasReplayFile) {
    return "none";
  }
  if (input.printMode) {
    return "capture-batch";
  }
  if (input.hasPromptArg) {
    return "none";
  }
  return "stream-live";
}

function detectShellEncodingProfile(input: {
  stdinIsTty: boolean;
  transportMode: StdinTransportMode;
}): ShellEncodingProfile {
  const shell = detectShellKind();
  const platform = process.platform;
  const codePage = platform === "win32" ? detectWindowsCodePage() : undefined;
  const fallbackHints = [
    "Use --replay-file <path> with UTF-8 file",
    "Use --print \"<prompt>\" for single-turn runs",
    "Use interactive TTY mode for CJK-heavy prompts",
  ];
  if (platform === "win32") {
    fallbackHints.push(
      "Prefer PowerShell 7 (pwsh) with UTF-8 output/input encoding",
    );
  } else {
    fallbackHints.push("Prefer bash/zsh with UTF-8 locale");
  }

  if (input.transportMode === "none" || input.stdinIsTty) {
    return {
      shell,
      platform,
      stdinIsTty: input.stdinIsTty,
      transportMode: input.transportMode,
      windowsCodePage: codePage,
      trust: "supported",
      reason: "stdin transport is not used or is interactive TTY",
      fallbackHints,
    };
  }

  if (platform !== "win32") {
    return {
      shell,
      platform,
      stdinIsTty: input.stdinIsTty,
      transportMode: input.transportMode,
      trust: "supported",
      reason: "non-Windows stdin path with explicit UTF-8 integrity checks",
      fallbackHints,
    };
  }

  const isUtf8CodePage = codePage === 65001;
  if (shell === "pwsh" && isUtf8CodePage) {
    return {
      shell,
      platform,
      stdinIsTty: input.stdinIsTty,
      transportMode: input.transportMode,
      windowsCodePage: codePage,
      trust: "supported",
      reason: "pwsh + UTF-8 codepage",
      fallbackHints,
    };
  }

  if (shell === "powershell" || shell === "cmd" || !isUtf8CodePage) {
    return {
      shell,
      platform,
      stdinIsTty: input.stdinIsTty,
      transportMode: input.transportMode,
      windowsCodePage: codePage,
      trust: "risky",
      reason: `Windows ${shell} stdin pipe may damage CJK before process ingestion (codepage=${codePage ?? "unknown"})`,
      fallbackHints,
    };
  }

  return {
    shell,
    platform,
    stdinIsTty: input.stdinIsTty,
    transportMode: input.transportMode,
    windowsCodePage: codePage,
    trust: "risky",
    reason: "Windows stdin pipeline with unknown shell characteristics",
    fallbackHints,
  };
}

function detectShellKind():
  | "powershell"
  | "pwsh"
  | "cmd"
  | "bash"
  | "zsh"
  | "unknown" {
  const shell = process.env.SHELL?.toLowerCase() ?? "";
  if (shell.includes("bash")) {
    return "bash";
  }
  if (shell.includes("zsh")) {
    return "zsh";
  }
  const parentHint = [
    process.env.TERM_PROGRAM,
    process.env.ComSpec,
    process.env.PSModulePath ? "powershell-env" : "",
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (parentHint.includes("pwsh")) {
    return "pwsh";
  }
  if (parentHint.includes("powershell")) {
    return "powershell";
  }
  if (parentHint.includes("cmd.exe")) {
    return "cmd";
  }
  return "unknown";
}

function detectWindowsCodePage(): number | undefined {
  try {
    const output = execSync("chcp", { stdio: ["ignore", "pipe", "ignore"] })
      .toString("utf8")
      .trim();
    const match = output.match(/(\d{3,5})/);
    if (!match?.[1]) {
      return undefined;
    }
    const parsed = Number.parseInt(match[1], 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function buildCorruptedInputReason(
  profile: ShellEncodingProfile,
  detail: string,
): string {
  const profileLine = `stdin profile: shell=${profile.shell}, transport=${profile.transportMode}, trust=${profile.trust}${profile.windowsCodePage ? `, codepage=${profile.windowsCodePage}` : ""}.`;
  const hintLine = `Recommended fallback: ${profile.fallbackHints.join(" | ")}.`;
  return `${detail} ${profileLine} ${hintLine}`;
}

function derivePromptArgument(
  args: string[],
  projectPath?: string,
): string | undefined {
  const positional: string[] = [];
  const valueFlags = new Set([
    "--project",
    "--attach",
    "--session-id",
    "--provider",
    "--api-key",
    "--replay-file",
  ]);

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (valueFlags.has(token)) {
      index += 1;
      continue;
    }
    if (token === "--") {
      positional.push(...args.slice(index + 1));
      break;
    }
    if (token.startsWith("-")) {
      continue;
    }
    positional.push(token);
  }

  if (projectPath) {
    const normalizedProject = normalizePathForCompare(projectPath);
    const projectIdx = positional.findIndex(
      (token) =>
        normalizePathForCompare(path.resolve(process.cwd(), token)) ===
          normalizedProject || token === projectPath,
    );
    if (projectIdx >= 0) {
      positional.splice(projectIdx, 1);
    }
  }

  const prompt = positional.join(" ").trim();
  return prompt.length > 0 ? prompt : undefined;
}

function renderWorkspaceSummary(
  renderer: StreamingRenderer,
  runtimeContext: {
    cwd: string;
    originalCwd: string;
    projectRoot: string;
    gitContext: {
      insideGit: boolean;
      branch: string | null;
      isClean: boolean | null;
      root: string | null;
    };
    session: { id: string; status: string; projectRoot: string };
  },
): void {
  renderer.renderLine("\nWorkspace");
  renderer.renderLine(`- Project: ${path.basename(runtimeContext.projectRoot) || runtimeContext.projectRoot}`);
  renderer.renderLine(`- Project root: ${runtimeContext.projectRoot}`);
  renderer.renderLine(`- Working directory: ${runtimeContext.cwd}`);
  renderer.renderLine(`- Original launch directory: ${runtimeContext.originalCwd}`);
  if (runtimeContext.gitContext.insideGit) {
    renderer.renderLine(`- Git root: ${runtimeContext.gitContext.root ?? "unknown"}`);
    renderer.renderLine(`- Branch: ${runtimeContext.gitContext.branch ?? "unknown"}`);
    renderer.renderLine(
      `- Workspace clean: ${runtimeContext.gitContext.isClean ? "yes" : "no"}`,
    );
  } else {
    renderer.renderLine("- Git: not inside a git workspace");
  }
  renderer.renderLine(`- Active session: ${runtimeContext.session.id} [${runtimeContext.session.status}]`);
  renderer.renderLine(`- Session project binding: ${runtimeContext.session.projectRoot}`);
  renderer.renderLine("Next actions: /workspace recent, /workspace attach <path>, /sessions");
  renderer.renderLine("");
}

function renderRecentProjectContexts(
  renderer: StreamingRenderer,
  sessionManager: SessionManager,
): void {
  const projectContexts = sessionManager.listRecentProjectContexts(8);
  renderer.renderLine("\nRecent project contexts");
  if (projectContexts.length === 0) {
    renderer.renderLine("- No project contexts found yet.");
    renderer.renderLine("- Start with /workspace attach <path> to bind a target project.");
    renderer.renderLine("");
    return;
  }

  for (const projectContext of projectContexts) {
    const projectLabel =
      path.basename(projectContext.projectRoot) || projectContext.projectRoot;
    const recoverableLabel =
      projectContext.recoverableCount > 0
        ? `${projectContext.recoverableCount} recoverable`
        : "no recoverable runs";
    renderer.renderLine(
      `- ${projectLabel}  sessions=${projectContext.sessionCount}  ${recoverableLabel}  updated=${toRelativeTime(projectContext.lastUpdatedAt)}  last=${projectContext.lastSessionId}`,
    );
  }
  renderer.renderLine(
    "Attach quickly with /workspace attach <path>. Resume the last interrupted run with /resume after switching project context.",
  );
  renderer.renderLine("");
}

function renderSessionList(
  renderer: StreamingRenderer,
  sessionManager: SessionManager,
  activeSessionId: string,
  preferredProjectRoot: string,
): void {
  const summaries = sessionManager.listReentrySummaries({
    limit: 10,
    preferredProjectRoot,
  });
  if (summaries.length === 0) {
    renderer.renderLine("\nNo sessions found.\n");
    return;
  }

  renderer.renderLine("\nRe-entry sessions");
  renderer.renderLine(
    "Use /sessions switch <session-id> to jump directly, /resume to continue the best interrupted context, or /sessions for interactive panel.",
  );
  for (const summary of summaries) {
    const activeMarker = summary.id === activeSessionId ? "*" : " ";
    const recoverability =
      summary.resumeDisposition === "fully-resumable"
        ? "fully-resumable"
        : summary.resumeDisposition === "partially-resumable"
          ? "partially-resumable"
          : "blocked";
    const title = summary.title?.trim() || "(untitled)";
    const projectLabel = path.basename(summary.projectRoot) || summary.projectRoot;
    const terminalLabel = summary.terminalClassification
      ? ` terminal=${summary.terminalClassification}`
      : "";
    const promptLabel = summary.pendingPrompt?.trim()
      ? ` pending="${truncate(summary.pendingPrompt.trim(), 56)}"`
      : summary.lastUserMessage?.trim()
        ? ` last="${truncate(summary.lastUserMessage.trim(), 56)}"`
        : "";
    renderer.renderLine(
      `${activeMarker} ${summary.id}  [${summary.status}] [${recoverability}]  ${title}  @${projectLabel}  updated=${toRelativeTime(summary.updatedAt)}${terminalLabel}${promptLabel}`,
    );
  }
  renderer.renderLine("");
}

function renderCurrentSession(
  renderer: StreamingRenderer,
  sessionManager: SessionManager,
  runtimeContext: {
    session: {
      id: string;
      status: string;
      updatedAt: string;
      title?: string;
      projectRoot: string;
    };
  },
): void {
  const summary = sessionManager.describeSessionReentry(runtimeContext.session.id);
  const title = summary.title?.trim() || "(untitled)";
  renderer.renderLine("\nCurrent session");
  renderer.renderLine(`- ID: ${summary.id}`);
  renderer.renderLine(`- Title: ${title}`);
  renderer.renderLine(`- Status: ${summary.status}`);
  renderer.renderLine(
    `- Resume: ${summary.resumeDisposition}${summary.autoResumeReady ? " (auto)" : ""}`,
  );
  renderer.renderLine(`- Resume detail: ${summary.resumeDetail}`);
  if (!summary.recoverable) {
    renderer.renderLine(
      `- Recoverability: blocked (${summary.blockedReason ?? "unknown"})`,
    );
  }
  renderer.renderLine(`- Project binding: ${summary.projectRoot}`);
  renderer.renderLine(`- Updated: ${summary.updatedAt} (${toRelativeTime(summary.updatedAt)})`);
  if (summary.pendingPrompt?.trim()) {
    renderer.renderLine(
      `- Pending prompt: ${truncate(summary.pendingPrompt.trim(), 180)}`,
    );
  } else if (summary.lastUserMessage?.trim()) {
    renderer.renderLine(
      `- Last user request: ${truncate(summary.lastUserMessage.trim(), 180)}`,
    );
  }
  if (summary.lastAssistantMessage?.trim()) {
    renderer.renderLine(
      `- Last assistant output: ${truncate(summary.lastAssistantMessage.trim(), 180)}`,
    );
  }
  if (summary.terminalClassification || summary.terminalReason) {
    renderer.renderLine(
      `- Last terminal: ${summary.terminalClassification ?? "unknown"}${summary.terminalReason ? ` (${summary.terminalReason})` : ""}`,
    );
  }
  if (!summary.recoverable && summary.blockedDetail) {
    renderer.renderLine(
      `- Recovery boundary: ${truncate(summary.blockedDetail, 180)}`,
    );
  }
  renderer.renderLine("");
}

function renderUserHelp(renderer: StreamingRenderer): void {
  renderer.renderLine("\nUser command guide");
  renderer.renderLine("Core flow:");
  renderer.renderLine(
    "- Launch into a specific project with --project <path> (or --attach <path>).",
  );
  renderer.renderLine("- Type a prompt to run a task in the current workspace.");
  renderer.renderLine(
    "- Approval trust policy is project-scoped: allow-always applies to matching tool/action scopes in the current project.",
  );
  renderer.renderLine("- Use /cancel to stop only the current run.");
  renderer.renderLine("- Use /workspace status to confirm where the shell is operating.");
  renderer.renderLine("- Use /workspace attach <path> to switch active target project without restarting the shell.");
  renderer.renderLine("- Use /cd <path> for quick project/workdir attach, and /pwd to print current workspace status.");
  renderer.renderLine("- Use /workspace recent to inspect re-entry project contexts.");
  renderer.renderLine("- Session switches also switch project context for subsequent tool/model execution.");
  renderer.renderLine("");
  renderer.renderLine("Session flow:");
  renderer.renderLine("- /sessions                open interactive panel (switch / rename / delete).");
  renderer.renderLine("- /sessions list           show recent sessions in-place.");
  renderer.renderLine("- /sessions current        show current session details.");
  renderer.renderLine("- /sessions switch <id>    switch directly to a known session ID.");
  renderer.renderLine("- /resume [id]             resume interrupted/latest session logic.");
  renderer.renderLine("- /continue [id] [text]    recover a session and optionally run immediate follow-up.");
  renderer.renderLine("");
  renderer.renderLine("Environment and diagnostics:");
  renderer.renderLine("- /diagnose                repo-aware diagnosis (change inventory, hotspots, actionable next step).");
  renderer.renderLine("- /connect status|login|use|logout   provider onboarding and active connection management.");
  renderer.renderLine("- /connect set <provider> <api-key> [base-url] [model]   legacy credential compatibility path.");
  renderer.renderLine("- /model status|list|use             inspect and switch active model (models.dev aligned).");
  renderer.renderLine("- /permissions list                  show persisted trust grants for current project.");
  renderer.renderLine("- /permissions explain               explain latest automatic trust-policy hit.");
  renderer.renderLine("- /permissions revoke <selector>     remove one persisted trust grant by index or scope key.");
  renderer.renderLine("- /permissions reset [all]           reset current project grants or all grants.");
  renderer.renderLine("- /view user               user-facing output (default).");
  renderer.renderLine("- /view developer          runtime diagnostics and lifecycle details.");
  renderer.renderLine("- /build                   switch to build mode (default coding workflow).");
  renderer.renderLine("- /plan                    switch to plan mode (planning-first workflow).");
  renderer.renderLine("- /mode [status|plan|build] show/switch current agent mode.");
  renderer.renderLine("- /mcp status|tools|doctor|refresh [server]   MCP control plane: inspect, diagnose, and refresh MCP connectivity.");
  renderer.renderLine("- /help                    show this guide.");
  renderer.renderLine("");
}

function renderMcpStatusControlPlane(
  renderer: StreamingRenderer,
  snapshot: McpClientSnapshot,
): void {
  const connected = snapshot.clients.filter((client) => client.type === "connected");
  const needsAuth = snapshot.clients.filter((client) => client.type === "needs-auth");
  const failed = snapshot.clients.filter((client) => client.type === "failed");
  const disabled = snapshot.clients.filter((client) => client.type === "disabled");
  const pending = snapshot.clients.filter((client) => client.type === "pending");

  renderer.renderLine("\nMCP control plane");
  renderer.renderLine(
    `- Servers: total ${snapshot.clients.length}, connected ${connected.length}, needs-auth ${needsAuth.length}, failed ${failed.length}, pending ${pending.length}, disabled ${disabled.length}`,
  );
  renderer.renderLine(`- Exposed tools: ${snapshot.tools.length}`);
  if (snapshot.clients.length === 0) {
    renderer.renderLine("- No MCP servers configured for this project.");
    renderer.renderLine("- Add project servers in .private-agents.mcp.json or user servers in ~/.private-agents/mcp.json.");
    renderer.renderLine("");
    return;
  }

  for (const client of snapshot.clients) {
    const toolCount = snapshot.tools.filter(
      (tool) => tool.serverName === client.name,
    ).length;
    const scope = client.config.scope;
    const transport = client.config.transport;
    renderer.renderLine(
      `- ${client.name}: ${client.type} (scope=${scope}, transport=${transport}, tools=${toolCount})`,
    );
    if (client.type === "failed") {
      renderer.renderLine(`  reason: ${truncate(client.error, 140)}`);
    }
  }

  renderer.renderLine("Next actions:");
  renderer.renderLine("- /mcp tools [server]    inspect available MCP tools.");
  renderer.renderLine("- /mcp doctor            diagnose auth/connection failures.");
  renderer.renderLine("- /mcp refresh [server]  reconnect all or one server.");
  renderer.renderLine("");
}

function renderMcpToolsControlPlane(
  renderer: StreamingRenderer,
  snapshot: McpClientSnapshot,
  targetServer?: string,
): void {
  const normalizedTarget = targetServer?.trim();
  const targetClients = normalizedTarget
    ? snapshot.clients.filter((client) => client.name === normalizedTarget)
    : snapshot.clients;
  if (normalizedTarget && targetClients.length === 0) {
    renderer.renderLine(`\nUnknown MCP server: ${normalizedTarget}`);
    renderer.renderLine("Run /mcp status to inspect configured server names.\n");
    return;
  }

  const tools = normalizedTarget
    ? snapshot.tools.filter((tool) => tool.serverName === normalizedTarget)
    : snapshot.tools;

  renderer.renderLine(
    `\nMCP tools${normalizedTarget ? ` @ ${normalizedTarget}` : ""}`,
  );
  if (tools.length === 0) {
    renderer.renderLine("- No tools currently exposed.");
    const unresolved = targetClients.filter(
      (client) => client.type !== "connected",
    );
    if (unresolved.length > 0) {
      renderer.renderLine("- At least one selected server is not connected. Use /mcp doctor or /mcp refresh.");
    }
    renderer.renderLine("");
    return;
  }

  for (const tool of tools) {
    renderer.renderLine(`- ${tool.qualifiedName}`);
    if (tool.description?.trim()) {
      renderer.renderLine(`  ${truncate(tool.description.trim(), 140)}`);
    }
  }
  renderer.renderLine("");
}

function renderMcpDoctorControlPlane(
  renderer: StreamingRenderer,
  snapshot: McpClientSnapshot,
): void {
  const needsAuth = snapshot.clients.filter((client) => client.type === "needs-auth");
  const failed = snapshot.clients.filter((client) => client.type === "failed");
  const pending = snapshot.clients.filter((client) => client.type === "pending");
  const disabled = snapshot.clients.filter((client) => client.type === "disabled");

  renderer.renderLine("\nMCP doctor");
  if (
    needsAuth.length === 0 &&
    failed.length === 0 &&
    pending.length === 0 &&
    disabled.length === 0
  ) {
    renderer.renderLine("- No blocking MCP issues detected.");
    renderer.renderLine("- All configured servers are connected and serving tools.");
    renderer.renderLine("");
    return;
  }

  if (needsAuth.length > 0) {
    renderer.renderLine("- Needs auth:");
    for (const client of needsAuth) {
      renderer.renderLine(
        `  ${client.name} requires credentials before tools can be used.`,
      );
    }
  }
  if (failed.length > 0) {
    renderer.renderLine("- Failed connections:");
    for (const client of failed) {
      renderer.renderLine(
        `  ${client.name}: ${truncate(client.error, 140)}`,
      );
    }
  }
  if (pending.length > 0) {
    renderer.renderLine("- Pending connections:");
    for (const client of pending) {
      renderer.renderLine(`  ${client.name} is still initializing.`);
    }
  }
  if (disabled.length > 0) {
    renderer.renderLine("- Disabled servers:");
    for (const client of disabled) {
      renderer.renderLine(`  ${client.name} is disabled in MCP config.`);
    }
  }

  renderer.renderLine("Suggested recovery flow:");
  renderer.renderLine("- /mcp refresh all");
  renderer.renderLine("- /connect status (if auth-backed MCP providers are involved)");
  renderer.renderLine("- Re-check with /mcp status");
  renderer.renderLine("");
}

function switchRuntimeSessionProjectContext(
  runtimeContext: {
    cwd: string;
    originalCwd: string;
    projectRoot: string;
    gitContext: ReturnType<typeof getWorkflowGitContext>;
    resumeProvenance?: SessionResumeProvenance;
  },
  resumedSession: { id: string; projectRoot: string },
  switchMeta?: {
    source?: SessionResumeProvenance["source"];
    requestedSessionId?: string;
  },
): void {
  const nextProjectRoot =
    resumedSession.projectRoot?.trim() || runtimeContext.projectRoot;
  const switchSource = switchMeta?.source;
  switchActiveSession(
    runtimeContext as never,
    resumedSession as never,
    nextProjectRoot,
    {
      cwd: nextProjectRoot,
      projectRoot: nextProjectRoot,
      gitContext: getWorkflowGitContext(nextProjectRoot),
      ...(switchSource
        ? {
            resumeProvenance: {
              source: switchSource,
              requestedSessionId: switchMeta?.requestedSessionId,
              resolvedSessionId: resumedSession.id,
            } satisfies SessionResumeProvenance,
          }
        : {}),
    },
  );
}

async function handleSessionsShellAction(options: {
  slashResult: Extract<SlashRouteResult, { kind: "shell-action"; action: "list-sessions" }>;
  interactive: boolean;
  rl?: readline.Interface;
  sessionManager: SessionManager;
  runtimeContext: {
    session: { id: string };
    cwd: string;
    originalCwd: string;
    projectRoot: string;
    gitContext: ReturnType<typeof getWorkflowGitContext>;
    resumeProvenance?: SessionResumeProvenance;
  };
  renderer: StreamingRenderer;
  printMode?: boolean;
  onSessionSwitched?: () => void;
}): Promise<void> {
  const sessionAction = options.slashResult.sessionAction ?? "panel";
  if (sessionAction === "list") {
    renderSessionList(
      options.renderer,
      options.sessionManager,
      options.runtimeContext.session.id,
      options.runtimeContext.projectRoot,
    );
    return;
  }

  if (sessionAction === "current") {
    renderCurrentSession(
      options.renderer,
      options.sessionManager,
      options.runtimeContext as never,
    );
    return;
  }

  const trySwitchTo = (targetSessionId: string): boolean => {
    const resumeResult = options.sessionManager.tryResume(
      targetSessionId,
      options.runtimeContext.projectRoot,
      { mode: "runtime-recovery" },
    );
    if (!resumeResult.ok) {
      const detail = resumeResult.error?.trim() || "unknown-reason";
      const hint = resumeResult.recoveryHint?.trim();
      options.renderer.renderLine(
        options.printMode
          ? `session-switch-blocked:${detail}`
          : `\nSession switch blocked: ${detail}`,
      );
      options.renderer.renderLine(
        options.printMode
          ? `session-switch-requested:${targetSessionId}`
          : `Requested session: ${targetSessionId}`,
      );
      if (hint) {
        options.renderer.renderLine(
          options.printMode
            ? `session-switch-reason:${hint}`
            : `Reason: ${hint}`,
        );
      }
      if (!options.printMode) {
        options.renderer.renderLine("");
      }
      return false;
    }

    const resumed = resumeResult.session;
    const previousSessionId = options.runtimeContext.session.id;
    switchRuntimeSessionProjectContext(
      options.runtimeContext,
      resumed,
      {
        source: "explicit-switch",
        requestedSessionId: targetSessionId,
      },
    );
    options.onSessionSwitched?.();
    options.renderer.renderLine(
      options.printMode
        ? `session-switch-selected:${targetSessionId}`
        : `\nSwitched session: ${previousSessionId} -> ${resumed.id}`,
    );
    options.renderer.renderLine(
      options.printMode
        ? `session-switch-resolved:${resumed.id}`
        : `Project context: ${options.runtimeContext.projectRoot}`,
    );
    options.renderer.renderLine(
      options.printMode
        ? "session-switch-source:explicit-switch"
        : "Switch reason: explicit user selection",
    );
    if (!options.printMode) {
      renderSwitchedSessionContext(options.renderer, options.sessionManager, resumed.id);
      options.renderer.renderLine("");
    }
    return true;
  };

  if (sessionAction === "switch") {
    const targetSessionId = options.slashResult.sessionId?.trim();
    if (!targetSessionId) {
      options.renderer.renderLine(
        options.printMode
          ? "session-switch-blocked:missing-session-id"
          : "\nUsage: /sessions switch <session-id>\n",
      );
      return;
    }
    trySwitchTo(targetSessionId);
    return;
  }

  if (!options.interactive || !options.rl) {
    renderSessionList(
      options.renderer,
      options.sessionManager,
      options.runtimeContext.session.id,
      options.runtimeContext.projectRoot,
    );
    options.renderer.renderLine(
      options.printMode
        ? "session-switch-required:use-/sessions-switch-<session-id>"
        : "Use /sessions switch <session-id> to explicitly switch session.",
    );
    if (!options.printMode) {
      options.renderer.renderLine("");
    }
    return;
  }

  try {
    const sessions = options.sessionManager.listRecentSessions(5);
    if (sessions.length === 0) {
      options.renderer.renderLine("\nNo sessions found.\n");
      return;
    }
    const panelResult = await openSessionsPanel({
      rl: options.rl,
      sessionManager: options.sessionManager,
      runtimeContext: options.runtimeContext as never,
    });
    if (panelResult.switchedSessionId) {
      trySwitchTo(panelResult.switchedSessionId);
    } else {
      options.renderer.renderLine("\nSessions panel closed.\n");
    }
  } catch (error) {
    options.renderer.renderLine(
      `\nSessions panel failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
  }
}

function renderSwitchedSessionContext(
  renderer: StreamingRenderer,
  sessionManager: SessionManager,
  sessionId: string,
): void {
  const summary = sessionManager.describeSessionReentry(sessionId);
  const title = summary.title?.trim() || "(untitled)";
  renderer.renderLine(`Session summary: ${title} [${summary.status}]`);
  if (summary.pendingPrompt?.trim()) {
    renderer.renderLine(
      `Resume cue: pending prompt "${truncate(summary.pendingPrompt.trim(), 140)}"`,
    );
  } else if (summary.lastUserMessage?.trim()) {
    renderer.renderLine(
      `Resume cue: last user request "${truncate(summary.lastUserMessage.trim(), 140)}"`,
    );
  }
  if (summary.terminalClassification || summary.terminalReason) {
    renderer.renderLine(
      `Last terminal: ${summary.terminalClassification ?? "unknown"}${summary.terminalReason ? ` (${summary.terminalReason})` : ""}`,
    );
  }
}

function renderPermissionsList(
  renderer: StreamingRenderer,
  trustPolicy: ApprovalTrustPolicy,
  projectRoot: string,
): void {
  const grants = trustPolicy.listGrants(projectRoot);
  const projectLabel = path.basename(projectRoot) || projectRoot;
  renderer.renderLine(`\nTrust policy grants @ ${projectLabel}`);
  if (grants.length === 0) {
    renderer.renderLine("- No persisted allow-always grants for this project.");
    renderer.renderLine("- Use /permissions reset all to clear global grants if needed.");
    renderer.renderLine("");
    return;
  }

  for (const [index, grant] of grants.entries()) {
    renderer.renderLine(
      `${index + 1}. ${grant.scopeLabel}  updated=${toRelativeTime(grant.updatedAt)}  key=${grant.scopeKey}`,
    );
  }
  renderer.renderLine(
    "Tip: /permissions revoke <index|scope-key> removes one rule, /permissions reset clears project rules.\n",
  );
}

function renderPermissionExplain(
  renderer: StreamingRenderer,
  trustPolicy: ApprovalTrustPolicy,
  projectRoot: string,
): void {
  const lastHit = trustPolicy.getLastHit();
  renderer.renderLine("\nTrust policy explain");
  if (!lastHit) {
    renderer.renderLine(
      "- No automatic approval hit has occurred in this shell yet.",
    );
    renderer.renderLine(
      "- After a cached allow or policy match, run /permissions explain again.",
    );
    renderer.renderLine("");
    return;
  }

  const sourceLabel =
    lastHit.source === "allow-always-policy"
      ? "persisted allow-always policy"
      : "allow-once cache (current shell run)";
  renderer.renderLine(`- Last hit source: ${sourceLabel}`);
  renderer.renderLine(`- Scope: ${lastHit.scopeLabel}`);
  renderer.renderLine(`- Rule key: ${lastHit.cacheKey}`);
  renderer.renderLine(
    `- Project match: ${normalizePathForCompare(lastHit.projectRoot) === normalizePathForCompare(projectRoot) ? "current project" : "different project"}`,
  );
  renderer.renderLine(`- When: ${toRelativeTime(lastHit.at)}`);
  renderer.renderLine("");
}

function toRelativeTime(iso: string): string {
  const updatedAt = new Date(iso).getTime();
  if (!Number.isFinite(updatedAt)) {
    return "unknown";
  }

  const deltaSeconds = Math.max(0, Math.floor((Date.now() - updatedAt) / 1000));
  if (deltaSeconds < 60) {
    return `${deltaSeconds}s ago`;
  }
  const deltaMinutes = Math.floor(deltaSeconds / 60);
  if (deltaMinutes < 60) {
    return `${deltaMinutes}m ago`;
  }
  const deltaHours = Math.floor(deltaMinutes / 60);
  if (deltaHours < 24) {
    return `${deltaHours}h ago`;
  }
  const deltaDays = Math.floor(deltaHours / 24);
  return `${deltaDays}d ago`;
}

function isWorkspaceInfoPrompt(prompt: string): boolean {
  const normalized = prompt.toLowerCase();
  const trimmed = prompt.trim();
  const hasQuestionShape =
    /[?？]$/.test(trimmed) ||
    normalized.startsWith("what ") ||
    normalized.startsWith("where ") ||
    /(?:\u4ec0\u4e48|\u54ea\u91cc|\u5728\u54ea|\u54ea\u4e2a)/u.test(prompt);

  if (!hasQuestionShape) {
    return false;
  }

  const englishPatterns = [
    /\b(current|working)\s+(directory|dir|cwd)\b/i,
    /\bwhere\s+am\s+i\b/i,
    /\bwhat\s+is\s+the\s+current\s+workspace\b/i,
  ];

  const cjkPatterns = [
    /\u5f53\u524d\u5de5\u4f5c\u76ee\u5f55/u,
    /\u73b0\u5728.*\u5de5\u4f5c\u76ee\u5f55/u,
    /\u5f53\u524d\u76ee\u5f55/u,
    /\u5f53\u524d\u5de5\u4f5c\u533a/u,
  ];

  if (englishPatterns.some((pattern) => pattern.test(normalized))) {
    return true;
  }
  if (cjkPatterns.some((pattern) => pattern.test(prompt))) {
    return true;
  }

  return false;
}

function isWorkspaceInfoPromptStrict(prompt: string): boolean {
  const normalized = prompt.toLowerCase();
  const trimmed = prompt.trim();
  const hasQuestionShape =
    /[?？]$/.test(trimmed) ||
    normalized.startsWith("what ") ||
    normalized.startsWith("where ") ||
    /\b(what|where)\b/i.test(normalized) ||
    /(?:\u4ec0\u4e48|\u54ea\u91cc|\u5728\u54ea|\u54ea\u4e2a)/u.test(prompt);
  if (!hasQuestionShape) {
    return false;
  }

  const workspaceTerms =
    /\b(current|working)\s+(directory|dir|cwd)\b/i.test(normalized) ||
    /\bwhere\s+am\s+i\b/i.test(normalized) ||
    /\bwhat\s+is\s+the\s+current\s+workspace\b/i.test(normalized) ||
    /(?:\u5f53\u524d|\u73b0\u5728).*(?:\u5de5\u4f5c\u76ee\u5f55|\u76ee\u5f55|\u5de5\u4f5c\u533a)/u.test(
      prompt,
    );
  if (!workspaceTerms) {
    return false;
  }

  const hasMutationIntent =
    /\b(write|create|generate|save|edit|modify|update|fix|replace|patch)\b/i.test(
      normalized,
    ) ||
    /(?:\u5199|\u521b\u5efa|\u751f\u6210|\u4fdd\u5b58|\u4fee\u6539|\u66f4\u65b0|\u4fee\u590d|\u66ff\u6362)/u.test(
      prompt,
    );
  return !hasMutationIntent;
}

function shouldAllowRepoAwareRouting(prompt: string): boolean {
  const trimmed = prompt.trim();
  if (!trimmed) {
    return false;
  }
  const normalized = trimmed.toLowerCase();
  const hasExplicitRepoTaskCue =
    /\b(read|inspect|open|show|summari[sz]e|explain|edit|write|modify|fix|patch|test|build|lint|repo|repository|directory|files?)\b/i.test(
      normalized,
    ) ||
    /(?:读取|查看|检查|总结|解释|修改|编辑|写|修复|测试|构建|编译|仓库|目录|文件|改动|变化)/u.test(
      trimmed,
    ) ||
    /(?:[A-Za-z]:\\|\.{0,2}\/|\\|\/).+\.\w+/u.test(trimmed);
  if (hasExplicitRepoTaskCue) {
    return true;
  }

  const isConversational =
    /\b(you|i|we|understand|plan first|don't execute|do not execute|just answer|chat)\b/i.test(
      normalized,
    ) ||
    /(?:你|我|我们|先别执行|不要执行|先说计划|普通聊天|直接回答)/u.test(trimmed);
  if (isConversational) {
    return false;
  }

  return false;
}

function normalizeRepoAwareClause(clause: string): string {
  const trimmed = clause.trim();
  if (!trimmed) {
    return trimmed;
  }
  if (
    /(?:检查|看看|看一下|帮我看看).*(?:目录|仓库|repo).*(?:改动|变化|状态)/u.test(
      trimmed,
    )
  ) {
    return "看看这个仓库现在什么情况";
  }
  if (/^(?:帮我看看哪些文件改了|这个目录最近改了什么)$/u.test(trimmed)) {
    return "这个 repo 改动主要集中在哪";
  }
  return trimmed;
}

function decomposeQueryClauses(prompt: string): string[] {
  const trimmed = prompt.trim();
  if (!trimmed) {
    return [];
  }
  const firstPass = trimmed
    .split(/(?<=[。！？?!;；])\s*/u)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  const secondPass: string[] = [];
  for (const part of firstPass) {
    const splitParts = part
      .split(
        /\s*,\s*(?=(?:then|and then|after that|next|finally)\b)|，\s*(?=(?:然后|接着|再|最后|那就|并且|并且再))/iu,
      )
      .map((seg) => seg.trim())
      .filter((seg) => seg.length > 0);
    secondPass.push(...splitParts);
  }
  return secondPass.length > 0 ? secondPass : [trimmed];
}

function isActionContinuationClause(clause: string): boolean {
  const normalized = clause.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return (
    /^(?:then\s+)?(?:continue|go on|keep going|resume|proceed|fix it|do that|do it|continue with that|then fix|then continue|then do that|then do it)\b/i.test(
      normalized,
    ) ||
    /^(?:那就|然后|接着|再)?\s*(?:继续|继续修|继续做|继续处理|按这个继续|继续读取|继续解释|继续总结)(?:吧|一下)?$/u.test(
      clause.trim(),
    ) ||
    /(?:继续修|继续做|继续处理|继续读取|继续解释|继续总结|then continue|then fix|continue fixing|continue reading|continue explaining)/i.test(
      normalized,
    )
  );
}

function preparePromptForExecution(options: {
  prompt: string;
  sessionId: string;
  sessionManager: SessionManager;
}): PromptPreparationResult {
  const normalized = canonicalizeGroundedPrompt(
    normalizePromptForExecution(options.prompt),
  );
  const integrity = evaluatePromptIntegrity(normalized);
  if (integrity.ok === false) {
    return { kind: "blocked", reason: integrity.reason };
  }

  const continuity = options.sessionManager.buildPromptContinuitySnapshot(
    options.sessionId,
    integrity.prompt,
  );
  const contextualizedPrompt = contextualizeReadContinuationPrompt(
    integrity.prompt,
    continuity,
  );

  if (isTerseFollowUpPrompt(contextualizedPrompt)) {
    const grounded = groundTerseFollowUpPrompt({
      prompt: contextualizedPrompt,
      sessionId: options.sessionId,
      sessionManager: options.sessionManager,
      continuity,
    });
    if (grounded.kind === "blocked") {
      return grounded;
    }
    return { kind: "ready", prompt: grounded.prompt };
  }

  return { kind: "ready", prompt: contextualizedPrompt };
}

function canonicalizeGroundedPrompt(prompt: string): string {
  const trimmed = prompt.trim();
  if (!trimmed) {
    return trimmed;
  }

  const summarizeMatch = trimmed.match(
    /^(?:\u8bf7)?(?:\u603b\u7ed3|\u6982\u62ec|\u6458\u8981)(?:\u4e00\u4e0b)?\s+(.+?)\s*(?:\u6587\u4ef6\u5185\u5bb9|\u5185\u5bb9)?$/u,
  );
  if (summarizeMatch?.[1]) {
    return `summarize ${summarizeMatch[1].trim()}`;
  }

  const readFirstMatch = trimmed.match(
    /^(?:\u8bf7)?(?:\u8bfb\u53d6|\u8bfb)\s+(.+?)\s*\u524d\s*([\d\u4e00\u4e8c\u4e24\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341]+)\s*\u884c$/u,
  );
  if (readFirstMatch?.[1] && readFirstMatch?.[2]) {
    const count = parseLineCountToken(readFirstMatch[2]);
    if (count) {
      return `read first ${count} lines of ${readFirstMatch[1].trim()}`;
    }
  }

  const readFromLineMatch = trimmed.match(
    /^(?:\u8bf7)?\u4ece\u7b2c\s*([\d\u4e00\u4e8c\u4e24\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341]+)\s*\u884c\u5f00\u59cb\u8bfb\s*([\d\u4e00\u4e8c\u4e24\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341]+)\s*\u884c$/u,
  );
  if (readFromLineMatch?.[1] && readFromLineMatch?.[2]) {
    const startLine = parseLineCountToken(readFromLineMatch[1]);
    const count = parseLineCountToken(readFromLineMatch[2]);
    if (startLine && count) {
      return `read ${count} lines from line ${startLine}`;
    }
  }

  const continueReadMatch = trimmed.match(
    /^(?:\u8bf7)?(?:\u7ee7\u7eed\u8bfb\u53d6|\u7ee7\u7eed\u8bfb|\u518d\u8bfb)(?:\u540e|\u4e0b\u4e00\u6bb5|\u4e0b)?\s*([\d\u4e00\u4e8c\u4e24\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341]+)?\s*(?:\u884c|\u6bb5)?$/u,
  );
  if (continueReadMatch) {
    const count = continueReadMatch[1]
      ? parseLineCountToken(continueReadMatch[1])
      : undefined;
    return count
      ? `continue reading next ${count} lines`
      : "continue reading";
  }

  const explainPartMatch = trimmed.match(
    /^(?:\u8bf7)?(?:\u89e3\u91ca|\u8bf4\u660e)(?:\u8fd9\u90e8\u5206|\u8fd9\u4e00\u6bb5|\u521a\u624d\u90a3\u51e0\u884c)(?:\u5728\u505a\u4ec0\u4e48|\u662f\u4ec0\u4e48\u610f\u601d)?$/u,
  );
  if (explainPartMatch) {
    return "explain this part";
  }

  const explainFileMatch = trimmed.match(
    /^(?:\u8bf7)?(?:\u89e3\u91ca|\u8bf4\u660e)\s+(.+?)\s*(?:\u5728\u505a\u4ec0\u4e48|\u505a\u4ec0\u4e48|\u662f\u4ec0\u4e48\u610f\u601d)?$/u,
  );
  if (explainFileMatch?.[1]) {
    return `explain ${explainFileMatch[1].trim()}`;
  }

  return trimmed;
}

function parseLineCountToken(token: string): number | undefined {
  const normalized = token.trim();
  if (!normalized) {
    return undefined;
  }
  if (/^\d+$/u.test(normalized)) {
    const parsed = Number.parseInt(normalized, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }
  const map: Record<string, number> = {
    "\u4e00": 1,
    "\u4e8c": 2,
    "\u4e24": 2,
    "\u4e09": 3,
    "\u56db": 4,
    "\u4e94": 5,
    "\u516d": 6,
    "\u4e03": 7,
    "\u516b": 8,
    "\u4e5d": 9,
    "\u5341": 10,
  };
  if (normalized === "\u5341") {
    return 10;
  }
  if (normalized.startsWith("\u5341")) {
    const ones = map[normalized.slice(1)];
    return ones ? 10 + ones : undefined;
  }
  if (normalized.endsWith("\u5341")) {
    const tens = map[normalized.slice(0, -1)];
    return tens ? tens * 10 : undefined;
  }
  if (normalized.includes("\u5341")) {
    const [tensPart, onesPart] = normalized.split("\u5341");
    const tens = map[tensPart];
    const ones = map[onesPart];
    if (tens && ones !== undefined) {
      return tens * 10 + ones;
    }
  }
  return map[normalized];
}

function evaluatePromptIntegrity(prompt: string):
  | { ok: true; prompt: string }
  | { ok: false; reason: string } {
  const trimmed = prompt.trim();
  if (!trimmed) {
    return {
      ok: false,
      reason:
        "Prompt is empty after normalization. Provide a valid instruction.",
    };
  }

  const containsReplacementChar = trimmed.includes("\uFFFD");
  const mostlyQuestionMarks =
    trimmed.length >= 4 && /^[?？\uFFFD\s]+$/u.test(trimmed);
  const hasCjk = /[\u3400-\u9FFF]/u.test(trimmed);
  const hasAsciiWord = /[A-Za-z0-9]/.test(trimmed);
  const severeMojibakeSignal = /(?:\u00C3.|\u00E2.|\uFFFD{2,})/u.test(trimmed);

  if (
    containsReplacementChar ||
    mostlyQuestionMarks ||
    (severeMojibakeSignal && !hasCjk && !hasAsciiWord)
  ) {
    return {
      ok: false,
      reason:
        "Input appears corrupted (encoding/transport issue). Please resend the prompt with UTF-8 stdin (or run in --print/interactive mode) and avoid mojibake text.",
    };
  }

  return { ok: true, prompt: trimmed };
}

function isTerseFollowUpPrompt(prompt: string): boolean {
  const normalized = prompt
    .trim()
    .toLowerCase()
    .replace(/[。！？!?.\s]+$/gu, "")
    .replace(/\s+/g, " ");
  if (!normalized) {
    return false;
  }

  const terse = new Set([
    "then",
    "then?",
    "then now",
    "go on",
    "go on?",
    "so",
    "so?",
    "continue",
    "continue?",
    "and then",
    "继续",
    "然后呢",
    "然后",
    "接着",
    "接下来呢",
    "继续呢",
  ]);
  if (terse.has(normalized)) {
    return true;
  }

  return /^(then|go on|so|continue)\??$/i.test(normalized);
}

function groundTerseFollowUpPrompt(options: {
  prompt: string;
  sessionId: string;
  sessionManager: SessionManager;
  continuity?: SessionContinuitySnapshot;
}): PromptPreparationResult {
  const snapshot =
    options.continuity ??
    options.sessionManager.buildPromptContinuitySnapshot(
      options.sessionId,
      options.prompt,
    );
  if (!snapshot) {
    return {
      kind: "blocked",
      reason:
        "No active continuation context is available for this short follow-up. Please specify the target/task explicitly.",
    };
  }

  const hasActionableContext =
    Boolean(snapshot.lastTaskKind) ||
    Boolean(snapshot.lastGroundedDeliverableMode) ||
    snapshot.recentTargetFiles.length > 0 ||
    snapshot.recentChangedFiles.length > 0;
  if (!hasActionableContext) {
    return {
      kind: "blocked",
      reason:
        "Continuation context is too weak for a terse follow-up. Please include the file or task you want to continue.",
    };
  }

  return {
    kind: "ready",
    prompt: buildGroundedTerseFollowUpPrompt(options.prompt.trim(), snapshot),
  };
}

function buildGroundedTerseFollowUpPrompt(
  prompt: string,
  snapshot: SessionContinuitySnapshot,
): string {
  const targetHint = snapshot.recentTargetFiles[0]
    ? ` Target file: ${snapshot.recentTargetFiles[0]}.`
    : "";
  if (snapshot.lastGroundedDeliverableMode === "read") {
    const readCount = snapshot.lastReadWindowSize ?? snapshot.lastReadDeliveredLines ?? 2;
    return `Continue reading the same file window with active continuity.${targetHint} Continue reading next ${readCount} lines. User follow-up: ${prompt}`;
  }
  if (snapshot.lastGroundedDeliverableMode === "summary") {
    return `Continue the same grounded summary for the same target.${targetHint} Provide the next concise summary refinement. User follow-up: ${prompt}`;
  }
  if (snapshot.lastGroundedDeliverableMode === "explain") {
    return `Continue the same grounded explanation for the same target.${targetHint} Extend the explanation without changing target scope. User follow-up: ${prompt}`;
  }
  return `Continue the current task using active continuity context.${targetHint} User follow-up: ${prompt}`;
}

function contextualizeReadContinuationPrompt(
  prompt: string,
  continuity?: SessionContinuitySnapshot,
): string {
  if (!continuity) {
    return prompt;
  }
  const normalized = prompt.trim().toLowerCase();
  const continuationMatch = normalized.match(
    /^(?:continue reading(?: next)?|\u7ee7\u7eed\u8bfb\u53d6(?:\u540e)?|\u7ee7\u7eed\u8bfb(?:\u540e)?|\u518d\u8bfb(?:\u540e)?)(?:\s*([\d\u4e00\u4e8c\u4e24\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341]+))?(?:\s*lines?|\u884c|\u6bb5)?$/,
  );
  if (!continuationMatch) {
    return prompt;
  }
  const target = continuity.recentTargetFiles[0];
  const lastEnd = continuity.lastReadWindowEnd;
  if (!target || lastEnd === undefined) {
    return prompt;
  }
  const requestedCount = continuationMatch[1]
    ? parseLineCountToken(continuationMatch[1])
    : undefined;
  const count =
    requestedCount && Number.isFinite(requestedCount)
      ? requestedCount
      : (continuity.lastReadWindowSize ?? continuity.lastReadDeliveredLines ?? 2);
  const start = Math.max(1, lastEnd + 1);
  return `read ${count} lines from line ${start} of ${target}`;
}

function normalizePromptForExecution(prompt: string): string {
  return prompt.replace(/\u0000/g, "").replace(/\r\n/g, "\n").trim();
}
function truncate(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max)}...`;
}

function normalizePathForCompare(value: string): string {
  return path.resolve(value).toLowerCase();
}

function resolveRuntimeProjectRoot(
  baseCwd: string,
  requestedProjectPath: string,
): {
  projectRoot: string;
  gitContext: ReturnType<typeof getWorkflowGitContext>;
} {
  const requestedPath = requestedProjectPath.trim();
  if (!requestedPath) {
    throw new Error("Project path cannot be empty.");
  }

  const resolvedPath = path.resolve(baseCwd, requestedPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Target project does not exist: ${resolvedPath}`);
  }

  const stat = fs.statSync(resolvedPath);
  if (!stat.isDirectory()) {
    throw new Error(`Target project must be a directory: ${resolvedPath}`);
  }

  const gitContext = getWorkflowGitContext(resolvedPath);
  const projectRoot = gitContext.root ?? resolvedPath;
  return {
    projectRoot,
    gitContext,
  };
}

function resolveTargetProjectRoot(
  launchCwd: string,
  requestedProjectPath?: string,
): string {
  if (!requestedProjectPath?.trim()) {
    return launchCwd;
  }

  const resolvedPath = path.resolve(launchCwd, requestedProjectPath.trim());
  if (!fs.existsSync(resolvedPath)) {
    console.error(`Target project does not exist: ${resolvedPath}`);
    process.exit(1);
  }

  const stat = fs.statSync(resolvedPath);
  if (!stat.isDirectory()) {
    console.error(`Target project must be a directory: ${resolvedPath}`);
    process.exit(1);
  }

  return resolvedPath;
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
