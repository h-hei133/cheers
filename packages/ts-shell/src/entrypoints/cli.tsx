#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import * as readline from "node:readline";
import { getRuntimeConfig } from "../config/runtimeConfig.js";
import { routeSlashCommand } from "../core/commands/slashRouter.js";
import type { ShellActionResult } from "../core/commands/types.js";
import { CoreMcpGateway } from "../core/mcp/gateway.js";
import type { McpClientSnapshot } from "../core/mcp/types.js";
import type { QueryRuntimeStateSeed } from "../core/query/runtimeState.js";
import { ApprovalTrustPolicy } from "../core/shell/approvalTrustPolicy.js";
import {
  bootstrapShellRuntime,
  SessionBootstrapError,
} from "../core/shell/bootstrap.js";
import { applyInteractiveApprovalDecisionWiring } from "../core/shell/interactiveApprovalWiring.js";
import {
  resolveProviderCredential,
  type ProviderCredentialResolution,
} from "../core/shell/providerCredentials.js";
import {
  checkRealProviderReadiness,
  createProviderReadinessTerminalEvent,
} from "../core/shell/providerReadiness.js";
import {
  resolveSessionReference,
  resumeShellSession,
} from "../core/shell/recovery.js";
import { resolveRepoAwarePromptResponse } from "../core/shell/repoAwareRouting.js";
import { switchActiveSession } from "../core/shell/runtimeContext.js";
import { ShellSessionRuntime } from "../core/shell/sessionRuntime.js";
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
import type {
  ApprovalAuditMemoryState,
  RecoveryTrustBoundaryBlock,
  SessionContinuitySnapshot,
  SessionReentrySummary,
} from "../session/SessionManager.js";
import { SessionManager } from "../session/SessionManager.js";
import { getWorkflowGitContext } from "../workflow/gitContext.js";
import { openSessionsPanel } from "./sessionsPanel.js";

interface CliOptions {
  sessionId?: string;
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
  migrateSessionRoot?: boolean;
  nonInteractiveApproval?: "deny" | "allow-once" | "allow-always";
}

type StdinTransportMode = "none" | "capture-batch" | "stream-live";

type SlashRouteResult = Awaited<ReturnType<typeof routeSlashCommand>>;
type ResumeLikeShellAction = ShellActionResult & {
  action: "resume-session" | "continue-session";
};
type TurnInputResolution =
  | { kind: "handled" }
  | {
      kind: "shell-action";
      slashResult: Extract<SlashRouteResult, { kind: "shell-action" }>;
    }
  | { kind: "execute"; effectivePrompt: string };

interface ApprovalModeObject {
  readonly mode: "deny" | "allow-once" | "allow-always";
  readonly persistent: boolean;
  readonly source:
    | "prompt-explicit-verify-lineage"
    | "prompt-ambiguous-verify-lineage";
  readonly verifyLineage: "blocked-verify-resume";
  readonly command?: string;
  readonly commandCwd?: string;
  readonly targetPath?: string;
  readonly executableNow: boolean;
  readonly missingFields: readonly string[];
}

type ApprovalDecisionSource =
  | "cli-policy"
  | "approval-mode-object"
  | "allow-once-cache"
  | "allow-always-policy"
  | "default-deny"
  | "ambiguous-stop";

interface NonInteractiveApprovalDecisionPlan {
  readonly source: ApprovalDecisionSource;
  readonly decision?: "deny" | "allow-once" | "allow-always";
  readonly stopReason?: string;
  readonly overrideNotes: readonly string[];
}

interface ApprovalModeConflictAnalysis {
  readonly ambiguousStop: boolean;
  readonly stopReason?: string;
}

interface ApprovalAuditRecord {
  readonly channel: "interactive" | "non-interactive";
  readonly decision: "deny" | "allow-once" | "allow-always";
  readonly decisionSource: string;
  readonly persistent: boolean;
  readonly cacheEffect:
    | "none"
    | "allow-once-cache-consumed"
    | "allow-always-persisted"
    | "allow-always-cache-hit"
    | "ambiguous-stop";
  readonly projectRoot: string;
  readonly cacheKey: string;
  readonly scopeLabel: string;
  readonly lineage?: string;
  readonly inputKey?: string;
  readonly stopReason?: string;
}

function analyzeApprovalModeConflict(
  approvalModeObject?: ApprovalModeObject,
): ApprovalModeConflictAnalysis {
  if (!approvalModeObject) {
    return { ambiguousStop: false };
  }
  if (approvalModeObject.source === "prompt-ambiguous-verify-lineage") {
    return {
      ambiguousStop: true,
      stopReason:
        "Conflicting prompt approval signals (allow-once vs allow-always) for blocked verify continuation.",
    };
  }
  if (!approvalModeObject.executableNow) {
    return {
      ambiguousStop: true,
      stopReason: `Approval mode cannot be applied safely for blocked verify continuation: missing ${approvalModeObject.missingFields.join(", ")}.`,
    };
  }
  return { ambiguousStop: false };
}

function renderApprovalAuditRecord(
  renderer: StreamingRenderer,
  record: ApprovalAuditRecord,
): void {
  renderer.renderLine("approval-audit:event=decision");
  renderer.renderLine(`approval-audit:channel=${record.channel}`);
  renderer.renderLine(`approval-audit:decision=${record.decision}`);
  renderer.renderLine(
    `approval-audit:decision-source=${record.decisionSource}`,
  );
  renderer.renderLine(
    `approval-audit:persistent=${record.persistent ? "true" : "false"}`,
  );
  renderer.renderLine(`approval-audit:cache-effect=${record.cacheEffect}`);
  renderer.renderLine(`approval-audit:project-root=${record.projectRoot}`);
  renderer.renderLine(`approval-audit:cache-key=${record.cacheKey}`);
  renderer.renderLine(`approval-audit:scope=${record.scopeLabel}`);
  if (record.lineage) {
    renderer.renderLine(`approval-audit:lineage=${record.lineage}`);
  }
  if (record.inputKey) {
    renderer.renderLine(`approval-audit:input-key=${record.inputKey}`);
  }
  if (record.stopReason) {
    renderer.renderLine(`approval-audit:stop-reason=${record.stopReason}`);
  }
}

