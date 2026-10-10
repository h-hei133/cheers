import readline from 'node:readline';
import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { ShellSessionRuntime } from '../../core/shell/sessionRuntime.js';
import type { StreamingRenderer } from '../../presentation/terminal/streaming.js';
import type { StructuredLogger } from '../../observability/structuredLogger.js';
import { formatCliContextTag } from '../../entrypoints/cliInteractiveLoopState.js';
import { isFenceLine, opensMultilineLiteralPrompt, parseTransportPrompts, updateFenceState } from '../../core/shell/printPromptInput.js';
import { SubmissionQueue } from '../interactive/inputQueue.js';
import { attachInputQueue, isQueueControl } from './inputQueue.js';
import { isGoalControl } from './goal.js';
import { isSecurityControl } from './security.js';
import { isAgentsControl } from './agents.js';
import { isExtensionControl } from './extensions.js';
import { isMcpRequest, isMcpConfiguration, isMcpControl, mcpControl } from '../mcp/content.js';
import { cancelMcpFor } from './mcp.js';
import { sshControl } from '../ssh/control.js';
import { jobsControl } from '../jobs/control.js';
import { cancelSshFor } from './ssh.js';
import { isAdvisorControl } from './advisor.js';
import { isResearchControl } from './research.js';
import { isPlanningStreamControl } from './planning.js';
import { handoffControl } from './handoff.js';
import { directorControl } from './director.js';
import { attachGoalSubmission, schedulerForRuntime } from './goalScheduling.js';

export async function runPromptInputStream(options: {
  readonly stdin?: NodeJS.ReadableStream;
  readonly runtimeContext: ShellRuntimeContext;
  readonly sessionRuntime: ShellSessionRuntime;
  readonly renderer: StreamingRenderer;
  readonly logger: StructuredLogger;
  readonly runPrompt: (prompt: string) => Promise<'exit' | void>;
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
    input: options.stdin ?? process.stdin,
    crlfDelay: Infinity,
    terminal: false,
  });

  let processedCount = 0;
  let exitRequested = false;
  let turnChain = Promise.resolve();
  let controlChain = Promise.resolve();
  let localControlChain = Promise.resolve();
  let contentCancellation = Promise.resolve();
  let mcpCancellationGeneration = 0;
  let pendingControls = 0;
  let pendingPrompt: {
    lines: string[];
    inFence: boolean;
    multilineLiteral: boolean;
  } | null = null;

  let closed = false; let busy = false;
  let roundBarrier = Promise.resolve(); let releaseRound: (() => void) | undefined;
  const queue = new SubmissionQueue(() => options.runtimeContext.session, () => {
    options.renderer.renderLine('Queued input was not executed because the session changed. Queue it again explicitly.');
  });
  const dispatch = async (prompt: string): Promise<void> => {
    if (exitRequested) return;
    processedCount += 1;
    options.renderer.renderLine(`${contextTag()} > ${prompt}`);
    const outcome = await options.runPrompt(prompt);
    if (outcome === 'exit') { exitRequested = true; pendingPrompt = null; queue.splice(0); stdinReader.close(); }
  };
  const drain = (): void => {
    turnChain = turnChain.then(async () => {
      await roundBarrier;
      await options.sessionRuntime.waitForIdle().catch(() => undefined);
      // A cancellation can overtake this host's queue. Let it settle before
      // dispatching a later explicit request from that same queue.
      for (;;) {
        const cancellation = contentCancellation;
        await cancellation;
        if (cancellation === contentCancellation) break;
      }
      const prompt = queue.shift(); if (prompt === undefined || exitRequested) return;
      busy = true;
      try { await dispatch(prompt); } finally { busy = false; }
    }).catch(error => options.renderer.renderLine(`Run failed: ${error instanceof Error ? error.message : 'runtime failure'}`));
  };
  const enqueuePrompt = (prompt: string): void => {
    const cancellingContent = mcpControl(prompt)?.action === 'cancel';
    const ssh = sshControl(prompt);
    if (ssh && ['status', 'jobs', 'cancel-pending', 'disconnect'].includes(ssh.action)) {
      if (ssh.action === 'cancel-pending' || ssh.action === 'disconnect') {
        queue.cancelWhere(value => /^\/ssh(?:\s|$)/i.test(value.trim())); cancelSshFor(options.runtimeContext);
      }
      pendingControls++;
      localControlChain = localControlChain.then(() => dispatch(prompt))
        .catch(() => options.renderer.renderLine('Local SSH control is unavailable; retained remote jobs may still run.'))
        .finally(() => { pendingControls--; }); return;
    }
    if (cancellingContent) { mcpCancellationGeneration++; queue.cancelWhere(isMcpRequest); cancelMcpFor(options.runtimeContext); }
    if (isQueueControl(prompt) || isGoalControl(prompt) || isPlanningStreamControl(prompt) || handoffControl(prompt) || directorControl(prompt) || isAdvisorControl(prompt) || isSecurityControl(prompt) || isAgentsControl(prompt) || isResearchControl(prompt) || isExtensionControl(prompt) || isMcpControl(prompt) || isMcpConfiguration(prompt) || sshControl(prompt) || jobsControl(prompt)) {
      pendingControls += 1;
      const generation = mcpCancellationGeneration;
      controlChain = controlChain.then(() => {
        if (isMcpConfiguration(prompt) && generation !== mcpCancellationGeneration) {
          options.renderer.renderLine('Queued MCP configuration command cancelled before dispatch.'); return;
        }
        return dispatch(prompt);
      })
        .catch(error => options.renderer.renderLine(`Control failed: ${error instanceof Error ? error.message : 'runtime failure'}`))
        .finally(() => { pendingControls -= 1; });
      if (cancellingContent) contentCancellation = controlChain;
      return;
    }
    queue.push(prompt); drain();
  };
  const releaseQueue = attachInputQueue(options.sessionRuntime, { control: queue.control, enqueue: text => queue.push(text), drain });
  const releaseGoal = attachGoalSubmission(options.sessionRuntime, {
    ready: () => !closed && !busy && pendingControls === 0 && queue.length === 0 && !pendingPrompt,
    submit: async (prompt, promptMetadata) => {
      busy = true; roundBarrier = new Promise<void>(resolve => { releaseRound = resolve; });
      await options.sessionRuntime.executePrompt(options.runtimeContext.session.id, prompt, { promptMetadata, outputMode: 'print' });
    },
    settled: () => { busy = false; releaseRound?.(); releaseRound = undefined; },
  });

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
    if (exitRequested) return;
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
    stdinReader.once("close", () => { closed = true; resolve(); });
  });
  flushPendingPrompt();
  for (;;) {
    const localControls = localControlChain;
    await localControls;
    const controls = controlChain;
    await controls;
    const turns = turnChain;
    await turns;
    if (localControls === localControlChain && controls === controlChain && turns === turnChain) break;
  }
  await schedulerForRuntime(options.sessionRuntime)?.stop('cancelled');
  releaseGoal?.();
  releaseQueue();
  options.renderer.renderLine(
    `\nStdin stream closed. Processed ${processedCount} prompt(s).\n`,
  );
  options.logger.info("CLI non-TTY stdin stream mode closed", {
    sessionId: options.runtimeContext.session.id,
    processedCount,
  });
}
