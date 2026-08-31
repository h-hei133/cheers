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

export async function runInteractiveLoop(input: {
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
  readonly setActiveNonInteractiveApprovalMode: (
    mode: ApprovalModeObject | undefined,
  ) => void;
  readonly exit?: (code?: number) => never;
}): Promise<void> {
  const mode = new InteractiveMode({
    runtimeContext: input.runtimeContext,
    sessionRuntime: input.sessionRuntime,
    sessionManager: input.sessionManager,
    renderer: input.renderer,
    logger: input.logger,
    approvalTrustPolicy: input.approvalTrustPolicy,
    fallbackSessionId: input.fallbackSessionId,
    initialMcpGateway: input.initialMcpGateway,
    exit: input.exit,
  });

  mode.start();
}
