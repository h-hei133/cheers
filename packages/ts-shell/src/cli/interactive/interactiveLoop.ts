import process from "node:process";
import * as readline from "node:readline";

import type { ApprovalTrustPolicy } from "../../core/shell/approvalTrustPolicy.js";
import type { ShellRuntimeContext } from "../../core/shell/runtimeContext.js";
import type { ShellSessionRuntime } from "../../core/shell/sessionRuntime.js";
import type { StructuredLogger } from "../../observability/structuredLogger.js";
import type { StreamingRenderer } from "../../renderer/StreamingRenderer.js";
import type { SessionManager } from "../../session/SessionManager.js";
import type { ApprovalModeObject } from "../../entrypoints/cliApprovalModule.js";
import {
  createCliMcpGateway,
  type CliMcpGateway,
} from "../../entrypoints/cliMcpModule.js";
import { installInteractiveCancellation } from "./interactiveCancellation.js";
import { routeInteractiveCommand } from "./interactiveCommandRouter.js";
import {
  installInteractiveCloseHandler,
  installInteractiveSignalHandlers,
} from "./interactiveSignals.js";
import {
  buildInteractivePromptChrome,
  refreshInteractivePromptChrome,
} from "./promptChrome.js";

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
  const activeProcess = input.process ?? process;
  const stdin = input.stdin ?? process.stdin;
  const stdout = input.stdout ?? process.stdout;
  const exit = input.exit ?? process.exit;
  let mcpGateway = input.initialMcpGateway;
  let interactiveTurnNumber = 0;
  let interactiveTurnInFlight = false;

  const rl = readline.createInterface({
    input: stdin,
    output: stdout,
    prompt: buildInteractivePromptChrome({
      projectRoot: input.runtimeContext.projectRoot,
      sessionId: input.runtimeContext.session.id,
      agentMode: input.sessionRuntime.getAgentMode(),
    }),
  });
  input.setReadline(rl);

  const refreshPrompt = (): void => {
    refreshInteractivePromptChrome({
      readline: rl,
      projectRoot: input.runtimeContext.projectRoot,
      sessionId: input.runtimeContext.session.id,
      agentMode: input.sessionRuntime.getAgentMode(),
    });
  };

  const refreshMcpGateway = (): void => {
    mcpGateway = createCliMcpGateway(input.runtimeContext.cwd);
  };

  installInteractiveSignalHandlers({
    process: activeProcess,
    readline: rl,
    sessionRuntime: input.sessionRuntime,
    renderer: input.renderer,
    runtimeContext: input.runtimeContext,
    exit,
  });
  installInteractiveCloseHandler({
    readline: rl,
    sessionRuntime: input.sessionRuntime,
    renderer: input.renderer,
    runtimeContext: input.runtimeContext,
    exit,
  });
  installInteractiveCancellation({
    stdin,
    readline: rl,
    sessionRuntime: input.sessionRuntime,
    renderer: input.renderer,
  });

  rl.on("line", async (line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      rl.prompt();
      return;
    }
    if (interactiveTurnInFlight) {
      input.renderer.renderLine(
        "\nA turn is already running. Please wait for completion before submitting another prompt.\n",
      );
      rl.prompt();
      return;
    }
    interactiveTurnInFlight = true;
    rl.pause();

    try {
      const result = await routeInteractiveCommand({
        prompt: trimmed,
        readline: rl,
        mcpGateway,
        fallbackSessionId: input.fallbackSessionId,
        sessionManager: input.sessionManager,
        runtimeContext: input.runtimeContext,
        renderer: input.renderer,
        sessionRuntime: input.sessionRuntime,
        logger: input.logger,
        approvalTrustPolicy: input.approvalTrustPolicy,
        turnNumber: interactiveTurnNumber,
        setActiveNonInteractiveApprovalMode:
          input.setActiveNonInteractiveApprovalMode,
      });
      interactiveTurnNumber = result.turnNumber;
      if (result.refreshMcpGateway) {
        refreshMcpGateway();
      }
      if (result.refreshPromptChrome) {
        refreshPrompt();
      }
      rl.prompt();
    } finally {
      interactiveTurnInFlight = false;
      rl.resume();
    }
  });

  rl.prompt();
}
