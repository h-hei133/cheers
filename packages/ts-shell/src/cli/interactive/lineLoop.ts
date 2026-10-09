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
import { installInteractiveSignalHandlers } from "./interactiveSignals.js";
import { attachGoalSubmission } from '../runtime/goalScheduling.js';
import { isGoalControl } from '../runtime/goal.js';
import { QuestionBridge } from './questionBridge.js';
import { attachInputQueue, isQueueControl } from '../runtime/inputQueue.js';
import { SubmissionQueue } from './inputQueue.js';
import { isPlanningControl } from '../runtime/planning.js';
import { isSecurityControl } from '../runtime/security.js';
import { isAdvisorControl } from '../runtime/advisor.js';
import { isResearchControl } from '../runtime/research.js';

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
  // All lines reach control routing before they can be consumed as question answers.
  const questions = new QuestionBridge({ ask: question => { options.renderer.renderLine(question); input.prompt(); }, settle: () => input.prompt() });
  const questionInput = questions.asReadline(() => input.close());
  options.setReadline(questionInput);

  installInteractiveSignalHandlers({
    process: options.process,
    readline: questionInput,
    sessionRuntime: options.sessionRuntime,
    renderer: options.renderer,
    runtimeContext: options.runtimeContext,
    sessionManager: options.sessionManager,
    exit: options.exit,
  });

  let turnNumber = 0;
  const mcpGateway = options.initialMcpGateway;
  let chain = Promise.resolve();
  let busy = false; let closed = false;
  const queue = new SubmissionQueue(() => options.runtimeContext.session, () => {
    options.renderer.renderLine('Queued input was not executed because the session changed. Queue it again explicitly.');
  });
  let releaseRound: (() => void) | undefined; let roundBarrier = Promise.resolve();
  const dispatch = async (text: string, promptMetadata?: Record<string, unknown>): Promise<void> => {
    busy = true;
    try {
      const result = await routeInteractiveCommand({ prompt: text, ...(promptMetadata ? { promptMetadata } : {}), readline: questionInput, mcpGateway,
        fallbackSessionId: options.fallbackSessionId, sessionManager: options.sessionManager,
        runtimeContext: options.runtimeContext, renderer: options.renderer, sessionRuntime: options.sessionRuntime,
        logger: options.logger, approvalTrustPolicy: options.approvalTrustPolicy, turnNumber,
        setActiveNonInteractiveApprovalMode: options.setActiveNonInteractiveApprovalMode });
      turnNumber = result.turnNumber;
      if (result.exitRequested) { input.close(); return; }
      if (result.refreshMcpGateway) await mcpGateway.syncWorkspace?.();
      if (result.refreshPromptChrome) refreshInteractivePromptChrome({ readline: input, projectRoot: options.runtimeContext.projectRoot,
        sessionId: options.runtimeContext.session.id, agentMode: options.sessionRuntime.getAgentMode() });
    } finally { if (!promptMetadata) busy = false; input.prompt(); }
  };
  const scheduleDrain = (): void => {
    chain = chain.then(async () => {
      await roundBarrier;
      await options.sessionRuntime.waitForIdle().catch(() => undefined);
      const text = queue.shift(); if (text !== undefined) await dispatch(text);
    }).catch(error => { options.renderer.renderLine(`Queued turn failed: ${error instanceof Error ? error.message : 'runtime failure'}`); });
  };
  const releaseInputQueue = attachInputQueue(options.sessionRuntime, {
    control: queue.control, enqueue: text => queue.push(text), drain: scheduleDrain,
  });
  const releaseGoalSubmission = attachGoalSubmission(options.sessionRuntime, {
    ready: () => !closed && !busy && queue.length === 0 && !input.line.trim() && !questions.question(),
    submit: (prompt, metadata) => {
      roundBarrier = new Promise<void>(resolve => { releaseRound = resolve; });
      return dispatch(prompt, metadata);
    },
    settled: () => { busy = false; releaseRound?.(); releaseRound = undefined; },
  });

  input.prompt();
  input.on("line", (line) => {
    const text = line.trim();
    // Serialise turns: readline delivers the next line as soon as it arrives,
    // and two concurrent turns would interleave their output and their session
    // writes.
    if (isQueueControl(text) || (busy || questions.question()) && (isGoalControl(text) || isPlanningControl(text) || isAdvisorControl(text) || isSecurityControl(text) || isResearchControl(text))) {
      void routeInteractiveCommand({ prompt: text, readline: questionInput, mcpGateway, sessionManager: options.sessionManager,
        runtimeContext: options.runtimeContext, renderer: options.renderer, sessionRuntime: options.sessionRuntime,
        logger: options.logger, approvalTrustPolicy: options.approvalTrustPolicy, turnNumber,
        setActiveNonInteractiveApprovalMode: options.setActiveNonInteractiveApprovalMode }).then(() => input.prompt());
      return;
    }
    if (questions.answer(line)) return;
    if (!text) { input.prompt(); return; }
    queue.push(text); scheduleDrain();
  });

  await new Promise<void>((resolve) => {
    input.on("close", () => { closed = true; questionInput.close(); releaseGoalSubmission?.(); releaseInputQueue(); resolve(); });
  });
  await chain;
}