async function main(): Promise<void> {
  setGlobalTraceContext(createTraceContext());
  const logger = createComponentLogger("cli");
  const args = process.argv.slice(2);
  const launchCwd = process.cwd();
  const approvalTrustPolicy = new ApprovalTrustPolicy();
  let activeNonInteractiveApprovalMode: ApprovalModeObject | undefined;
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
    const positionalProject = positionalArgs.find((arg) => /[\\/]/.test(arg));
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
      console.error(
        "Missing value for --replay-file. Example: --replay-file .\\replay.txt",
      );
      process.exit(1);
    }
    options.replayFile = replayPath;
  }
  options.printMode = args.includes("--print") || args.includes("-p");
  options.migrateSessionRoot = args.includes("--migrate-session-root");
  options.nonInteractiveApproval = parseNonInteractiveApprovalMode(args);
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
  const bootstrap = (() => {
    try {
      return bootstrapShellRuntime({
        cwd: workspaceRoot,
        launchCwd,
        runtimeConfig,
        gitContext,
        sessionManager,
        renderer,
        requestedSessionId: options.sessionId,
        allowSessionRootMigration: options.migrateSessionRoot === true,
        emitLifecycleMessages: false,
      });
    } catch (error) {
      if (error instanceof SessionBootstrapError) {
        console.error(error.message);
        console.error(error.recoveryHint);
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
  const showStartupSurface =
    !options.printMode &&
    !options.replayFile &&
    nonInteractivePrompts.length === 0 &&
    stdinTransportMode !== "capture-batch";

  if (showStartupSurface) {
    renderStartupSurface(renderer, {
      runtimeContext: runtimeContext as never,
      sessionManager,
      lifecycleNotices: bootstrap.lifecycleNotices,
      recoveryCandidate,
      recoveryCandidateSummary: recoveryCandidateSummary ?? undefined,
      recoveryBlockedNotice: recoveryBlockedNotice ?? undefined,
      provider: resolvedCredential.provider,
      model: resolvedCredential.model,
      maxTurns: runtimeContext.runtimeConfig.maxTurns,
      executionPath: isRustDaemonEnabled() ? "rust-daemon" : "ts-local",
      stdinTransportMode,
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
      printMode: Boolean(options.printMode),
      fallbackSessionId: recoveryCandidate?.id,
      setActiveNonInteractiveApprovalMode: (mode) => {
        activeNonInteractiveApprovalMode = mode;
      },
      nonInteractiveCliApprovalMode: options.nonInteractiveApproval,
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
      setActiveNonInteractiveApprovalMode: (mode) => {
        activeNonInteractiveApprovalMode = mode;
      },
      nonInteractiveCliApprovalMode: options.nonInteractiveApproval,
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
      pipedInput !== null &&
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
        setActiveNonInteractiveApprovalMode: (mode) => {
          activeNonInteractiveApprovalMode = mode;
        },
        nonInteractiveCliApprovalMode: options.nonInteractiveApproval,
      });
    }
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
        renderer.renderLine("");
        renderer.renderLine(`Current working directory: ${runtimeContext.cwd}`);
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
        renderer,
        printMode: false,
        interactive: true,
      });
      if (resolved.kind === "handled") {
        rl.prompt();
        return;
      }
      const slashResult =
        resolved.kind === "shell-action" ? resolved.slashResult : null;

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
          setActiveNonInteractiveApprovalMode: (mode) => {
            activeNonInteractiveApprovalMode = mode;
          },
        });
        interactiveTurnNumber = resumeBridge.turnNumber;
        mcpGateway = new CoreMcpGateway(runtimeContext.cwd);
        refreshInteractivePromptChrome();
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
        const sessionAction = slashResult.sessionAction ?? "panel";
        if (sessionAction === "list") {
          renderSessionList(
            renderer,
            sessionManager,
            runtimeContext.session.id,
            runtimeContext.projectRoot,
          );
          rl.prompt();
          return;
        }

        if (sessionAction === "current") {
          renderCurrentSession(renderer, sessionManager, runtimeContext);
          renderSessionCommandMap(renderer, { compact: true });
          rl.prompt();
          return;
        }

        if (sessionAction === "switch") {
          const targetSessionReference = slashResult.sessionId?.trim();
          if (!targetSessionReference) {
            renderer.renderLine(
              "\nUsage: /sessions switch <id|prefix|title|last>\n",
            );
            rl.prompt();
            return;
          }

          const resolvedSessionId = resolveSwitchSessionReference({
            renderer,
            sessionManager,
            preferredProjectRoot: runtimeContext.projectRoot,
            reference: targetSessionReference,
            printMode: false,
          });
          if (!resolvedSessionId) {
            rl.prompt();
            return;
          }

          try {
            const resumed = sessionManager.resume(resolvedSessionId);
            const previousSessionId = runtimeContext.session.id;
            switchRuntimeSessionProjectContext(runtimeContext, resumed);
            mcpGateway = new CoreMcpGateway(runtimeContext.cwd);
            renderer.renderLine(
              `\nSwitched session: ${previousSessionId} -> ${resumed.id}\n`,
            );
            renderer.renderLine(
              `Project context: ${runtimeContext.projectRoot}`,
            );
            renderSwitchedSessionContext(renderer, sessionManager, resumed.id);
            renderSessionCommandMap(renderer, { compact: true });
            renderer.renderLine("");
            refreshInteractivePromptChrome();
          } catch (error) {
            renderer.renderLine(
              `\nFailed to switch session: ${error instanceof Error ? error.message : String(error)}\n`,
            );
          }
          rl.prompt();
          return;
        }

        if (sessionAction === "help") {
          renderSessionCommandMap(renderer);
          rl.prompt();
          return;
        }

        try {
          const sessions = sessionManager.listRecentSessions(5);
          if (sessions.length === 0) {
            renderer.renderLine("\nNo sessions found.\n");
            rl.prompt();
            return;
          }
          const panelResult = await openSessionsPanel({
            rl,
            sessionManager,
            runtimeContext,
          });
          if (panelResult.switchedSessionId) {
            const resumed = sessionManager.resume(
              panelResult.switchedSessionId,
            );
            switchRuntimeSessionProjectContext(runtimeContext, resumed);
            mcpGateway = new CoreMcpGateway(runtimeContext.cwd);
            renderer.renderLine(
              `\nSwitched to session ${panelResult.switchedSessionId}.\n`,
            );
            renderer.renderLine(
              `Project context: ${runtimeContext.projectRoot}`,
            );
            renderSwitchedSessionContext(
              renderer,
              sessionManager,
              panelResult.switchedSessionId,
            );
            renderer.renderLine("");
            refreshInteractivePromptChrome();
          } else {
            renderer.renderLine("\nSessions panel closed.\n");
          }
        } catch (error) {
          renderer.renderLine(
            `\nSessions panel failed: ${error instanceof Error ? error.message : String(error)}\n`,
          );
        }
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
            renderer.renderLine("\nUsage: /workspace attach <path>\n");
            rl.prompt();
            return;
          }

          try {
            const attached = resolveRuntimeProjectRoot(
              runtimeContext.cwd,
              attachTarget,
            );
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

            const attachedSession = sessionManager.createNew(
              attached.projectRoot,
            );
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
            refreshInteractivePromptChrome();
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
          renderer.renderLine(
            "Try /mcp refresh all to reload server connections.\n",
          );
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
        renderer.renderLine(`\nCurrent agent mode: ${activeMode}`);
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
        refreshInteractivePromptChrome();
        renderer.renderLine(`\nAgent mode updated to ${nextMode}.`);
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
    abortSignal: signal,
    escalationPromptHandler,
    providerMode,
    maxTurns,
    realProvider: providerCredentialResolution.credential,
    agentMode,
    runtimeSeed,
  })) {
    yield event;
  }
}

