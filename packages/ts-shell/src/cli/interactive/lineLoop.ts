import readline from "node:readline";
import type { Interface as ReadlineInterface } from "node:readline";
import type { ApprovalTrustPolicy } from "../../core/shell/approvalTrustPolicy.js";
import type { ShellRuntimeContext } from "../../core/shell/runtimeContext.js";
import type { ShellSessionRuntime } from "../../core/shell/sessionRuntime.js";
import type { CliMcpGateway } from "../../entrypoints/cliMcpModule.js";
import type { StructuredLogger } from "../../observability/structuredLogger.js";
import type { StreamingRenderer } from "../../presentation/terminal/streaming.js";
import type { SessionManager } from "../../session/SessionManager.js";
import type { ApprovalModeObject } from "../approval/approvalModeContract.js";
import { routeInteractiveCommand } from "./interactiveCommandRouter.js";
import { buildInteractivePromptChrome, refreshInteractivePromptChrome } from "./promptChrome.js";
import { installInteractiveCloseHandler, installInteractiveSignalHandlers } from "./interactiveSignals.js";

/**
 * Line-oriented interactive loop for a session without a real terminal.
 *
 * A differential full-screen renderer needs cursor addressing and a window size;
 * over a pipe it has neither, so it would emit escape sequences into a byte
 * stream nobody interprets. This loop is the honest surface for that case: plain
 * prompts, plain output, readline for editing and questions. It is what a script,
 * a CI job, or a harness driving the CLI over stdio gets.
 */

export interface LineLoopOptions {
  readonly stdin: NodeJS.ReadStream;
  readonly process: NodeJS.Process;
  readonly runtimeContext: ShellRuntimeContext;
  readonly sessionRuntime: ShellSessionRuntime;
  readonly sessionManager: SessionManager;
  readonly renderer: StreamingRenderer;
  readonly logger: StructuredLogger;
  readonly approvalTrustPolicy: ApprovalTrustPolicy;
  readonly fallbackSessionId?: string;
  readonly initialMcpGateway: CliMcpGateway;
  readonly setReadline: (readline: ReadlineInterface | null) => void;
  readonly setActiveNonInteractiveApprovalMode: (mode: ApprovalModeObject | undefined) => void;
  readonly exit: (code?: number) => void;
}

/** Run until stdin closes, resolving once the loop has finished. */
export async function runLineLoop(options: LineLoopOptions): Promise<void> {
  const prompt = (): string =>
    buildInteractivePromptChrome({
      projectRoot: options.runtimeContext.projectRoot,
      sessionId: options.runtimeContext.session.id,
      agentMode: options.sessionRuntime.getAgentMode(),
    });

  const input = readline.createInterface({
    input: options.stdin,
    output: process.stdout,
    terminal: false,
    prompt: prompt(),
  });
  options.setReadline(input);

  installInteractiveSignalHandlers({
    process: options.process,
    readline: input,
    sessionRuntime: options.sessionRuntime,
    renderer: options.renderer,
    runtimeContext: options.runtimeContext,
    exit: options.exit,
  });
  installInteractiveCloseHandler({
    readline: input,
    sessionRuntime: options.sessionRuntime,
    renderer: options.renderer,
    runtimeContext: options.runtimeContext,
    exit: options.exit,
  });

  let turnNumber = 0;
  const mcpGateway = options.initialMcpGateway;
  let chain = Promise.resolve();

  input.prompt();
  input.on("line", (line) => {
    const text = line.trim();
    if (!text) {
      input.prompt();
      return;
    }
    // Serialise turns: readline delivers the next line as soon as it arrives,
    // and two concurrent turns would interleave their output and their session
    // writes.
    chain = chain.then(async () => {
      const result = await routeInteractiveCommand({
        prompt: text,
        readline: input,
        mcpGateway,
        fallbackSessionId: options.fallbackSessionId,
        sessionManager: options.sessionManager,
        runtimeContext: options.runtimeContext,
        renderer: options.renderer,
        sessionRuntime: options.sessionRuntime,
        logger: options.logger,
        approvalTrustPolicy: options.approvalTrustPolicy,
        turnNumber,
        setActiveNonInteractiveApprovalMode: options.setActiveNonInteractiveApprovalMode,
      });
      turnNumber = result.turnNumber;
      if (result.exitRequested) {
        input.close();
        return;
      }
      if (result.refreshMcpGateway) await mcpGateway.syncWorkspace?.();
      if (result.refreshPromptChrome) {
        refreshInteractivePromptChrome({
          readline: input,
          projectRoot: options.runtimeContext.projectRoot,
          sessionId: options.runtimeContext.session.id,
          agentMode: options.sessionRuntime.getAgentMode(),
        });
      }
      input.prompt();
    });
  });

  await new Promise<void>((resolve) => {
    input.on("close", () => resolve());
  });
}
