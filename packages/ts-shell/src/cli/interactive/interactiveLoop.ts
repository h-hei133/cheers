import type * as readline from "node:readline";
import type { ApprovalTrustPolicy } from "../../core/shell/approvalTrustPolicy.js";
import type { ShellRuntimeContext } from "../../core/shell/runtimeContext.js";
import type { ShellSessionRuntime } from "../../core/shell/sessionRuntime.js";
import type { StructuredLogger } from "../../observability/structuredLogger.js";
import type { StreamingRenderer } from "../../presentation/terminal/streaming.js";
import type { SessionManager } from "../../session/SessionManager.js";
import type { ApprovalModeObject } from "../approval/approvalModeContract.js";
import type { CliMcpGateway } from "../../entrypoints/cliMcpModule.js";
import type { EscalationPrompt } from "../../core/shell/approval/contract.js";
import { InteractiveMode } from "./interactiveMode.js";
import type { InteractiveApprovalResult } from "./picker/approval.js";
import { runLineLoop } from "./lineLoop.js";
import { supportsFullScreenSurface } from "./surfaceCapability.js";

/**
 * Interactive session entry point.
 *
 * Picks the surface the environment can actually support: the full-screen host
 * when both ends are a real terminal, and the line-oriented loop otherwise. The
 * choice is made here, once, so neither surface has to defend against the other's
 * assumptions.
 */

export interface InteractiveLoopInput {
  readonly stdin?: NodeJS.ReadStream;
  readonly stdout?: NodeJS.WriteStream;
  readonly process?: NodeJS.Process;
  readonly sessionManager: SessionManager;
  readonly renderer: StreamingRenderer;
  readonly runtimeContext: ShellRuntimeContext;
  readonly sessionRuntime: ShellSessionRuntime;
  readonly logger: StructuredLogger;
  readonly approvalTrustPolicy: ApprovalTrustPolicy;
  readonly fallbackSessionId?: string;
  readonly initialMcpGateway: CliMcpGateway;
  readonly setReadline: (readline: readline.Interface | null) => void;
  readonly setInteractiveApprovalPrompt?: (
    handler: ((prompt: EscalationPrompt) => Promise<InteractiveApprovalResult>) | undefined,
  ) => void;
  readonly setActiveNonInteractiveApprovalMode: (mode: ApprovalModeObject | undefined) => void;
  /** Theme paths this run was started with, so `/theme` can still select them. */
  readonly themePaths?: readonly string[];
  readonly exit?: (code?: number) => void;
  readonly stopSignal?: AbortSignal;
}

export async function runInteractiveLoop(input: InteractiveLoopInput): Promise<void> {
  const stdin = input.stdin ?? process.stdin;
  const stdout = input.stdout ?? process.stdout;
  const terminate = input.exit ?? ((code?: number) => process.exit(code));
  let exiting = false;
  const exit = (code = 0): void => {
    if (exiting) return;
    exiting = true;
    void Promise.resolve().then(() => input.initialMcpGateway.close?.()).then(
      () => terminate(code),
      () => {
        input.renderer.renderLine("MCP connection cleanup failed; process exit was not verified.");
        terminate(1);
      },
    );
  };

  if (!supportsFullScreenSurface(stdin, stdout)) {
    await runLineLoop({
      stdin,
      process: input.process ?? process,
      runtimeContext: input.runtimeContext,
      sessionRuntime: input.sessionRuntime,
      sessionManager: input.sessionManager,
      renderer: input.renderer,
      logger: input.logger,
      approvalTrustPolicy: input.approvalTrustPolicy,
      fallbackSessionId: input.fallbackSessionId,
      initialMcpGateway: input.initialMcpGateway,
      setReadline: input.setReadline,
      setActiveNonInteractiveApprovalMode: input.setActiveNonInteractiveApprovalMode,
      exit,
      stopSignal: input.stopSignal,
    });
    return;
  }

  await new Promise<void>((resolve, reject) => {
  const mode = new InteractiveMode({
    runtimeContext: input.runtimeContext,
    sessionRuntime: input.sessionRuntime,
    sessionManager: input.sessionManager,
    renderer: input.renderer,
    logger: input.logger,
    approvalTrustPolicy: input.approvalTrustPolicy,
    fallbackSessionId: input.fallbackSessionId,
    initialMcpGateway: input.initialMcpGateway,
    setReadline: input.setReadline,
    setInteractiveApprovalPrompt: input.setInteractiveApprovalPrompt,
    setActiveNonInteractiveApprovalMode: input.setActiveNonInteractiveApprovalMode,
    exit: code => { release(); exit(code); resolve(); },
  });
  const stop = () => { release(); mode.stop(); resolve(); };
  const release = () => input.stopSignal?.removeEventListener('abort', stop);
  input.stopSignal?.addEventListener('abort', stop, { once: true });
  try { mode.start(); if (input.stopSignal?.aborted) stop(); }
  catch (error) { release(); mode.stop(); reject(error); }
  });
}
