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
import { handoffControl } from '../runtime/handoff.js';
import { directorControl } from '../runtime/director.js';
import { evaluationControl, cancelEvaluationFor } from '../runtime/evaluation.js';
import { mediaControl, cancelMediaCommand, excludeRecordingInput } from '../runtime/media.js';
import { isSecurityControl } from '../runtime/security.js';
import { isAgentsControl } from '../runtime/agents.js';
import { isCollaborationControl, runCollaborationControl } from '../collaboration/control.js';
import { sshControl, runSshControl } from '../ssh/control.js';
import { cancelSshFor } from '../runtime/ssh.js';
import { cancelCollaborationFor } from '../runtime/collaboration.js';
import { isExtensionControl } from '../runtime/extensions.js';
import { isMcpRequest, isMcpConfiguration, mcpControl } from '../mcp/content.js';
import { cancelMcpFor } from '../runtime/mcp.js';
import { runCliMcpCommand } from '../../entrypoints/cliMcpModule.js';
import { isAdvisorControl } from '../runtime/advisor.js';
import { isResearchControl } from '../runtime/research.js';
import { bindOutputFailure } from './outputFailure.js';
import { configurationAdmission } from '../../core/shell/configuration.js';

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
  readonly stdout: NodeJS.WriteStream;
  readonly process: NodeJS.Process;
  readonly runtimeContext: ShellRuntimeContext;
  readonly sessionRuntime: ShellSessionRuntime;
  readonly sessionManager: SessionManager;
  readonly renderer: StreamingRenderer;
  readonly logger: StructuredLogger;
  readonly approvalTrustPolicy: ApprovalTrustPolicy;
  readonly fallbackSessionId?: string;
  readonly onFirstFrame?: () => void;
  readonly onUserIntent?: () => void;
  readonly initialMcpGateway: CliMcpGateway;
  readonly setReadline: (readline: ReadlineInterface | null) => void;
  readonly setActiveNonInteractiveApprovalMode: (mode: ApprovalModeObject | undefined) => void;
  readonly exit: (code?: number) => void;
  readonly stopSignal?: AbortSignal;
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
    output: options.stdout,
    terminal: false,
    prompt: prompt(),
  });
  let goalOutputActive = true;
  let rendererRestored = false;
  const pendingGoalDispatches = new Set<Promise<void>>();
  const restoreRenderer = options.renderer.setSink({
    line: line => { if (goalOutputActive) options.stdout.write(`${line}\n`); },
    chunk: chunk => { if (goalOutputActive) options.stdout.write(chunk); },
  }, { ownsTranscript: false });
  let questionInput: ReadlineInterface | undefined;
  let releaseSignals: (() => void) | undefined;
  let releaseInputQueue: (() => void) | undefined;
  let releaseGoalSubmission: (() => void) | undefined;
  let goalReleased = false;
  let cleaned = false;
  let closed = false;
  let failed = false;
  let lineInputFailure: { readonly cause: unknown } | undefined;
  let failLineLoop: ((error: unknown) => void) | undefined;
  const detachOutputFailure = bindOutputFailure(options.stdout, error => {
    if (cleaned) return;
    if (failLineLoop) failLineLoop(error);
    else lineInputFailure ??= { cause: error };
  });
  let settleLoop: (() => void) | undefined;
  let firstFrameReported = false;
  const reportFirstFrame = (): void => {
    if (cleaned || closed || firstFrameReported) return;
    firstFrameReported = true;
    options.onFirstFrame?.();
  };
  const reportFirstFrameAfterPrompt = (): void => {
    if (!options.onFirstFrame) return;
    options.stdout.write("", (error) => {
      if (cleaned || closed) return;
      if (error) {
        if (failLineLoop) failLineLoop(error);
        else lineInputFailure ??= { cause: error };
        return;
      }
      reportFirstFrame();
    });
  };
  let userIntentSeen = false;
  const noteInput = (): void => {
    if (userIntentSeen) return;
    userIntentSeen = true;
    options.onUserIntent?.();
  };
  const attempt = (stage: string, action: () => void): void => {
    try {
      action();
    } catch (error) {
      try {
        options.logger.warn("Line loop cleanup failed", {
          stage,
          error: error instanceof Error ? error.message : String(error),
        });
      } catch {
        // Cleanup continues even when the logger is unavailable.
      }
    }
  };
  const releaseGoal = (): void => {
    if (goalReleased) return;
    goalReleased = true;
    attempt("goal submission", () => releaseGoalSubmission?.());
  };
  const cleanup = (failedBeforeCleanup: boolean): void => {
    if (cleaned) return;
    cleaned = true;
    attempt("input listener", () => options.stdin.off("data", noteInput));
    try {
      // A failed initialization must not turn into a successful session close.
      if (failedBeforeCleanup) attempt("signal handler", () => releaseSignals?.());
      attempt("readline", () => input.close());
      attempt("question bridge", () => questionInput?.close());
      attempt("signal handler", () => releaseSignals?.());
    } finally {
      releaseGoal();
      attempt("input queue", () => releaseInputQueue?.());
      goalOutputActive = false;
      if (pendingGoalDispatches.size === 0) {
        rendererRestored = true;
        attempt("renderer sink", restoreRenderer);
      } else {
        void Promise.allSettled([...pendingGoalDispatches]).then(() => {
          if (rendererRestored) return;
          rendererRestored = true;
          attempt("renderer sink", restoreRenderer);
        });
      }
    }
  };
  try {
    options.stdin.on("data", noteInput);
    // All lines reach control routing before they can be consumed as question answers.
    const questions = new QuestionBridge({ ask: question => { options.renderer.renderLine(question); input.prompt(); }, settle: () => input.prompt() });
    const activeQuestionInput = questions.asReadline(() => input.close());
    questionInput = activeQuestionInput;
    excludeRecordingInput(options.runtimeContext, () => Boolean(questions.question()));
    options.setReadline(activeQuestionInput);

    releaseSignals = installInteractiveSignalHandlers({
      process: options.process,
      readline: activeQuestionInput,
      sessionRuntime: options.sessionRuntime,
      renderer: options.renderer,
      runtimeContext: options.runtimeContext,
      sessionManager: options.sessionManager,
      exit: options.exit,
    });

    let turnNumber = 0;
    const mcpGateway = options.initialMcpGateway;
    let chain = Promise.resolve();
    let busy = false;
    const controlAbort = new AbortController();
    const queue = new SubmissionQueue(() => options.runtimeContext.session, () => {
      options.renderer.renderLine('Queued input was not executed because the session changed. Queue it again explicitly.');
    });
    const goalRenderer = new Proxy(options.renderer, {
      get(target, property) {
        if (property === "renderLine") {
          return (line: string): void => { if (goalOutputActive) target.renderLine(line); };
        }
        if (property === "renderChunk") {
          return (chunk: string): void => { if (goalOutputActive) target.renderChunk(chunk); };
        }
        if (property === "renderReport") {
          return (report: Parameters<StreamingRenderer["renderReport"]>[0]): void => {
            if (goalOutputActive) target.renderReport(report);
          };
        }
        if (property === "clearLine") {
          return (): void => { if (goalOutputActive) target.clearLine(); };
        }
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    let releaseRound: (() => void) | undefined; let roundBarrier = Promise.resolve();
    const dispatch = async (
      text: string,
      promptMetadata?: Record<string, unknown>,
      renderer: StreamingRenderer = options.renderer,
    ): Promise<void> => {
      busy = true;
      try {
        const result = await routeInteractiveCommand({ prompt: text, ...(promptMetadata ? { promptMetadata } : {}), readline: activeQuestionInput, mcpGateway,
          signal: controlAbort.signal,
          fallbackSessionId: options.fallbackSessionId, sessionManager: options.sessionManager,
          runtimeContext: options.runtimeContext, renderer, sessionRuntime: options.sessionRuntime,
          logger: options.logger, approvalTrustPolicy: options.approvalTrustPolicy, turnNumber,
          setActiveNonInteractiveApprovalMode: options.setActiveNonInteractiveApprovalMode });
        turnNumber = result.turnNumber;
        if (result.retryDraft !== undefined && !closed) {
          input.write(result.retryDraft);
          options.renderer.renderLine('Composition was not submitted; the original draft is available for retry.');
        }
        if (result.exitRequested) { input.close(); return; }
        if (result.refreshMcpGateway) await mcpGateway.syncWorkspace?.();
        if (result.refreshPromptChrome) refreshInteractivePromptChrome({ readline: input, projectRoot: options.runtimeContext.projectRoot,
          sessionId: options.runtimeContext.session.id, agentMode: options.sessionRuntime.getAgentMode() });
      } finally {
        if (!promptMetadata) busy = false;
        if (!closed) input.prompt();
      }
    };
    const scheduleDrain = (): void => {
      chain = chain.then(async () => {
        await roundBarrier;
        await options.sessionRuntime.waitForIdle().catch(() => undefined);
        const text = queue.shift(); if (text !== undefined) await dispatch(text);
      }).catch(error => { options.renderer.renderLine(`Queued turn failed: ${error instanceof Error ? error.message : 'runtime failure'}`); });
    };
    releaseInputQueue = attachInputQueue(options.sessionRuntime, {
      control: queue.control, enqueue: text => queue.push(text), drain: scheduleDrain,
    });
    const pendingControls = new Set<Promise<void>>();
    const cancelPending = (): void => {
      attempt("MCP control", () => controlAbort.abort());
      attempt("SSH control", () => cancelSshFor(options.runtimeContext));
      attempt("collaboration control", () => cancelCollaborationFor(options.runtimeContext));
      attempt("current run", () => options.sessionRuntime.cancelCurrentRun());
      releaseGoal();
    };
    const handleLineFailure = (error: unknown): void => {
      if (cleaned || lineInputFailure) return;
      if (closed) {
        try {
          options.logger.warn("Line control failed after close", {
            error: error instanceof Error ? error.message : String(error),
          });
        } catch {
          // A late failure is already fenced by the closed state.
        }
        return;
      }
      lineInputFailure = { cause: error };
      closed = true;
      goalOutputActive = false;
      try {
        options.logger.error("Line input handling failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      } catch {
        // The line failure still has to reach the caller and cleanup.
      }
      cancelPending();
      attempt("submission queue", () => queue.splice(0));
      attempt("signal handler", () => releaseSignals?.());
      attempt("readline", () => input.close());
      settleLoop?.();
    };
    failLineLoop = handleLineFailure;
    if (lineInputFailure) {
      const pending = lineInputFailure.cause;
      lineInputFailure = undefined;
      handleLineFailure(pending);
    }
    const trackPending = (run: Promise<unknown>, onError?: (error: unknown) => void): void => {
      const tracked = run.then(
        () => { pendingControls.delete(tracked); },
        error => {
          pendingControls.delete(tracked);
          onError?.(error);
        },
      );
      pendingControls.add(tracked);
    };
    const trackControl = (run: Promise<unknown>): void => {
      trackPending(run, failLineLoop);
    };
    const goalRoundCompletions: (() => void)[] = [];
    const beginGoalRoundCompletion = (): void => {
      let resolve!: () => void;
      const completion = new Promise<void>(done => { resolve = done; });
      pendingControls.add(completion);
      goalRoundCompletions.push(() => {
        resolve();
        pendingControls.delete(completion);
      });
    };
    const completeGoalRound = (): void => {
      goalRoundCompletions.shift()?.();
    };
    const settleControls = async (): Promise<void> => {
      while (pendingControls.size > 0) {
        await Promise.all([...pendingControls]);
      }
    };
    releaseGoalSubmission = attachGoalSubmission(options.sessionRuntime, {
      ready: () => !closed && !busy && queue.length === 0 && !input.line.trim() && !questions.question(),
      submit: (prompt, metadata) => {
        roundBarrier = new Promise<void>(resolve => { releaseRound = resolve; });
        beginGoalRoundCompletion();
        const run = dispatch(prompt, metadata, goalRenderer);
        const tracked = run.then(
          () => { pendingGoalDispatches.delete(tracked); },
          () => { pendingGoalDispatches.delete(tracked); },
        );
        pendingGoalDispatches.add(tracked);
        return run;
      },
      settled: () => {
        busy = false;
        releaseRound?.();
        releaseRound = undefined;
        completeGoalRound();
      },
    });

    input.prompt();
    reportFirstFrameAfterPrompt();
    input.on("line", (line) => {
      try {
        const text = line;
        const controlSource = text.startsWith('/') ? text : '';
        const mcp = mcpControl(controlSource);
        const ssh = sshControl(controlSource);
        const evaluation = evaluationControl(controlSource);
        const media = mediaControl(controlSource);
        if (media?.stop) { queue.cancelWhere(value => new RegExp(`^/${media.name}(?:\\s|$)`, 'i').test(value.trim())); cancelMediaCommand(options.runtimeContext, media.name, media.args[0]?.toLowerCase() === 'stop' ? 'stopped' : 'cancelled'); }
        if (evaluation === 'stop') {
          queue.cancelWhere(value => /^\/improve(?:\s|$)/i.test(value.trim())); cancelEvaluationFor(options.runtimeContext);
        }
        if (ssh && (busy || questions.question() || ssh.action === 'cancel-pending')) {
          if (ssh.action === 'cancel-pending') queue.cancelWhere(value => /^\/ssh(?:\s|$)/i.test(value.trim()));
          trackControl(runSshControl(text, options.runtimeContext, options.renderer, Boolean(questions.question()))
            .then(() => { if (!closed) input.prompt(); }));
          return;
        }
        if (isCollaborationControl(controlSource) && (busy || questions.question())) {
          trackControl(runCollaborationControl(text, options.runtimeContext, options.renderer, Boolean(questions.question()))
            .then(() => { if (!closed) input.prompt(); }));
          return;
        }
        if (mcp && (mcp.action === 'cancel' || busy || questions.question())) {
          if (mcp.action === 'cancel') { queue.cancelWhere(isMcpRequest); cancelMcpFor(options.runtimeContext); }
          trackControl(runCliMcpCommand({ gateway: mcpGateway, renderer: options.renderer,
            projectRoot: options.runtimeContext.cwd,
            admission: configurationAdmission(options.runtimeContext),
            mcpAction: mcp.action, mcpTarget: mcp.target, signal: controlAbort.signal })
            .then(() => { if (!closed) input.prompt(); })
          );
          return;
        }
        if (isMcpConfiguration(controlSource) && questions.question()) {
          options.renderer.renderLine('MCP configuration control refused while another approval or question is pending; answer it first.'); input.prompt(); return;
        }
        if (isAgentsControl(controlSource) && questions.question()) {
          options.renderer.renderLine('Agent control refused while another approval or question is pending; answer it first.'); input.prompt(); return;
        }
        if (directorControl(controlSource) && questions.question() && !/^\/director(?:\s+(?:status|off|show|output)(?:\s|$)|\s*$)/i.test(text.trim())) {
          options.renderer.renderLine('Director assignment waits for the pending approval or question.'); input.prompt(); return;
        }
        // Serialise turns: readline delivers the next line as soon as it arrives,
        // and two concurrent turns would interleave their output and their session
        // writes.
        if (isQueueControl(controlSource) || (busy || questions.question()) && (media || evaluation || isGoalControl(controlSource) || isPlanningControl(controlSource) || handoffControl(controlSource) || directorControl(controlSource) || isAdvisorControl(controlSource) || isSecurityControl(controlSource) || isAgentsControl(controlSource) || isResearchControl(controlSource) || isExtensionControl(controlSource) || isMcpConfiguration(controlSource))) {
          trackControl(routeInteractiveCommand({ prompt: text, signal: controlAbort.signal, readline: activeQuestionInput, mcpGateway, sessionManager: options.sessionManager,
            runtimeContext: options.runtimeContext, renderer: options.renderer, sessionRuntime: options.sessionRuntime,
            logger: options.logger, approvalTrustPolicy: options.approvalTrustPolicy, turnNumber,
            setActiveNonInteractiveApprovalMode: options.setActiveNonInteractiveApprovalMode })
            .then(() => { if (!closed) input.prompt(); })
          );
          return;
        }
        if (questions.answer(line)) return;
        if (!text.trim()) { input.prompt(); return; }
        queue.push(text); scheduleDrain();
      } catch (error) {
        handleLineFailure(error);
      }
    });

    await new Promise<void>((resolve) => {
      let settled = false;
      const settle = (): void => {
        if (settled) return;
        settled = true;
        resolve();
      };
      settleLoop = settle;
      if (lineInputFailure) {
        closed = true;
        settle();
        return;
      }
      const stop = () => {
        closed = true;
        attempt("startup hint", noteInput);
        cancelPending();
        try {
          attempt("signal handler", () => releaseSignals?.());
          queue.splice(0);
        } finally {
          attempt("readline", () => input.close());
          settle();
        }
      };
      options.stopSignal?.addEventListener('abort', stop, { once: true });
      input.on("close", () => {
        try {
          closed = true;
          attempt("startup hint", noteInput);
          cancelPending();
          attempt("question bridge", () => questionInput?.close());
          attempt("signal handler", () => releaseSignals?.());
        } finally {
          options.stopSignal?.removeEventListener('abort', stop);
          settle();
        }
      });
      if (options.stopSignal?.aborted) stop();
    });
    await settleControls();
    await chain;
    const terminalFailure = lineInputFailure as { readonly cause: unknown } | undefined;
    if (terminalFailure) throw terminalFailure.cause;
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    detachOutputFailure();
    cleanup(failed);
  }
}
