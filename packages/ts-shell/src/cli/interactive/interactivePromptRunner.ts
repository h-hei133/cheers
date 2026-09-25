import type { PromptAttachments } from "../../core/shell/sessionRuntime.js";
import { runResumeLikeShellAction } from "../../core/shell/continueShellActionRuntime.js";
import type { ShellRuntimeContext } from "../../core/shell/runtimeContext.js";
import type { ShellSessionRuntime } from "../../core/shell/sessionRuntime.js";
import type { ResumeLikeShellAction } from "../../core/shell/shellActionBridge.js";
import type { StructuredLogger } from "../../observability/structuredLogger.js";
import type { StreamingRenderer } from "../../presentation/terminal/streaming.js";
import type { SessionManager } from "../../session/SessionManager.js";
import type { ApprovalModeObject } from "../approval/approvalModeContract.js";
import {
  executeResolvedPromptTurn,
} from "../../entrypoints/cliRuntimeModule.js";
import { renderSessionCommandMap } from "../../entrypoints/slashCommandRegistry.js";
import { switchRuntimeSessionProjectContext } from "../../entrypoints/cliSessionModule.js";

export async function runInteractiveResumeAction(input: {
  readonly slashResult: ResumeLikeShellAction;
  readonly fallbackSessionId?: string;
  readonly sessionManager: SessionManager;
  readonly runtimeContext: ShellRuntimeContext;
  readonly renderer: StreamingRenderer;
  readonly turnNumber: number;
  readonly sessionRuntime: ShellSessionRuntime;
  readonly logger: StructuredLogger;
  readonly setActiveNonInteractiveApprovalMode: (
    mode: ApprovalModeObject | undefined,
  ) => void;
}): Promise<{ readonly turnNumber: number }> {
  const resumeBridge = await runResumeLikeShellAction({
    slashResult: input.slashResult,
    source: "interactive",
    printMode: false,
    fallbackSessionId: input.fallbackSessionId,
    sessionManager: input.sessionManager,
    runtimeContext: input.runtimeContext,
    renderer: input.renderer,
    turnNumber: input.turnNumber,
    switchRuntimeSessionProjectContext,
    renderSessionCommandMap,
    executeResolvedPromptTurn: (turnInput) => {
      return executeResolvedPromptTurn({
        source: "interactive",
        effectivePrompt: turnInput.effectivePrompt,
        runtimeSeed: turnInput.runtimeSeed,
        continuityState: turnInput.continuityState,
        sessionManager: input.sessionManager,
        setActiveNonInteractiveApprovalMode:
          input.setActiveNonInteractiveApprovalMode,
        runtimeContext: input.runtimeContext,
        sessionRuntime: input.sessionRuntime,
        logger: input.logger,
        printMode: false,
        turnNumber: turnInput.turnNumber,
        renderer: input.renderer,
        turnOrigin: turnInput.turnOrigin,
      });
    },
  });
  return { turnNumber: resumeBridge.turnNumber };
}

export async function runInteractivePromptExecution(input: {
  readonly effectivePrompt: string;
  /** Images the draft referred to; see `PromptAttachments`. */
  readonly attachments?: PromptAttachments;
  readonly sessionManager: SessionManager;
  readonly runtimeContext: ShellRuntimeContext;
  readonly sessionRuntime: ShellSessionRuntime;
  readonly logger: StructuredLogger;
  readonly renderer: StreamingRenderer;
  readonly turnNumber: number;
  readonly setActiveNonInteractiveApprovalMode: (
    mode: ApprovalModeObject | undefined,
  ) => void;
}): Promise<void> {
  await executeResolvedPromptTurn({
    source: "interactive",
    effectivePrompt: input.effectivePrompt,
    ...(input.attachments ? { attachments: input.attachments } : {}),
    sessionManager: input.sessionManager,
    setActiveNonInteractiveApprovalMode:
      input.setActiveNonInteractiveApprovalMode,
    runtimeContext: input.runtimeContext,
    sessionRuntime: input.sessionRuntime,
    logger: input.logger,
    printMode: false,
    turnNumber: input.turnNumber,
    renderer: input.renderer,
  });
}