function createCliEscalationPromptHandler(
  renderer: StreamingRenderer,
  rl: readline.Interface | null,
  getViewMode: () => "compact" | "verbose",
  trustPolicy: ApprovalTrustPolicy,
  getProjectRoot: () => string,
  getNonInteractiveDecision?: () =>
    | "deny"
    | "allow-once"
    | "allow-always"
    | undefined,
  getApprovalModeObject?: () => ApprovalModeObject | undefined,
  persistApprovalAudit?: (record: ApprovalAuditRecord) => void,
): (prompt: EscalationPrompt) => Promise<EscalationResponse> {
  function emitApprovalAudit(record: ApprovalAuditRecord): void {
    renderApprovalAuditRecord(renderer, record);
    persistApprovalAudit?.(record);
  }

  function resolveNonInteractiveApprovalDecision(input: {
    cliDecision?: "deny" | "allow-once" | "allow-always";
    approvalModeObject?: ApprovalModeObject;
    hasAllowOnceCache: boolean;
    hasAllowAlwaysGrant: boolean;
  }): NonInteractiveApprovalDecisionPlan {
    const overrideNotes: string[] = [];
    const hasCachedGrant = input.hasAllowOnceCache || input.hasAllowAlwaysGrant;
    if (input.cliDecision) {
      if (input.approvalModeObject) {
        if (input.approvalModeObject.mode !== input.cliDecision) {
          overrideNotes.push(
            `Prompt approval-mode object (${input.approvalModeObject.mode}) is overridden by explicit CLI policy (${input.cliDecision}).`,
          );
        } else {
          overrideNotes.push(
            "Prompt approval-mode object is present; explicit CLI policy remains the source of truth.",
          );
        }
      }
      if (hasCachedGrant) {
        overrideNotes.push(
          "Cached grant is present but overridden by explicit non-interactive policy.",
        );
      }
      if (
        input.approvalModeObject &&
        (input.approvalModeObject.source ===
          "prompt-ambiguous-verify-lineage" ||
          !input.approvalModeObject.executableNow)
      ) {
        overrideNotes.push(
          "Prompt approval-mode signal is not safely executable and is overridden by explicit CLI policy.",
        );
      }
      return {
        source: "cli-policy",
        decision: input.cliDecision,
        overrideNotes,
      };
    }

    if (input.approvalModeObject) {
      const conflict = analyzeApprovalModeConflict(input.approvalModeObject);
      if (conflict.ambiguousStop) {
        return {
          source: "ambiguous-stop",
          stopReason: conflict.stopReason,
          overrideNotes,
        };
      }
      if (hasCachedGrant) {
        overrideNotes.push(
          "Prompt approval-mode object overrides cached grant for this blocked verify continuation.",
        );
      }
      return {
        source: "approval-mode-object",
        decision: input.approvalModeObject.mode,
        overrideNotes,
      };
    }

    if (input.hasAllowOnceCache) {
      return {
        source: "allow-once-cache",
        decision: "allow-once",
        overrideNotes,
      };
    }
    if (input.hasAllowAlwaysGrant) {
      return {
        source: "allow-always-policy",
        decision: "allow-always",
        overrideNotes,
      };
    }
    return {
      source: "default-deny",
      decision: "deny",
      overrideNotes,
    };
  }

  return async (prompt) => {
    const projectRoot = getProjectRoot();
    const evaluation = trustPolicy.evaluate(prompt, projectRoot);
    const isNonInteractive = rl === null;
    const cliNonInteractiveDecision = isNonInteractive
      ? getNonInteractiveDecision?.()
      : undefined;
    const approvalModeObject = getApprovalModeObject?.();
    const hasAllowOnceCache = trustPolicy.hasAllowOnce(evaluation.cacheKey);
    const hasAllowAlwaysGrant = Boolean(evaluation.matchedGrant);
    const hasCachedGrant = hasAllowOnceCache || hasAllowAlwaysGrant;

    if (isNonInteractive) {
      const nonInteractiveDecisionPlan = resolveNonInteractiveApprovalDecision({
        cliDecision: cliNonInteractiveDecision,
        approvalModeObject,
        hasAllowOnceCache,
        hasAllowAlwaysGrant,
      });
      renderApprovalHeader(renderer, "approval-required");
      renderer.renderLine(`- Tool: ${prompt.context.toolName}`);
      renderer.renderLine(`- Action: ${prompt.context.operation}`);
      renderer.renderLine(`- Target: ${prompt.context.target}`);
      renderer.renderLine(`- Risk: ${prompt.severity}`);
      renderer.renderLine(
        `- Decision source: ${nonInteractiveDecisionPlan.source}`,
      );
      for (const note of nonInteractiveDecisionPlan.overrideNotes) {
        renderer.renderLine(`- ${note}`);
      }
      if (approvalModeObject) {
        renderer.renderLine(
          `Non-interactive approval object: mode=${approvalModeObject.mode}, lineage=${approvalModeObject.verifyLineage}, persistent=${approvalModeObject.persistent ? "yes" : "no"}`,
        );
      }
      if (nonInteractiveDecisionPlan.source === "ambiguous-stop") {
        const stopReason =
          nonInteractiveDecisionPlan.stopReason ??
          "Approval mode is ambiguous.";
        renderer.renderLine(stopReason);
        renderer.renderLine(
          "Resolve approval conflict explicitly with --non-interactive-approval deny|allow-once|allow-always.",
        );
        emitApprovalAudit({
          channel: "non-interactive",
          decision: "deny",
          decisionSource: "ambiguous-stop",
          persistent: false,
          cacheEffect: "ambiguous-stop",
          projectRoot,
          cacheKey: evaluation.cacheKey,
          scopeLabel: evaluation.scopeLabel,
          lineage: approvalModeObject?.verifyLineage,
          stopReason,
        });
        renderer.renderLine("");
        return {
          promptId: prompt.id,
          decision: "deny",
          respondedAt: Date.now(),
          userComment: `CLI non-interactive approval blocked: ${stopReason}`,
        };
      }
      const resolvedDecision = nonInteractiveDecisionPlan.decision ?? "deny";
      renderer.renderLine(
        `Non-interactive approval policy: ${resolvedDecision}${cliNonInteractiveDecision !== undefined ? " (explicit CLI)" : nonInteractiveDecisionPlan.source === "approval-mode-object" ? " (prompt approval-mode-object)" : hasCachedGrant ? " (cached grant)" : " (default deny)"}`,
      );
      if (resolvedDecision === "allow-once") {
        renderer.renderLine(
          "Allow-once applied to this execution only (non-persistent).",
        );
      }
      if (resolvedDecision === "allow-always") {
        const persisted = trustPolicy.rememberAllowAlways(prompt, projectRoot);
        renderer.renderLine(
          `Trust policy updated: ${persisted.scopeLabel} @ ${path.basename(projectRoot) || projectRoot}`,
        );
      }
      if (nonInteractiveDecisionPlan.source === "allow-once-cache") {
        trustPolicy.recordLastHit({
          source: "allow-once-cache",
          projectRoot,
          scopeLabel: evaluation.scopeLabel,
          cacheKey: evaluation.cacheKey,
        });
      }
      if (nonInteractiveDecisionPlan.source === "allow-always-policy") {
        trustPolicy.recordLastHit({
          source: "allow-always-policy",
          projectRoot,
          scopeLabel: evaluation.scopeLabel,
          cacheKey: evaluation.cacheKey,
        });
      }
      emitApprovalAudit({
        channel: "non-interactive",
        decision: resolvedDecision,
        decisionSource: nonInteractiveDecisionPlan.source,
        persistent: resolvedDecision === "allow-always",
        cacheEffect:
          resolvedDecision === "allow-always"
            ? nonInteractiveDecisionPlan.source === "allow-always-policy"
              ? "allow-always-cache-hit"
              : "allow-always-persisted"
            : nonInteractiveDecisionPlan.source === "allow-once-cache"
              ? "allow-once-cache-consumed"
              : "none",
        projectRoot,
        cacheKey: evaluation.cacheKey,
        scopeLabel: evaluation.scopeLabel,
        lineage: approvalModeObject?.verifyLineage,
      });
      renderer.renderLine(`Approval decision: ${resolvedDecision}`);
      renderer.renderLine("");
      return {
        promptId: prompt.id,
        decision: resolvedDecision,
        respondedAt: Date.now(),
        userComment: `CLI non-interactive approval: ${resolvedDecision} (${nonInteractiveDecisionPlan.source})`,
      };
    }

    if (approvalModeObject) {
      const interactiveDecisionPlan = resolveNonInteractiveApprovalDecision({
        approvalModeObject,
        hasAllowOnceCache,
        hasAllowAlwaysGrant,
      });
      if (interactiveDecisionPlan.source === "ambiguous-stop") {
        const stopReason =
          interactiveDecisionPlan.stopReason ?? "Approval mode is ambiguous.";
        renderApprovalHeader(renderer, "approval-required");
        renderer.renderLine(`- Tool: ${prompt.context.toolName}`);
        renderer.renderLine(`- Action: ${prompt.context.operation}`);
        renderer.renderLine(`- Target: ${prompt.context.target}`);
        renderer.renderLine(`- Risk: ${prompt.severity}`);
        renderer.renderLine(
          `- Decision source: ${interactiveDecisionPlan.source}`,
        );
        renderer.renderLine(stopReason);
        emitApprovalAudit({
          channel: "interactive",
          decision: "deny",
          decisionSource: "ambiguous-stop",
          persistent: false,
          cacheEffect: "ambiguous-stop",
          projectRoot,
          cacheKey: evaluation.cacheKey,
          scopeLabel: evaluation.scopeLabel,
          lineage: approvalModeObject?.verifyLineage,
          stopReason,
        });
        renderer.renderLine("");
        return {
          promptId: prompt.id,
          decision: "deny",
          respondedAt: Date.now(),
          userComment: `CLI interactive approval blocked: ${stopReason}`,
        };
      }
      if (interactiveDecisionPlan.source === "approval-mode-object") {
        const resolvedDecision = interactiveDecisionPlan.decision ?? "deny";
        renderApprovalHeader(renderer, "approval-required");
        renderer.renderLine(`- Tool: ${prompt.context.toolName}`);
        renderer.renderLine(`- Action: ${prompt.context.operation}`);
        renderer.renderLine(`- Target: ${prompt.context.target}`);
        renderer.renderLine(`- Risk: ${prompt.severity}`);
        renderer.renderLine(
          `- Decision source: ${interactiveDecisionPlan.source}`,
        );
        for (const note of interactiveDecisionPlan.overrideNotes) {
          renderer.renderLine(`- ${note}`);
        }
        renderer.renderLine(
          `Interactive approval object: mode=${approvalModeObject.mode}, lineage=${approvalModeObject.verifyLineage}, persistent=${approvalModeObject.persistent ? "yes" : "no"}`,
        );
        if (resolvedDecision === "allow-once") {
          renderer.renderLine(
            "Allow-once applied to this execution only (non-persistent).",
          );
        }
        if (resolvedDecision === "allow-always") {
          const persisted = trustPolicy.rememberAllowAlways(
            prompt,
            projectRoot,
          );
          renderer.renderLine(
            `Trust policy updated: ${persisted.scopeLabel} @ ${path.basename(projectRoot) || projectRoot}`,
          );
        }
        emitApprovalAudit({
          channel: "interactive",
          decision: resolvedDecision,
          decisionSource: interactiveDecisionPlan.source,
          persistent: resolvedDecision === "allow-always",
          cacheEffect:
            resolvedDecision === "allow-always"
              ? "allow-always-persisted"
              : "none",
          projectRoot,
          cacheKey: evaluation.cacheKey,
          scopeLabel: evaluation.scopeLabel,
          lineage: approvalModeObject?.verifyLineage,
        });
        renderer.renderLine(`Approval decision: ${resolvedDecision}`);
        renderer.renderLine("");
        return {
          promptId: prompt.id,
          decision: resolvedDecision,
          respondedAt: Date.now(),
          userComment: `CLI interactive approval: ${resolvedDecision} (${interactiveDecisionPlan.source})`,
        };
      }
    }

    if (hasAllowOnceCache) {
      trustPolicy.consumeAllowOnce(evaluation.cacheKey);
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
      renderer.renderLine(
        "- Decision: allow-once (cached in current shell run)",
      );
      emitApprovalAudit({
        channel: isNonInteractive ? "non-interactive" : "interactive",
        decision: "allow-once",
        decisionSource: "allow-once-cache",
        persistent: false,
        cacheEffect: "allow-once-cache-consumed",
        projectRoot,
        cacheKey: evaluation.cacheKey,
        scopeLabel: evaluation.scopeLabel,
      });
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
      emitApprovalAudit({
        channel: isNonInteractive ? "non-interactive" : "interactive",
        decision: "allow-always",
        decisionSource: "allow-always-policy",
        persistent: true,
        cacheEffect: "allow-always-cache-hit",
        projectRoot,
        cacheKey: evaluation.cacheKey,
        scopeLabel: evaluation.scopeLabel,
      });
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
    renderer.renderLine(
      "Decision: y=allow-once, a=allow-always, n=deny (default n)",
    );

    let decision: "deny" | "allow-once" | "allow-always";
    let decisionInputKey: "y" | "a" | "n" | "other" | undefined;
    if (isNonInteractive) {
      decision = "deny";
      decisionInputKey = "n";
      renderer.renderLine(
        "Non-interactive approval policy: deny (default deny)",
      );
      if (approvalModeObject) {
        renderer.renderLine(
          `Non-interactive approval object: mode=${approvalModeObject.mode}, lineage=${approvalModeObject.verifyLineage}, persistent=${approvalModeObject.persistent ? "yes" : "no"}`,
        );
      }
    } else {
      const answer = await askReadline(rl, "approval> ");
      const normalized = answer.trim().toLowerCase();
      decisionInputKey =
        normalized === "y"
          ? "y"
          : normalized === "a"
            ? "a"
            : normalized === "n"
              ? "n"
              : "other";
      decision =
        normalized === "y"
          ? "allow-once"
          : normalized === "a"
            ? "allow-always"
            : "deny";
    }

    if (decision === "allow-once") {
      renderer.renderLine(
        "Allow-once applied to this execution only (non-persistent).",
      );
    }
    const interactiveWiring = applyInteractiveApprovalDecisionWiring({
      decision,
      prompt,
      projectRoot,
      evaluation,
      trustPolicy,
    });
    if (decision === "allow-always" && interactiveWiring.persistedGrant) {
      const persisted = interactiveWiring.persistedGrant;
      renderer.renderLine(
        `Trust policy updated: ${persisted.scopeLabel} @ ${path.basename(projectRoot) || projectRoot}`,
      );
    }
    emitApprovalAudit({
      channel: isNonInteractive ? "non-interactive" : "interactive",
      decision,
      decisionSource: isNonInteractive
        ? "default-deny"
        : "interactive-keypress",
      persistent: decision === "allow-always",
      cacheEffect:
        decision === "allow-always" ? "allow-always-persisted" : "none",
      projectRoot,
      cacheKey: evaluation.cacheKey,
      scopeLabel: evaluation.scopeLabel,
      lineage: approvalModeObject?.verifyLineage,
      ...(decisionInputKey ? { inputKey: decisionInputKey } : {}),
      ...(decision === "deny"
        ? { stopReason: "Interactive approval denied by user input." }
        : {}),
    });

    renderer.renderLine(`Approval decision: ${decision}`);
    renderer.renderLine("");
    return {
      promptId: prompt.id,
      decision,
      respondedAt: Date.now(),
      userComment: `CLI explicit approval: ${decision}${getApprovalModeObject?.() ? " (approval-mode-object)" : ""}`,
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

function parseNonInteractiveApprovalMode(
  args: readonly string[],
): "deny" | "allow-once" | "allow-always" | undefined {
  let raw: string | undefined;
  const idx = args.indexOf("--non-interactive-approval");
  if (idx !== -1) {
    raw = args[idx + 1];
  }
  if (!raw) {
    const inline = args.find((arg) =>
      arg.toLowerCase().startsWith("--non-interactive-approval="),
    );
    if (inline) {
      raw = inline.split("=", 2)[1];
    }
  }
  if (!raw) {
    if (idx === -1) {
      return undefined;
    }
    console.error(
      "Missing value for --non-interactive-approval. Use deny, allow-once, or allow-always.",
    );
    process.exit(1);
  }
  const normalizedRaw = raw.trim().toLowerCase();
  if (
    normalizedRaw === "deny" ||
    normalizedRaw === "allow-once" ||
    normalizedRaw === "allow-always"
  ) {
    return normalizedRaw;
  }
  if (normalizedRaw === "n") {
    return "deny";
  }
  if (normalizedRaw === "y") {
    return "allow-once";
  }
  if (normalizedRaw === "a") {
    return "allow-always";
  }
  console.error(
    `Invalid --non-interactive-approval value: ${normalizedRaw}. Use deny, allow-once, or allow-always.`,
  );
  process.exit(1);
}

function materializeApprovalModeObject(input: {
  prompt: string;
  continuity?: SessionContinuitySnapshot;
}): ApprovalModeObject | undefined {
  const modeCue = detectApprovalModeCue(input.prompt);
  if (!modeCue) {
    return undefined;
  }
  const continuity = input.continuity;
  const verifyLineageReady = hasBlockedVerifyResumeLineage(continuity);
  const missingFields: string[] = [];
  if (!verifyLineageReady) {
    missingFields.push("verify-lineage");
  }
  if (modeCue.ambiguous) {
    missingFields.push("approval-mode");
  }
  return {
    mode: modeCue.mode ?? "deny",
    persistent: modeCue.mode === "allow-always",
    source: modeCue.ambiguous
      ? "prompt-ambiguous-verify-lineage"
      : "prompt-explicit-verify-lineage",
    verifyLineage: "blocked-verify-resume",
    command: continuity?.lastVerificationCommand,
    commandCwd: extractVerifyHintFromContinuity(continuity, "verify-cwd-hint"),
    targetPath:
      extractVerifyHintFromContinuity(continuity, "verify-target-hint") ??
      continuity?.recentTargetFiles?.[0],
    executableNow: missingFields.length === 0 && Boolean(modeCue.mode),
    missingFields,
  };
}

function detectApprovalModeCue(
  prompt: string,
): { mode?: "allow-once" | "allow-always"; ambiguous: boolean } | undefined {
  const normalized = prompt.toLowerCase();
  const hasVerifyContinuationCue =
    /(?:\b(?:continue|rerun|re-run|retry|run|execute|do that)\b.*\b(?:verify|verification|test|tests|build|lint|check)\b|\b(?:verify|verification|test|tests|build|lint|check)\b.*\b(?:again|retry|rerun|re-run|continue)\b|继续.*(?:验证|测试|构建|编译|检查)|重跑.*(?:测试|构建|编译)|再跑一次.*(?:测试|构建|编译)|继续刚才那个验证)/iu.test(
      prompt,
    );
  if (!hasVerifyContinuationCue) {
    return undefined;
  }
  const onceCue =
    /\ballow[-\s]?once\b|\bone[\s-]?time\b|\bjust this time\b|\btemporar(?:y|ily)\b|一次性授权|仅这一次|这次授权|临时授权|就这一次/u.test(
      normalized,
    );
  const alwaysCue =
    /\ballow[-\s]?always\b|\balways allow\b|\bremember(?:\s+it|\s+this)?\b|\bpermanent(?:ly)?\b|姘镐箙鍏佽|闀挎湡鎺堟潈|璁颁綇(?:杩欎釜)?鎺堟潈|姘镐箙鎺堟潈/u.test(
      normalized,
    );
  if (!onceCue && !alwaysCue) {
    return undefined;
  }
  if (onceCue && alwaysCue) {
    return { ambiguous: true };
  }
  return { mode: onceCue ? "allow-once" : "allow-always", ambiguous: false };
}

function hasBlockedVerifyResumeLineage(
  continuity?: SessionContinuitySnapshot,
): boolean {
  if (!continuity) {
    return false;
  }
  if (
    continuity.lastVerificationResumeEligible === true &&
    Boolean(continuity.lastVerificationCommand?.trim())
  ) {
    return true;
  }
  if (
    continuity.lastVerificationStatus === "blocked" &&
    continuity.lastVerificationBlockerKind === "approval-denied" &&
    Boolean(continuity.lastVerificationCommand?.trim())
  ) {
    return true;
  }
  return (
    (continuity.lastContinuationEvidence ?? []).some((entry) =>
      /^verify-resume-eligible:(?:1|true|yes)$/i.test(entry.trim()),
    ) && Boolean(continuity.lastVerificationCommand?.trim())
  );
}

function extractVerifyHintFromContinuity(
  continuity: SessionContinuitySnapshot | undefined,
  prefix: "verify-cwd-hint" | "verify-target-hint",
): string | undefined {
  if (!continuity) {
    return undefined;
  }
  const matcher = new RegExp(`^${prefix}:(.+)$`, "i");
  for (const entry of continuity.lastContinuationEvidence ?? []) {
    const match = entry.match(matcher);
    if (match?.[1]?.trim()) {
      return match[1].trim();
    }
  }
  return undefined;
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

async function runNonTtyPromptStream(options: {
  sessionManager: SessionManager;
  runtimeContext: {
    session: { id: string };
    cwd: string;
    projectRoot: string;
    runtimeConfig: { maxTurns: number };
  };
  renderer: StreamingRenderer;
  sessionRuntime: ShellSessionRuntime;
  logger: ReturnType<typeof createComponentLogger>;
  fallbackSessionId?: string;
  setActiveNonInteractiveApprovalMode: (
    mode: ApprovalModeObject | undefined,
  ) => void;
  nonInteractiveCliApprovalMode?: "deny" | "allow-once" | "allow-always";
}): Promise<void> {
  const contextTag = (): string =>
    `[${toProjectLabel(options.runtimeContext.projectRoot)}|${toSessionShortLabel(options.runtimeContext.session.id)}]`;
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

async function runNonInteractivePrompt(options: {
  prompt: string;
  sessionManager: SessionManager;
  runtimeContext: {
    session: { id: string };
    cwd: string;
    projectRoot: string;
    runtimeConfig: { maxTurns: number };
  };
  renderer: StreamingRenderer;
  sessionRuntime: ShellSessionRuntime;
  logger: ReturnType<typeof createComponentLogger>;
  printMode: boolean;
  fallbackSessionId?: string;
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
      const sessionAction = resolved.slashResult.sessionAction ?? "panel";
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
        renderSessionCommandMap(options.renderer, { compact: true });
        return;
      }

      if (sessionAction === "switch") {
        const targetSessionReference = resolved.slashResult.sessionId?.trim();
        if (!targetSessionReference) {
          options.renderer.renderLine(
            "Usage: /sessions switch <id|prefix|title|last>",
          );
          return;
        }

        const resolvedSessionId = resolveSwitchSessionReference({
          renderer: options.renderer,
          sessionManager: options.sessionManager,
          preferredProjectRoot: options.runtimeContext.projectRoot,
          reference: targetSessionReference,
          printMode: options.printMode,
        });
        if (!resolvedSessionId) {
          return;
        }

        try {
          const resumed = options.sessionManager.resume(resolvedSessionId);
          const previousSessionId = options.runtimeContext.session.id;
          switchRuntimeSessionProjectContext(
            options.runtimeContext as never,
            resumed,
          );
          options.renderer.renderLine(
            `Switched session: ${previousSessionId} -> ${resumed.id}`,
          );
          options.renderer.renderLine(
            `Project context: ${options.runtimeContext.projectRoot}`,
          );
          renderSwitchedSessionContext(
            options.renderer,
            options.sessionManager,
            resumed.id,
          );
          renderSessionCommandMap(options.renderer, { compact: true });
          return;
        } catch (error) {
          options.renderer.renderLine(
            `Failed to switch session: ${error instanceof Error ? error.message : String(error)}`,
          );
          return;
        }
      }

      if (sessionAction === "help") {
        renderSessionCommandMap(options.renderer);
        return;
      }

      renderSessionSurfaceOverview(
        options.renderer,
        options.sessionManager,
        options.runtimeContext as never,
      );
      return;
    }

    if (resolved.slashResult.action === "show-workspace") {
      const workspaceAction = resolved.slashResult.workspaceAction ?? "status";
      if (workspaceAction === "recent") {
        renderRecentProjectContexts(options.renderer, options.sessionManager);
        return;
      }

      if (workspaceAction === "attach") {
        const attachTarget = resolved.slashResult.workspaceTarget?.trim();
        if (!attachTarget) {
          options.renderer.renderLine("Usage: /workspace attach <path>");
          return;
        }

        try {
          const attached = resolveRuntimeProjectRoot(
            options.runtimeContext.cwd,
            attachTarget,
          );
          const previousProjectRoot = options.runtimeContext.projectRoot;
          if (
            normalizePathForCompare(previousProjectRoot) ===
            normalizePathForCompare(attached.projectRoot)
          ) {
            options.renderer.renderLine(
              `Already attached to ${attached.projectRoot}.`,
            );
            renderWorkspaceSummary(options.renderer, options.runtimeContext);
            return;
          }

          const attachedSession = options.sessionManager.createNew(
            attached.projectRoot,
          );
          switchActiveSession(
            options.runtimeContext as never,
            attachedSession as never,
            attached.projectRoot,
            {
              cwd: attached.projectRoot,
              projectRoot: attached.projectRoot,
              gitContext: attached.gitContext,
            },
          );
          options.renderer.renderLine(
            `Attached project context: ${previousProjectRoot} -> ${attached.projectRoot}`,
          );
          options.renderer.renderLine(
            `New project session: ${attachedSession.id}`,
          );
          renderWorkspaceSummary(options.renderer, options.runtimeContext);
          renderRecentProjectContexts(options.renderer, options.sessionManager);
          return;
        } catch (error) {
          options.renderer.renderLine(
            `Failed to attach project: ${error instanceof Error ? error.message : String(error)}`,
          );
          return;
        }
      }

      renderWorkspaceSummary(options.renderer, options.runtimeContext);
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
        setActiveNonInteractiveApprovalMode:
          options.setActiveNonInteractiveApprovalMode,
        nonInteractiveCliApprovalMode: options.nonInteractiveCliApprovalMode,
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

async function resolveTurnInputForExecution(options: {
  prompt: string;
  cwd: string;
  renderer: StreamingRenderer;
  printMode: boolean;
  interactive: boolean;
}): Promise<TurnInputResolution> {
  const repoAwareResponse = resolveRepoAwarePromptResponse(
    options.prompt,
    options.cwd,
  );
  if (repoAwareResponse) {
    options.renderer.renderLine(
      options.printMode ? repoAwareResponse : `\n${repoAwareResponse}\n`,
    );
    return { kind: "handled" };
  }

  const slashResult = await routeSlashCommand(options.prompt, {
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
    slashResult?.kind === "prompt" ? slashResult.prompt : options.prompt;
  return {
    kind: "execute",
    effectivePrompt: normalizePromptForExecution(rawPrompt),
  };
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
  setActiveNonInteractiveApprovalMode: (
    mode: ApprovalModeObject | undefined,
  ) => void;
  nonInteractiveCliApprovalMode?: "deny" | "allow-once" | "allow-always";
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
      sessionManager: options.sessionManager,
      setActiveNonInteractiveApprovalMode:
        options.setActiveNonInteractiveApprovalMode,
      nonInteractiveCliApprovalMode: options.nonInteractiveCliApprovalMode,
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
      sessionManager: options.sessionManager,
      setActiveNonInteractiveApprovalMode:
        options.setActiveNonInteractiveApprovalMode,
      nonInteractiveCliApprovalMode: options.nonInteractiveCliApprovalMode,
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
    renderSessionCommandMap(options.renderer, {
      compact: options.printMode,
      includeHelpHint: false,
    });
    if (!options.printMode) {
      options.renderer.renderLine("");
    }
  }

  if (options.slashResult.action === "resume-session") {
    renderSessionCommandMap(options.renderer, {
      compact: options.printMode,
      includeHelpHint: false,
    });
    if (!options.printMode) {
      options.renderer.renderLine("");
    }
  }

  return { turnNumber: options.turnNumber ?? 0 };
}

async function executeResolvedPromptTurn(options: {
  source: "interactive" | "non-interactive";
  effectivePrompt: string;
  runtimeSeed?: QueryRuntimeStateSeed;
  continuityState?: SessionContinuitySnapshot;
  sessionManager: SessionManager;
  setActiveNonInteractiveApprovalMode: (
    mode: ApprovalModeObject | undefined,
  ) => void;
  nonInteractiveCliApprovalMode?: "deny" | "allow-once" | "allow-always";
  runtimeContext: { session: { id: string } };
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
  if (!options.printMode) {
    const startLabel =
      turnOrigin === "resumed"
        ? "Execution started (resumed context)"
        : turnOrigin === "continued"
          ? "Execution started (continued context)"
          : "Execution started";
    options.renderer.renderLine(`${startLabel}...`);
  }
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
  const approvalModeConflict = analyzeApprovalModeConflict(approvalModeObject);
  if (
    approvalModeConflict.ambiguousStop &&
    (options.source === "interactive" || !options.nonInteractiveCliApprovalMode)
  ) {
    options.renderer.renderLine(
      approvalModeConflict.stopReason ?? "Approval mode is ambiguous.",
    );
    options.renderer.renderLine(
      "Re-run with an explicit verify continuation lineage or set --non-interactive-approval for this run.",
    );
    return;
  }
  recordCount("cli.prompts", 1, {
    sessionId: options.runtimeContext.session.id,
  });
  options.setActiveNonInteractiveApprovalMode(approvalModeObject);
  try {
    await options.sessionRuntime.executePrompt(
      options.runtimeContext.session.id,
      options.effectivePrompt,
      {
        outputMode: options.printMode ? "print" : "interactive",
        runtimeSeed: options.runtimeSeed,
        continuityState: continuitySnapshot,
      },
    );
  } finally {
    options.setActiveNonInteractiveApprovalMode(undefined);
  }
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
    session: { id: string };
    cwd: string;
    projectRoot: string;
    runtimeConfig: { maxTurns: number };
  };
  renderer: StreamingRenderer;
  sessionRuntime: ShellSessionRuntime;
  logger: ReturnType<typeof createComponentLogger>;
  printMode: boolean;
  fallbackSessionId?: string;
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
      setActiveNonInteractiveApprovalMode:
        options.setActiveNonInteractiveApprovalMode,
      nonInteractiveCliApprovalMode: options.nonInteractiveCliApprovalMode,
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

  const pipedPrompts = parseTransportPrompts(pipedInput, {
    allowComments: false,
  });
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

function isFenceLine(line: string): boolean {
  return line.trim().startsWith("```");
}

function updateFenceState(current: boolean, line: string): boolean {
  const fenceCount = line.match(/```/g)?.length ?? 0;
  return fenceCount % 2 === 0 ? current : !current;
}

function opensMultilineLiteralPrompt(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.endsWith(":")) {
    return false;
  }
  return /(?:create|write|append|edit|modify|update).*(?:content|exactly)|(?:content|exactly).*(?:create|write|append|edit|modify|update)/i.test(
    trimmed,
  );
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

function toProjectLabel(projectRoot: string): string {
  return path.basename(projectRoot) || projectRoot;
}

function toSessionShortLabel(sessionId: string): string {
  const normalized = sessionId.startsWith("sess_")
    ? sessionId.slice("sess_".length)
    : sessionId;
  return normalized.slice(0, 8);
}

function buildPersistentShellPrompt(input: {
  projectRoot: string;
  sessionId: string;
  agentMode: "plan" | "build";
}): string {
  const project = toProjectLabel(input.projectRoot);
  const session = toSessionShortLabel(input.sessionId);
  return `[${project}|${session}|${input.agentMode}] > `;
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
    "--non-interactive-approval",
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
  renderer.renderLine(
    `- Project: ${path.basename(runtimeContext.projectRoot) || runtimeContext.projectRoot}`,
  );
  renderer.renderLine(`- Project root: ${runtimeContext.projectRoot}`);
  renderer.renderLine(`- Working directory: ${runtimeContext.cwd}`);
  renderer.renderLine(
    `- Original launch directory: ${runtimeContext.originalCwd}`,
  );
  if (runtimeContext.gitContext.insideGit) {
    renderer.renderLine(
      `- Git root: ${runtimeContext.gitContext.root ?? "unknown"}`,
    );
    renderer.renderLine(
      `- Branch: ${runtimeContext.gitContext.branch ?? "unknown"}`,
    );
    renderer.renderLine(
      `- Workspace clean: ${runtimeContext.gitContext.isClean ? "yes" : "no"}`,
    );
  } else {
    renderer.renderLine("- Git: not inside a git workspace");
  }
  renderer.renderLine(
    `- Active session: ${runtimeContext.session.id} [${runtimeContext.session.status}]`,
  );
  renderer.renderLine(
    `- Session project binding: ${runtimeContext.session.projectRoot}`,
  );
  renderer.renderLine(
    "Next actions: /workspace recent, /workspace attach <path>, /sessions",
  );
  renderer.renderLine("");
}

function renderStartupSurface(
  renderer: StreamingRenderer,
  input: {
    runtimeContext: {
      session: { id: string; status: string };
      cwd: string;
      originalCwd: string;
      projectRoot: string;
      gitContext: {
        insideGit: boolean;
        branch: string | null;
        isClean: boolean | null;
      };
    };
    sessionManager: SessionManager;
    lifecycleNotices: readonly string[];
    recoveryCandidate?: { id: string } | null;
    recoveryCandidateSummary?: SessionReentrySummary;
    recoveryBlockedNotice?: RecoveryTrustBoundaryBlock;
    provider: string;
    model?: string;
    maxTurns: number;
    executionPath: "rust-daemon" | "ts-local";
    stdinTransportMode: StdinTransportMode;
  },
): void {
  const summary = input.sessionManager.describeSessionReentry(
    input.runtimeContext.session.id,
  );
  const projectLabel =
    path.basename(input.runtimeContext.projectRoot) ||
    input.runtimeContext.projectRoot;

  renderer.renderLine("\nPrivate Coding Agents Shell");
  renderer.renderLine(`- Project: ${projectLabel}`);
  renderer.renderLine(`- Project root: ${input.runtimeContext.projectRoot}`);
  if (
    path.resolve(input.runtimeContext.originalCwd) !==
    path.resolve(input.runtimeContext.projectRoot)
  ) {
    renderer.renderLine(
      `- Launch directory: ${input.runtimeContext.originalCwd}`,
    );
  }
  renderer.renderLine(`- Session: ${summary.id} [${summary.status}]`);
  renderer.renderLine(
    `- Resume state: ${summary.resumeDisposition}${summary.autoResumeReady ? " (auto)" : ""}`,
  );
  renderer.renderLine(
    `- Runtime: ${input.executionPath}; provider=${input.provider}${input.model ? `; model=${input.model}` : ""}; max-turns=${input.maxTurns}`,
  );
  if (input.runtimeContext.gitContext.insideGit) {
    renderer.renderLine(
      `- Git: ${input.runtimeContext.gitContext.branch ?? "unknown"} (${input.runtimeContext.gitContext.isClean ? "clean" : "dirty"})`,
    );
  }

  const lifecycleNotice = input.lifecycleNotices.at(-1);
  if (lifecycleNotice) {
    renderer.renderLine(`- Session lifecycle: ${lifecycleNotice}`);
  }
  if (input.recoveryCandidate && input.recoveryCandidateSummary) {
    renderer.renderLine(
      `- Recovery hint: /resume or --session-id ${input.recoveryCandidate.id} (${input.recoveryCandidateSummary.resumeDisposition})`,
    );
  } else if (input.recoveryBlockedNotice) {
    renderer.renderLine(
      `- Recovery boundary: ${truncate(input.recoveryBlockedNotice.detail, 180)}`,
    );
  }

  renderer.renderLine("Next actions:");
  renderer.renderLine("- Type a prompt to start work in this project.");
  renderer.renderLine("- /sessions    inspect active + recent sessions.");
  renderer.renderLine("- /resume      continue the best recoverable context.");
  renderer.renderLine("- /workspace status    verify project/workdir binding.");
  renderer.renderLine("- /help        open grouped command navigation.");
  if (input.stdinTransportMode === "stream-live") {
    renderer.renderLine(
      "- Non-TTY stream mode active: each input line is processed as a sequential turn.",
    );
  }
  renderer.renderLine("Ctrl+C cancels the current run. Ctrl+D exits.\n");
}

function renderRecentProjectContexts(
  renderer: StreamingRenderer,
  sessionManager: SessionManager,
): void {
  const projectContexts = sessionManager.listRecentProjectContexts(8);
  renderer.renderLine("\nRecent project contexts");
  if (projectContexts.length === 0) {
    renderer.renderLine("- No project contexts found yet.");
    renderer.renderLine(
      "- Start with /workspace attach <path> to bind a target project.",
    );
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
    "Use /sessions switch <id|prefix|title|last> to jump directly, /resume [id|prefix|title|last] to continue recoverable work, or /sessions current for active-session details.",
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
    const projectLabel =
      path.basename(summary.projectRoot) || summary.projectRoot;
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
  const summary = sessionManager.describeSessionReentry(
    runtimeContext.session.id,
  );
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
  renderer.renderLine(
    `- Updated: ${summary.updatedAt} (${toRelativeTime(summary.updatedAt)})`,
  );
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

function renderSessionSurfaceOverview(
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
    projectRoot: string;
  },
): void {
  renderer.renderLine("\n/sessions (session surface)");
  renderCurrentSession(renderer, sessionManager, runtimeContext);
  renderSessionList(
    renderer,
    sessionManager,
    runtimeContext.session.id,
    runtimeContext.projectRoot,
  );
  renderSessionCommandMap(renderer);
}

function renderSessionCommandMap(
  renderer: StreamingRenderer,
  options?: { compact?: boolean; includeHelpHint?: boolean },
): void {
  const compact = options?.compact === true;
  const includeHelpHint = options?.includeHelpHint !== false;
  renderer.renderLine(
    compact ? "Session command map:" : "\nSession command map",
  );
  renderer.renderLine(
    "- /sessions            open the session surface (interactive panel in TTY; overview in print/non-TTY).",
  );
  renderer.renderLine("- /sessions current    inspect the active session.");
  renderer.renderLine(
    "- /sessions list       inspect recent sessions for this project.",
  );
  renderer.renderLine(
    "- /sessions switch <id|prefix|title|last> switch active session and project context.",
  );
  renderer.renderLine(
    "- /resume [id|prefix|title|last] resume the best recoverable context.",
  );
  if (includeHelpHint) {
    renderer.renderLine("- /help                show full command guide.");
  }
}

function renderUserHelp(renderer: StreamingRenderer): void {
  renderer.renderLine("\nSlash command guide");
  renderer.renderLine("Next actions (start here):");
  renderer.renderLine(
    "- /sessions               inspect active + recent sessions.",
  );
  renderer.renderLine(
    "- /resume                 continue best recoverable context.",
  );
  renderer.renderLine(
    "- /workspace status       confirm project/workdir binding.",
  );
  renderer.renderLine(
    "- /diagnose               get actionable repo next step.",
  );
  renderer.renderLine("");

  renderer.renderLine("Command groups:");
  renderer.renderLine("1) Session & Continuation");
  renderer.renderLine(
    "- /sessions               session surface entrypoint (TTY: panel, non-TTY/print: overview).",
  );
  renderer.renderLine(
    "- /sessions current       active session identity and resume readiness.",
  );
  renderer.renderLine(
    "- /sessions list          recent sessions for current project context.",
  );
  renderer.renderLine(
    "- /sessions switch <id|prefix|title|last>   switch active session + project context.",
  );
  renderer.renderLine(
    "- /resume [id|prefix|title|last] resume recoverable context by reference.",
  );
  renderer.renderLine(
    "- /continue [id] [text]   resume context and optionally run immediate follow-up.",
  );
  renderer.renderLine("");

  renderer.renderLine("2) Workspace & Navigation");
  renderer.renderLine(
    "- /workspace status       show current project/workdir binding.",
  );
  renderer.renderLine(
    "- /workspace attach <path> attach/switch active project target.",
  );
  renderer.renderLine(
    "- /workspace recent       list recently attached project contexts.",
  );
  renderer.renderLine("- /cd <path>              quick attach by path.");
  renderer.renderLine(
    "- /pwd                    print current workspace status.",
  );
  renderer.renderLine("");

  renderer.renderLine("3) Workflow & Runtime");
  renderer.renderLine("- /cancel                 stop only the current run.");
  renderer.renderLine("- /build                  switch to build mode.");
  renderer.renderLine("- /plan                   switch to plan mode.");
  renderer.renderLine(
    "- /mode [status|plan|build] inspect or switch agent mode.",
  );
  renderer.renderLine("- /view user|developer    switch output verbosity.");
  renderer.renderLine("");

  renderer.renderLine("4) Diagnostics & Integrations");
  renderer.renderLine(
    "- /diagnose               repo-aware diagnosis and next action.",
  );
  renderer.renderLine(
    "- /model status|list|use  inspect and switch active model.",
  );
  renderer.renderLine(
    "- /mcp status|tools|doctor|refresh [server] inspect and recover MCP state.",
  );
  renderer.renderLine(
    "- /permissions list|explain|revoke|reset inspect trust policy state.",
  );
  renderer.renderLine(
    "- /connect status|login|use|logout|set ... provider connection management.",
  );
  renderer.renderLine("");

  renderer.renderLine("Discovery tips:");
  renderer.renderLine(
    "- Unknown slash commands now return this guide path with quick actions.",
  );
  renderer.renderLine(
    "- Use /help any time to get back to grouped command navigation.",
  );
  renderer.renderLine("");
}

function renderMcpStatusControlPlane(
  renderer: StreamingRenderer,
  snapshot: McpClientSnapshot,
): void {
  const connected = snapshot.clients.filter(
    (client) => client.type === "connected",
  );
  const needsAuth = snapshot.clients.filter(
    (client) => client.type === "needs-auth",
  );
  const failed = snapshot.clients.filter((client) => client.type === "failed");
  const disabled = snapshot.clients.filter(
    (client) => client.type === "disabled",
  );
  const pending = snapshot.clients.filter(
    (client) => client.type === "pending",
  );

  renderer.renderLine("\nMCP control plane");
  renderer.renderLine(
    `- Servers: total ${snapshot.clients.length}, connected ${connected.length}, needs-auth ${needsAuth.length}, failed ${failed.length}, pending ${pending.length}, disabled ${disabled.length}`,
  );
  renderer.renderLine(`- Exposed tools: ${snapshot.tools.length}`);
  if (snapshot.clients.length === 0) {
    renderer.renderLine("- No MCP servers configured for this project.");
    renderer.renderLine(
      "- Add project servers in .private-agents.mcp.json or user servers in ~/.private-agents/mcp.json.",
    );
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
  renderer.renderLine(
    "- /mcp doctor            diagnose auth/connection failures.",
  );
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
    renderer.renderLine(
      "Run /mcp status to inspect configured server names.\n",
    );
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
      renderer.renderLine(
        "- At least one selected server is not connected. Use /mcp doctor or /mcp refresh.",
      );
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
  const needsAuth = snapshot.clients.filter(
    (client) => client.type === "needs-auth",
  );
  const failed = snapshot.clients.filter((client) => client.type === "failed");
  const pending = snapshot.clients.filter(
    (client) => client.type === "pending",
  );
  const disabled = snapshot.clients.filter(
    (client) => client.type === "disabled",
  );

  renderer.renderLine("\nMCP doctor");
  if (
    needsAuth.length === 0 &&
    failed.length === 0 &&
    pending.length === 0 &&
    disabled.length === 0
  ) {
    renderer.renderLine("- No blocking MCP issues detected.");
    renderer.renderLine(
      "- All configured servers are connected and serving tools.",
    );
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
      renderer.renderLine(`  ${client.name}: ${truncate(client.error, 140)}`);
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
  renderer.renderLine(
    "- /connect status (if auth-backed MCP providers are involved)",
  );
  renderer.renderLine("- Re-check with /mcp status");
  renderer.renderLine("");
}

function switchRuntimeSessionProjectContext(
  runtimeContext: {
    cwd: string;
    originalCwd: string;
    projectRoot: string;
    gitContext: ReturnType<typeof getWorkflowGitContext>;
  },
  resumedSession: { projectRoot: string },
): void {
  const nextProjectRoot =
    resumedSession.projectRoot?.trim() || runtimeContext.projectRoot;
  switchActiveSession(
    runtimeContext as never,
    resumedSession as never,
    nextProjectRoot,
    {
      cwd: nextProjectRoot,
      projectRoot: nextProjectRoot,
      gitContext: getWorkflowGitContext(nextProjectRoot),
    },
  );
}

function resolveSwitchSessionReference(input: {
  renderer: StreamingRenderer;
  sessionManager: SessionManager;
  preferredProjectRoot: string;
  reference: string;
  printMode: boolean;
}): string | null {
  const resolved = resolveSessionReference({
    reference: input.reference,
    sessionManager: input.sessionManager,
    preferredProjectRoot: input.preferredProjectRoot,
  });
  if (resolved.ok && resolved.sessionId) {
    return resolved.sessionId;
  }

  if (resolved.reason === "ambiguous") {
    const lines: string[] = [
      `Switch target '${input.reference}' is ambiguous.`,
    ];
    for (const candidate of (resolved.candidates ?? []).slice(0, 3)) {
      const title = candidate.title?.trim() || "(untitled)";
      lines.push(`- ${candidate.id} [${candidate.status}] ${title}`);
    }
    lines.push(
      "Hint: use a longer session id prefix or exact session id from /sessions list.",
    );
    input.renderer.renderLine(
      input.printMode ? lines.join("\n") : `\n${lines.join("\n")}\n`,
    );
    return null;
  }

  input.renderer.renderLine(
    input.printMode
      ? `Switch target '${input.reference}' was not found.\nHint: run /sessions list, then /sessions switch <id|prefix|title|last>.`
      : `\nSwitch target '${input.reference}' was not found.\nHint: run /sessions list, then /sessions switch <id|prefix|title|last>.\n`,
  );
  return null;
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
    renderer.renderLine(
      "- Use /permissions reset all to clear global grants if needed.",
    );
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
  const hasQuestionShape =
    /[?？]$/.test(prompt.trim()) ||
    normalized.startsWith("what ") ||
    normalized.startsWith("where ") ||
    prompt.includes("什么") ||
    prompt.includes("哪里") ||
    prompt.includes("哪");

  // Only treat as workspace-info when the user is asking.
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

function normalizePromptForExecution(prompt: string): string {
  const normalized = prompt.toLowerCase();
  const likelyMojibake = prompt.includes("�");
  const currentDirCue =
    /(?:current\s+directory|in\s+this\s+directory|当前目录|当前工作目录|在当前目录中|在本目录)/iu.test(
      prompt,
    );
  const pythonCue =
    /\bpython\b/i.test(normalized) &&
    (/script|file|py/i.test(normalized) || /(?:脚本|目录|文件)/u.test(prompt));

  if (
    (!pythonCue || !currentDirCue) &&
    !(likelyMojibake && /\bpython\b/i.test(normalized))
  ) {
    return prompt;
  }

  const asciiTokens: string[] =
    prompt.match(/\b[A-Za-z][A-Za-z0-9_-]{1,}\b/g) ?? [];
  const reserved = new Set([
    "python",
    "script",
    "file",
    "write",
    "create",
    "generate",
    "save",
    "current",
    "directory",
    "in",
    "this",
  ]);
  const candidate = asciiTokens.find(
    (token) => !reserved.has(token.toLowerCase()),
  );
  if (!candidate) {
    return prompt;
  }

  // Guard against Windows terminal mojibake by converting fuzzy natural language
  // into a deterministic file-targeted coding task.
  return `Create a python script at ./${candidate}.py with a minimal hello world implementation.`;
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
