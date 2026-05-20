#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import * as readline from "node:readline";
import { getRuntimeConfig } from "../config/runtimeConfig.js";
import {
  CoreMcpGateway,
  McpGatewayBlockedError,
} from "../core/mcp/gateway.js";
import type { QueryRuntimeStateSeed } from "../core/query/runtimeState.js";
import { ApprovalTrustPolicy } from "../core/shell/approvalTrustPolicy.js";
import {
  createApprovalResponse,
  formatAllowOnceAppliedLine,
  formatApprovalConflictResolutionLine,
  formatApprovalDecisionLine,
  formatApprovalObjectLine,
  formatApprovalPromptDecisionMenuLine,
  formatDefaultNonInteractiveDenyLine,
  formatExplicitApprovalComment,
  formatInteractiveApprovalComment,
  formatInteractiveBlockedComment,
  formatNonInteractiveApprovalComment,
  formatNonInteractiveApprovalPolicyLine,
  formatNonInteractiveBlockedComment,
  formatTrustPolicyUpdatedLine,
  renderApprovalAuditSurface,
  renderApprovalRequiredSurface,
  renderCachedApprovalSurface,
  type ApprovalAuditRecord,
  type ApprovalDecisionSource,
} from "./approvalPromptBridge.js";
import {
  bootstrapShellRuntime,
  SessionBootstrapError,
} from "../core/shell/bootstrap.js";
import { applyInteractiveApprovalDecisionWiring } from "../core/shell/interactiveApprovalWiring.js";
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
  isFenceLine,
  opensMultilineLiteralPrompt,
  parseTransportPrompts,
  resolveStdinTransportMode,
  type StdinTransportMode,
  updateFenceState,
} from "../core/shell/printPromptInput.js";
import { resolveSessionReference } from "../core/shell/recovery.js";
import {
  renderCurrentSessionSurface,
  renderSessionListSurface,
  renderSwitchedSessionSurface,
} from "../core/shell/sessionStateSurface.js";
import type {
  RootBindingDiagnostic,
  ShellRuntimeContext,
} from "../core/shell/runtimeContext.js";
import {
  createSessionRootMismatchDiagnostic,
  createWorkspaceAttachSwitchDiagnostic,
  resolveRootBindingDiagnostics,
  switchActiveSession,
} from "../core/shell/runtimeContext.js";
import { ShellSessionRuntime } from "../core/shell/sessionRuntime.js";
import {
  isResumeLikeShellAction,
  isShellAction,
  renderInteractiveOnlyShellActionBlocked,
} from "../core/shell/shellActionBridge.js";
import {
  handleShellClose,
  handleShellSigint,
} from "../core/shell/signalHandlers.js";
import {
  formatExecutionStartedLine,
  formatTurnEndBoundary,
  formatTurnStartBoundary,
  renderTurnResultFallback,
  type TurnEndStatus,
} from "../core/shell/turnBoundarySurface.js";
import { isRustDaemonEnabled } from "../daemon/client.js";
import {
  createComponentLogger,
  createTraceContext,
  recordCount,
  setGlobalTraceContext,
} from "../observability/index.js";
import { StreamingRenderer } from "../renderer/StreamingRenderer.js";
import type { EscalationPrompt, EscalationResponse } from "../sandbox/index.js";
import type {
  ApprovalAuditMemoryState,
  Session,
  SessionContinuitySnapshot,
  SessionReentrySummary,
  WorkspaceRootMode,
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
  projectPermissionListDisplay,
} from "./cliDisplayProjection.js";
import {
  buildPersistentShellPrompt,
  formatCliContextTag,
} from "./cliInteractiveLoopState.js";
import { resolveCliMode } from "./cliModeDispatch.js";
import { runCliPrintMode } from "./cliPrintModeRunner.js";
import {
  runCliRuntimeInvocation,
  type CliApplyPatchRuntimeRouteOptions,
} from "./cliRuntimeInvocation.js";
import { runCliStdinMode } from "./cliStdinModeRunner.js";
import {
  renderRecentProjectContexts,
  renderWorkspaceSummary,
} from "./cliWorkspaceSurface.js";
import {
  formatSessionPanelSwitchSuccessLines,
  formatSessionSwitchAmbiguousLine,
  formatSessionSwitchFailureLine,
  formatSessionSwitchNotFoundLine,
  formatSessionSwitchSuccessLines,
  formatSessionSwitchUsage,
} from "./cliSessionProjection.js";
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
import { openSessionsPanel } from "./sessionsPanel.js";

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
        const sessionAction = slashResult.sessionAction ?? "panel";
        if (sessionAction === "list") {
          renderSessionListSurface(
            renderer,
            {
              sessionManager,
              activeSessionId: runtimeContext.session.id,
              preferredProjectRoot: runtimeContext.projectRoot,
            },
          );
          rl.prompt();
          return;
        }

        if (sessionAction === "current") {
          renderCurrentSessionSurface(renderer, {
            sessionManager,
            runtimeContext,
          });
          renderSessionCommandMap(renderer, { compact: true });
          rl.prompt();
          return;
        }

        if (sessionAction === "switch") {
          const targetSessionReference = slashResult.sessionId?.trim();
          if (!targetSessionReference) {
            renderer.renderLine(formatSessionSwitchUsage({ printMode: false }));
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
            const switchDiagnostics = resolveSessionSwitchDiagnostics(
              runtimeContext,
              sessionManager.describeSessionReentry(resolvedSessionId),
            );
            if (hasBlockedRootBindingDiagnostic(switchDiagnostics)) {
              renderer.renderLine(
                "\nSession switch blocked by root binding diagnostics.",
              );
              renderRootBindingDiagnostics(renderer, switchDiagnostics);
              renderer.renderLine("");
              rl.prompt();
              return;
            }
            const resumed = sessionManager.resume(resolvedSessionId);
            const previousSessionId = runtimeContext.session.id;
            switchRuntimeSessionProjectContext(runtimeContext, resumed);
            mcpGateway = new CoreMcpGateway(runtimeContext.cwd);
            renderProjectedLines(
              renderer,
              formatSessionSwitchSuccessLines({
                previousSessionId,
                nextSessionId: resumed.id,
                projectRoot: runtimeContext.projectRoot,
                printMode: false,
              }),
            );
            renderSwitchedSessionSurface(renderer, {
              sessionManager,
              sessionId: resumed.id,
            });
            renderSessionCommandMap(renderer, { compact: true });
            renderer.renderLine("");
            refreshInteractivePromptChrome();
          } catch (error) {
            renderer.renderLine(
              formatSessionSwitchFailureLine({
                message: error instanceof Error ? error.message : String(error),
                printMode: false,
              }),
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
            const switchDiagnostics = resolveSessionSwitchDiagnostics(
              runtimeContext,
              sessionManager.describeSessionReentry(
                panelResult.switchedSessionId,
              ),
            );
            if (hasBlockedRootBindingDiagnostic(switchDiagnostics)) {
              renderer.renderLine(
                "\nSession switch blocked by root binding diagnostics.",
              );
              renderRootBindingDiagnostics(renderer, switchDiagnostics);
              renderer.renderLine("");
              rl.prompt();
              return;
            }
            const resumed = sessionManager.resume(
              panelResult.switchedSessionId,
            );
            switchRuntimeSessionProjectContext(runtimeContext, resumed);
            mcpGateway = new CoreMcpGateway(runtimeContext.cwd);
            renderProjectedLines(
              renderer,
              formatSessionPanelSwitchSuccessLines({
                nextSessionId: panelResult.switchedSessionId,
                projectRoot: runtimeContext.projectRoot,
              }),
            );
            renderSwitchedSessionSurface(renderer, {
              sessionManager,
              sessionId: panelResult.switchedSessionId,
            });
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

      if (isShellAction(slashResult, "show-workspace")) {
        const workspaceAction = slashResult.workspaceAction ?? "status";
        if (workspaceAction === "recent") {
          renderRecentProjectContexts(
            renderer,
            sessionManager.listRecentProjectContexts(8),
          );
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
              sessionManager.updateSessionWorkspaceBinding(
                runtimeContext.session.id,
                {
                  projectRoot: attached.projectRoot,
                  rootMode: attached.rootMode,
                  requestedWorkspaceRoot: attached.requestedRoot,
                  targetPathBase: attached.targetPathBase,
                  gitRoot: attached.gitRoot,
                },
              );
              runtimeContext.session.rootMode = attached.rootMode;
              runtimeContext.session.requestedWorkspaceRoot =
                attached.requestedRoot;
              runtimeContext.session.targetPathBase = attached.targetPathBase;
              runtimeContext.session.gitRoot = attached.gitRoot;
              switchActiveSession(
                runtimeContext,
                runtimeContext.session,
                attached.projectRoot,
                {
                  cwd: attached.projectRoot,
                  projectRoot: attached.projectRoot,
                  rootMode: attached.rootMode,
                  requestedWorkspaceRoot: attached.requestedRoot,
                  targetPathBase: attached.targetPathBase,
                  gitRoot: attached.gitRoot,
                  rootBindingDiagnostics: attachDiagnostics,
                  gitContext: attached.gitContext,
                },
              );
              renderer.renderLine(
                `\nAlready attached to ${attached.projectRoot}; requested path resolves to this project root.`,
              );
              renderWorkspaceSummary(renderer, runtimeContext);
              rl.prompt();
              return;
            }

            const attachedSession = sessionManager.createNew(
              attached.projectRoot,
              {
                rootMode: attached.rootMode,
                requestedWorkspaceRoot: attached.requestedRoot,
                targetPathBase: attached.targetPathBase,
                gitRoot: attached.gitRoot,
              },
            );
            switchActiveSession(
              runtimeContext,
              attachedSession,
              attached.projectRoot,
              {
                cwd: attached.projectRoot,
                projectRoot: attached.projectRoot,
                rootMode: attached.rootMode,
                requestedWorkspaceRoot: attached.requestedRoot,
                targetPathBase: attached.targetPathBase,
                gitRoot: attached.gitRoot,
                rootBindingDiagnostics: attachDiagnostics,
                gitContext: attached.gitContext,
              },
            );
            mcpGateway = new CoreMcpGateway(runtimeContext.cwd);

            renderer.renderLine(
              `\nAttached project context: ${previousProjectRoot} -> ${attached.projectRoot}`,
            );
            renderer.renderLine(`New project session: ${attachedSession.id}`);
            renderWorkspaceSummary(renderer, runtimeContext);
            renderRecentProjectContexts(
              renderer,
              sessionManager.listRecentProjectContexts(8),
            );
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
  applyPatchRuntimeRoute?: CliApplyPatchRuntimeRouteOptions,
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
    providerModeEnv: process.env.PRIVATE_AGENTS_PROVIDER_MODE,
  });
  for await (const event of invocation.events) {
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
    renderApprovalAuditSurface(renderer, record);
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
      renderApprovalRequiredSurface(renderer, {
        prompt,
        includeRisk: true,
        decisionSource: nonInteractiveDecisionPlan.source,
        lines: [
          ...nonInteractiveDecisionPlan.overrideNotes.map((note) => `- ${note}`),
          ...(approvalModeObject
            ? [formatApprovalObjectLine("Non-interactive", approvalModeObject)]
            : []),
        ],
      });
      if (nonInteractiveDecisionPlan.source === "ambiguous-stop") {
        const stopReason =
          nonInteractiveDecisionPlan.stopReason ??
          "Approval mode is ambiguous.";
        renderer.renderLine(stopReason);
        renderer.renderLine(formatApprovalConflictResolutionLine());
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
        return createApprovalResponse({
          promptId: prompt.id,
          decision: "deny",
          userComment: formatNonInteractiveBlockedComment(stopReason),
        });
      }
      const resolvedDecision = nonInteractiveDecisionPlan.decision ?? "deny";
      renderer.renderLine(
        formatNonInteractiveApprovalPolicyLine({
          resolvedDecision,
          cliDecision: cliNonInteractiveDecision,
          decisionSource: nonInteractiveDecisionPlan.source,
          hasCachedGrant,
        }),
      );
      if (resolvedDecision === "allow-once") {
        renderer.renderLine(formatAllowOnceAppliedLine());
      }
      if (resolvedDecision === "allow-always") {
        const persisted = trustPolicy.rememberAllowAlways(prompt, projectRoot);
        renderer.renderLine(
          formatTrustPolicyUpdatedLine({
            scopeLabel: persisted.scopeLabel,
            projectRoot,
          }),
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
      renderer.renderLine(formatApprovalDecisionLine(resolvedDecision));
      renderer.renderLine("");
      return createApprovalResponse({
        promptId: prompt.id,
        decision: resolvedDecision,
        userComment: formatNonInteractiveApprovalComment({
          decision: resolvedDecision,
          decisionSource: nonInteractiveDecisionPlan.source,
        }),
      });
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
        renderApprovalRequiredSurface(renderer, {
          prompt,
          includeRisk: true,
          decisionSource: interactiveDecisionPlan.source,
        });
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
        return createApprovalResponse({
          promptId: prompt.id,
          decision: "deny",
          userComment: formatInteractiveBlockedComment(stopReason),
        });
      }
      if (interactiveDecisionPlan.source === "approval-mode-object") {
        const resolvedDecision = interactiveDecisionPlan.decision ?? "deny";
        renderApprovalRequiredSurface(renderer, {
          prompt,
          includeRisk: true,
          decisionSource: interactiveDecisionPlan.source,
          lines: [
            ...interactiveDecisionPlan.overrideNotes.map((note) => `- ${note}`),
            formatApprovalObjectLine("Interactive", approvalModeObject),
          ],
        });
        if (resolvedDecision === "allow-once") {
          renderer.renderLine(formatAllowOnceAppliedLine());
        }
        if (resolvedDecision === "allow-always") {
          const persisted = trustPolicy.rememberAllowAlways(
            prompt,
            projectRoot,
          );
          renderer.renderLine(
            formatTrustPolicyUpdatedLine({
              scopeLabel: persisted.scopeLabel,
              projectRoot,
            }),
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
        renderer.renderLine(formatApprovalDecisionLine(resolvedDecision));
        renderer.renderLine("");
        return createApprovalResponse({
          promptId: prompt.id,
          decision: resolvedDecision,
          userComment: formatInteractiveApprovalComment({
            decision: resolvedDecision,
            decisionSource: interactiveDecisionPlan.source,
          }),
        });
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
      renderCachedApprovalSurface(renderer, {
        prompt,
        lines: ["- Decision: allow-once (cached in current shell run)"],
      });
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
      return createApprovalResponse({
        promptId: prompt.id,
        decision: "allow-once",
        userComment: "CLI auto-approval from allow-once cache",
      });
    }
    if (evaluation.matchedGrant) {
      trustPolicy.recordLastHit({
        source: "allow-always-policy",
        projectRoot,
        scopeLabel: evaluation.scopeLabel,
        cacheKey: evaluation.cacheKey,
      });
      renderCachedApprovalSurface(renderer, {
        prompt,
        lines: [
          "- Decision: allow-always (project policy match)",
          `- Scope: ${evaluation.scopeLabel}`,
          `- Rule key: ${evaluation.matchedGrant.scopeKey}`,
        ],
      });
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
      return createApprovalResponse({
        promptId: prompt.id,
        decision: "allow-always",
        userComment: "CLI auto-approval from project allow-always trust policy",
      });
    }

    renderApprovalRequiredSurface(renderer, { prompt, includeRisk: true });
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
    renderer.renderLine(formatApprovalPromptDecisionMenuLine());

    let decision: "deny" | "allow-once" | "allow-always";
    let decisionInputKey: "y" | "a" | "n" | "other" | undefined;
    if (isNonInteractive) {
      decision = "deny";
      decisionInputKey = "n";
      renderer.renderLine(formatDefaultNonInteractiveDenyLine());
      if (approvalModeObject) {
        renderer.renderLine(
          formatApprovalObjectLine("Non-interactive", approvalModeObject),
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
      renderer.renderLine(formatAllowOnceAppliedLine());
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
        formatTrustPolicyUpdatedLine({
          scopeLabel: persisted.scopeLabel,
          projectRoot,
        }),
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

    renderer.renderLine(formatApprovalDecisionLine(decision));
    renderer.renderLine("");
    return createApprovalResponse({
      promptId: prompt.id,
      decision,
      userComment: formatExplicitApprovalComment({
        decision,
        hasApprovalModeObject: Boolean(getApprovalModeObject?.()),
      }),
    });
  };
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

function applyPatchDecisionFromApprovalMode(
  mode: "deny" | "allow-once" | "allow-always" | undefined,
): CliApplyPatchRuntimeRouteOptions["requestedUserDecision"] | undefined {
  if (mode === "deny") {
    return "denied";
  }
  if (mode === "allow-once" || mode === "allow-always") {
    return "approved";
  }
  return undefined;
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
  runtimeContext: ShellRuntimeContext;
  renderer: StreamingRenderer;
  sessionRuntime: ShellSessionRuntime;
  logger: ReturnType<typeof createComponentLogger>;
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

async function runNonInteractivePrompt(options: {
  prompt: string;
  sessionManager: SessionManager;
  runtimeContext: ShellRuntimeContext;
  renderer: StreamingRenderer;
  sessionRuntime: ShellSessionRuntime;
  logger: ReturnType<typeof createComponentLogger>;
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
      const sessionAction = resolved.slashResult.sessionAction ?? "panel";
      if (sessionAction === "list") {
        renderSessionListSurface(
          options.renderer,
          {
            sessionManager: options.sessionManager,
            activeSessionId: options.runtimeContext.session.id,
            preferredProjectRoot: options.runtimeContext.projectRoot,
          },
        );
        return;
      }

      if (sessionAction === "current") {
        renderLatestSessionLifecycleNotice(
          options.renderer,
          options.lifecycleNotices,
        );
        renderCurrentSessionSurface(options.renderer, {
          sessionManager: options.sessionManager,
          runtimeContext: options.runtimeContext,
        });
        renderSessionCommandMap(options.renderer, { compact: true });
        return;
      }

      if (sessionAction === "switch") {
        const targetSessionReference = resolved.slashResult.sessionId?.trim();
        if (!targetSessionReference) {
          options.renderer.renderLine(
            formatSessionSwitchUsage({ printMode: true }),
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
          const switchDiagnostics = resolveSessionSwitchDiagnostics(
            options.runtimeContext,
            options.sessionManager.describeSessionReentry(resolvedSessionId),
          );
          if (hasBlockedRootBindingDiagnostic(switchDiagnostics)) {
            options.renderer.renderLine(
              "Session switch blocked by root binding diagnostics.",
            );
            renderRootBindingDiagnostics(options.renderer, switchDiagnostics);
            return;
          }
          const resumed = options.sessionManager.resume(resolvedSessionId);
          const previousSessionId = options.runtimeContext.session.id;
          switchRuntimeSessionProjectContext(options.runtimeContext, resumed);
          renderProjectedLines(
            options.renderer,
            formatSessionSwitchSuccessLines({
              previousSessionId,
              nextSessionId: resumed.id,
              projectRoot: options.runtimeContext.projectRoot,
              printMode: true,
            }),
          );
          renderSwitchedSessionSurface(options.renderer, {
            sessionManager: options.sessionManager,
            sessionId: resumed.id,
          });
          renderSessionCommandMap(options.renderer, { compact: true });
          return;
        } catch (error) {
          options.renderer.renderLine(
            formatSessionSwitchFailureLine({
              message: error instanceof Error ? error.message : String(error),
              printMode: true,
            }),
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
        options.runtimeContext,
      );
      return;
    }

    if (resolved.slashResult.action === "show-workspace") {
      const workspaceAction = resolved.slashResult.workspaceAction ?? "status";
      if (workspaceAction === "recent") {
        renderRecentProjectContexts(
          options.renderer,
          options.sessionManager.listRecentProjectContexts(8),
        );
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
            options.sessionManager.updateSessionWorkspaceBinding(
              options.runtimeContext.session.id,
              {
                projectRoot: attached.projectRoot,
                rootMode: attached.rootMode,
                requestedWorkspaceRoot: attached.requestedRoot,
                targetPathBase: attached.targetPathBase,
                gitRoot: attached.gitRoot,
              },
            );
            options.runtimeContext.session.rootMode = attached.rootMode;
            options.runtimeContext.session.requestedWorkspaceRoot =
              attached.requestedRoot;
            options.runtimeContext.session.targetPathBase =
              attached.targetPathBase;
            options.runtimeContext.session.gitRoot = attached.gitRoot;
            switchActiveSession(
              options.runtimeContext,
              options.runtimeContext.session,
              attached.projectRoot,
              {
                cwd: attached.projectRoot,
                projectRoot: attached.projectRoot,
                rootMode: attached.rootMode,
                requestedWorkspaceRoot: attached.requestedRoot,
                targetPathBase: attached.targetPathBase,
                gitRoot: attached.gitRoot,
                rootBindingDiagnostics: attachDiagnostics,
                gitContext: attached.gitContext,
              },
            );
            options.renderer.renderLine(
              `Already attached to ${attached.projectRoot}; requested path resolves to this project root.`,
            );
            renderWorkspaceSummary(options.renderer, options.runtimeContext);
            return;
          }

          const attachedSession = options.sessionManager.createNew(
            attached.projectRoot,
            {
              rootMode: attached.rootMode,
              requestedWorkspaceRoot: attached.requestedRoot,
              targetPathBase: attached.targetPathBase,
              gitRoot: attached.gitRoot,
            },
          );
          switchActiveSession(
            options.runtimeContext,
            attachedSession,
            attached.projectRoot,
            {
              cwd: attached.projectRoot,
              projectRoot: attached.projectRoot,
              rootMode: attached.rootMode,
              requestedWorkspaceRoot: attached.requestedRoot,
              targetPathBase: attached.targetPathBase,
              gitRoot: attached.gitRoot,
              rootBindingDiagnostics: attachDiagnostics,
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
          renderRecentProjectContexts(
            options.renderer,
            options.sessionManager.listRecentProjectContexts(8),
          );
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

    if (resolved.slashResult.action === "show-mcp") {
      const mcpAction = resolved.slashResult.mcpAction ?? "status";
      const mcpTarget = resolved.slashResult.mcpTarget?.trim();
      const mcpGateway = new CoreMcpGateway(options.runtimeContext.cwd);
      try {
        if (mcpAction === "refresh") {
          const refreshTarget =
            !mcpTarget || mcpTarget.toLowerCase() === "all" ? "all" : mcpTarget;
          const snapshot = await mcpGateway.refresh(refreshTarget);
          renderMcpRefreshControlPlane(
            options.renderer,
            snapshot,
            refreshTarget,
          );
          return;
        }

        const snapshot = await mcpGateway.snapshot();
        if (mcpAction === "tools") {
          renderMcpToolsControlPlane(options.renderer, snapshot, mcpTarget);
          return;
        }
        if (mcpAction === "doctor") {
          renderMcpDoctorControlPlane(options.renderer, snapshot, mcpTarget);
          return;
        }
        renderMcpStatusControlPlane(options.renderer, snapshot);
      } catch (error) {
        if (error instanceof McpGatewayBlockedError) {
          renderMcpBlockedContract(options.renderer, {
            blockerKind: error.blockerKind,
            reason: error.message,
            doNext: error.doNext,
          });
        } else {
          renderMcpBlockedContract(options.renderer, {
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
        normalizePromptForExecution,
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
  runtimeContext: ShellRuntimeContext;
  sessionRuntime: ShellSessionRuntime;
  logger: ReturnType<typeof createComponentLogger>;
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
    options.renderer.renderLine(
      formatTurnStartBoundary({
        turnNumber: turnLabel,
        origin: turnOrigin,
      }),
    );
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
    if (!options.printMode) {
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
      renderTurnResultFallback(options.renderer, {
        outcome: "interrupted",
        detail: "Current request was cancelled before completion.",
        doNext:
          "Use /resume to continue the interrupted session, or enter a new prompt.",
      });
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
    if (interactiveTurn) {
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

async function runReplayPromptScript(options: {
  replayFile: string;
  sessionManager: SessionManager;
  runtimeContext: ShellRuntimeContext;
  renderer: StreamingRenderer;
  sessionRuntime: ShellSessionRuntime;
  logger: ReturnType<typeof createComponentLogger>;
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

function renderLatestSessionLifecycleNotice(
  renderer: StreamingRenderer,
  lifecycleNotices?: readonly string[],
): void {
  const lifecycleNotice = lifecycleNotices?.at(-1);
  if (lifecycleNotice) {
    renderer.renderLine(`Session lifecycle: ${lifecycleNotice}`);
  }
}

function renderSessionSurfaceOverview(
  renderer: StreamingRenderer,
  sessionManager: SessionManager,
  runtimeContext: ShellRuntimeContext,
): void {
  renderer.renderLine("\n/sessions (session surface)");
  renderCurrentSessionSurface(renderer, { sessionManager, runtimeContext });
  renderSessionListSurface(
    renderer,
    {
      sessionManager,
      activeSessionId: runtimeContext.session.id,
      preferredProjectRoot: runtimeContext.projectRoot,
    },
  );
  renderSessionCommandMap(renderer);
}

function renderProjectedLines(
  renderer: { renderLine(line: string): void },
  lines: readonly string[],
): void {
  for (const line of lines) {
    renderer.renderLine(line);
  }
}

function switchRuntimeSessionProjectContext(
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

function resolveSessionSwitchDiagnostics(
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

function hasBlockedRootBindingDiagnostic(
  diagnostics: readonly RootBindingDiagnostic[],
): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === "blocked");
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

function renderPermissionsList(
  renderer: StreamingRenderer,
  trustPolicy: ApprovalTrustPolicy,
  projectRoot: string,
): void {
  const grants = trustPolicy.listGrants(projectRoot);
  const projection = projectPermissionListDisplay({
    projectRoot,
    grantCount: grants.length,
  });
  const projectLabel = projection.projectLabel;
  renderer.renderLine(`\nTrust policy grants @ ${projectLabel}`);
  if (grants.length === 0) {
    renderProjectedLines(renderer, projection.emptyLines ?? []);
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

function normalizePathForCompare(value: string): string {
  return path.resolve(value).toLowerCase();
}

function resolveRuntimeProjectRoot(
  baseCwd: string,
  requestedProjectPath: string,
): {
  requestedRoot: string;
  projectRoot: string;
  rootMode: WorkspaceRootMode;
  targetPathBase: string;
  gitRoot: string | null;
  rootBindingDiagnostics: readonly RootBindingDiagnostic[];
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
  const rootMode = resolveWorkspaceRootMode(gitContext);
  const targetPathBase = projectRoot;
  const gitRoot = gitContext.root ?? null;
  return {
    requestedRoot: resolvedPath,
    projectRoot,
    rootMode,
    targetPathBase,
    gitRoot,
    rootBindingDiagnostics: resolveRootBindingDiagnostics({
      projectRoot,
      rootMode,
      requestedWorkspaceRoot: resolvedPath,
      targetPathBase,
      gitRoot,
      gitContext,
    }),
    gitContext,
  };
}

function resolveWorkspaceRootMode(
  gitContext: ReturnType<typeof getWorkflowGitContext>,
): WorkspaceRootMode {
  return gitContext.insideGit && gitContext.root ? "git-root" : "direct";
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
