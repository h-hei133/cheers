import type * as readline from "node:readline";
import type { ApprovalTrustPolicy } from "../../core/shell/approvalTrustPolicy.js";
import type { ShellRuntimeContext } from "../../core/shell/runtimeContext.js";
import type { ShellSessionRuntime } from "../../core/shell/sessionRuntime.js";
import type { StructuredLogger } from "../../observability/structuredLogger.js";
import type { StreamingRenderer } from "../../renderer/StreamingRenderer.js";
import type { SessionManager } from "../../session/SessionManager.js";
import type { ApprovalModeObject } from "../approval/approvalModeContract.js";
import type { CliMcpGateway } from "../../entrypoints/cliMcpModule.js";
import { InteractiveMode } from "./interactiveMode.js";
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
  readonly setActiveNonInteractiveApprovalMode: (mode: ApprovalModeObject | undefined) => void;
  readonly exit?: (code?: number) => never;
}

export async function runInteractiveLoop(input: InteractiveLoopInput): Promise<void> {
  const stdin = input.stdin ?? process.stdin;
  const stdout = input.stdout ?? process.stdout;
  const exit = input.exit ?? ((code?: number) => process.exit(code) as never);

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
    });
    return;
  }

  new InteractiveMode({
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
  }).start();
}
