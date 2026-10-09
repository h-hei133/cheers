import type { ImageContent } from "../model-adapters/multimodal.js";
import { messageToText } from "../model-adapters/multimodal.js";
import { AgentCore } from "../core/agent/agent.js";
import { inputQueueControl } from '../core/agent/queue.js';
import type { AgentLifecycleEvent } from "../core/agent/events.js";
import type { AgentMessage } from "../core/agent/state.js";
import type { HookDispatcher } from "../core/hooks/hookDispatcher.js";
import type { QueryEvent } from "../core/query/runtime/events.js";
import type { SessionMessage } from "../session/schema/sessionMessage.js";
import {
  condenseContext,
  createCompactionStep,
  type CompactionPolicy,
  type CompactionReason,
  type SummarizeHistory,
  type SummarizeTurnPrefix,
} from "../session/compaction.js";
import { environmentLine } from "./prompt.js";
import { buildCompactionLifecycle } from "../core/shell/compaction.js";
import { concludeRun, TurnProjection } from "./projection.js";
import { EventChannel } from "./stream.js";
import { isOverflowFailure, type StepFunction } from "./step.js";
import { adaptTools, createToolHooks, type ToolGateOptions } from "./tools.js";
import { usageFromProvider } from "../provider/response/usage.js";
import type { SentRequest } from "../provider/request/sentRequest.js";
import { ModelAdmissionError } from '../core/agent/request/model.js';
import { createSubagentRunner } from "./subagent.js";
import type { DenyRule } from "../core/shell/approval/deny.js";
import type { CacheWarmingRunner } from "./cacheWarm.js";
import type { ToolDefinition } from "../tools/types.js";
import { getSessionUsage, recordRequestContext } from '../observability/usageTelemetry.js';

/**
 * One user turn, driven through the kernel.
 *
 * The kernel runs the model and its tools and reports what happened; this is
 * where the product decisions around it live. Which messages are persisted and
 * when, how the context is kept inside the window, what a run reports when it
 * ends, and how input typed while it runs reaches it — all of that is decided
 * here, so the kernel stays a pure loop and the shell keeps reading the event
 * stream it always has.
 */

export interface CompactionSetup {
  readonly policy: CompactionPolicy;
  readonly summarize: SummarizeHistory;
  /**
   * Summarizes the opening of a turn the cut landed inside of.
   *
   * Only used when one turn is larger than the whole budget, which is the case
   * the history summary cannot cover: its request would otherwise be dropped
   * along with everything else.
   */
  readonly summarizeTurnPrefix?: SummarizeTurnPrefix;
  /** A checkpoint was written into the context; record it durably. */
  readonly onCompact: (input: { readonly summary: string; readonly keptMessages: number; readonly tokensBefore: number }) => void;
  /** Why this compaction is allowed to run. Manual runs say so. */
  readonly reason?: CompactionReason;
}

export interface TurnOptions {
  readonly correlationId?: string;
  readonly commandProof?: ToolGateOptions['commandProof'];
  /** Current-session objective, projected by the goal owner at CLI composition. */
  readonly goalObjective?: string;
  readonly workspaceRoots?: ToolGateOptions['workspaceRoots'];
  readonly admission?: ToolGateOptions['admission'];
  readonly sessionId: string;
  /** Where the session's files live, when the caller knows. Carried into the event stream. */
  readonly sessionPath?: string;
  readonly prompt: string;
  /** Historical context for this run; never persisted as a new user prompt. */
  readonly continuityContext?: string;
  /** Commit prepared prompt context after startup checks, immediately before kernel entry. */
  readonly onPromptAccepted?: () => void;
  /**
   * Images the user attached to this prompt.
   *
   * They become blocks on the opening message rather than a message of their own,
   * because they belong to the sentence the user wrote: a picture sent on its own
   * is not a turn, and a turn split in two would read as two things said.
   */
  readonly attachments?: { readonly images: readonly ImageContent[] };
  readonly workspaceRoot: string;
  readonly agentMode?: "plan" | "build";
  readonly permissionScope?: ToolGateOptions["permissionScope"];
  readonly escalationPromptHandler?: ToolGateOptions["escalationPromptHandler"];
  readonly interactiveAsk?: ToolGateOptions["interactiveAsk"];
  /** The conversation so far, without the prompt being sent. */
  readonly history: readonly SessionMessage[];
  /** A message the model saw or wrote has completed; keep it. */
  readonly onMessage: (message: SessionMessage) => void;
  readonly step: StepFunction;
  readonly tools: ReadonlyMap<string, ToolDefinition>;
  readonly hooks: HookDispatcher;
  /** Model steps a run may take before it is asked to conclude. */
  readonly maxSteps: number;
  readonly compaction?: CompactionSetup;
  readonly signal: AbortSignal;
  /** What a command the model runs should know about this session. */
  readonly commandEnv?: Readonly<Record<string, string>>;
  /**
   * What a subagent needs from the model side, when this session can delegate.
   *
   * A step and a budget, not a whole runner: the tool set a subagent may use has
   * to be adapted with this session's gate, and the session is where that gate
   * exists. A caller that composed the runner itself would be writing the gate
   * options out a second time, and the two lists drift — the first version of
   * this left the user's refusals out of the subagent's copy, so a rule held at
   * the front door and not at the one the subagent came through.
   */
  readonly subagentHost?: import('./subagent.js').SubagentHost;
  readonly checkpoint?: import('./checkpoint.js').TurnCheckpointHandler;
  readonly checkpointError?: (message: string) => void;
  /** Calls this session refuses outright; see `ToolGateOptions.denyRules`. */
  readonly denyRules?: readonly DenyRule[];
  /**
   * How a failed step is retried, resolved once by the caller.
   *
   * Absent means the turn layer's default, which is to retry. Resolved outside
   * so the setting is read once per run rather than once per attempt.
   */
  readonly retry?: {
    readonly enabled?: boolean;
    readonly maxRetries?: number;
    readonly baseDelayMs?: number;
    readonly maxDelayMs?: number;
  };
  /**
   * Keeping this run's prompt cached between requests.
   *
   * Absent means the session does not do it: the runner needs the model's prices
   * and a way to send a refresh, and a caller that supplies neither has opted
   * out by not supplying them.
   */
  readonly cacheWarming?: CacheWarmingRunner;
  /** How many queued steering messages reach the model at once. */
  readonly steeringMode?: "one-at-a-time" | "all";
  /** How many queued follow-up messages reach the model at once. */
  readonly followUpMode?: "one-at-a-time" | "all";
}

/** Input the user can hand a running turn. */
export interface TurnInput {
  /** Deliver before the model's next step, inside the current work. */
  steer(text: string, id?: string): void;
  /** Deliver once the current work has stopped. */
  followUp(text: string, id?: string): void;
  readonly queue?: import('../core/agent/queue.js').InputQueueControl;
  pending(): { readonly steering: readonly string[]; readonly followUps: readonly string[] };
  /** Take back everything not yet delivered. */
  clearQueue(): string[];
}

export interface TurnRun extends TurnInput {
  readonly events: AsyncIterable<QueryEvent>;
}

/** Tools whose calls must not interleave: each one changes what the next sees. */
const SEQUENTIAL_TOOLS = new Set(["bash", "write", "edit", 'apply_patch', "task", "browser"]);

/**
 * Everything a tool call is judged by, from the turn's own options.
 *
 * One function because there is one set of facts. The session's gate and a
 * subagent's are both built from this, so a rule added here reaches both — the
 * defect this replaced was two hand-written lists, and the subagent's was
 * missing the user's refusals.
 */
function gateOptionsFor(
  options: TurnOptions,
  emit: (event: QueryEvent) => void,
): ToolGateOptions {
  return {
    admission: options.admission,
    correlationId: options.correlationId,
    commandProof: options.commandProof,
    sessionId: options.sessionId,
    workspaceRoot: options.workspaceRoot,
    workspaceRoots: options.workspaceRoots,
    agentMode: options.agentMode,
    permissionScope: options.permissionScope,
    hooks: options.hooks,
    escalationPromptHandler: options.escalationPromptHandler,
    interactiveAsk: options.interactiveAsk,
    emit,
    ...(options.commandEnv ? { commandEnv: options.commandEnv } : {}),
    ...(options.denyRules ? { denyRules: options.denyRules } : {}),
  };
}

export function runTurn(options: TurnOptions): TurnRun {
  const channel = new EventChannel<QueryEvent>();
  const projection = new TurnProjection();
  const parentGate = gateOptionsFor(options, (event) => channel.push(event));
  const runSubagent = options.subagentHost
    ? createSubagentRunner(options.subagentHost, options.tools, parentGate)
    : undefined;
  const gate: ToolGateOptions = { ...parentGate, ...(runSubagent ? { runSubagent } : {}) };
  const openingText = [
    environmentLine(options.workspaceRoot, options.permissionScope, options.goalObjective),
    ...(options.workspaceRoots?.length ? [`Additional file roots (project configuration, skills and MCP still come from cwd):\n${options.workspaceRoots.map(root => `${root.access === 'write' ? 'read/write' : 'read-only'}: ${JSON.stringify(root.path)}`).join('\n')}`] : []),
    ...(options.continuityContext ? [
      `Recorded session facts (historical context, not current authorization):\n${options.continuityContext}`,
    ] : []),
    options.prompt,
  ].join("\n\n");
  const openingImages = options.attachments?.images ?? [];
  const opening: AgentMessage = {
    role: "user",
    // A message with no attachment keeps the plain string it has always been, so
    // nothing downstream sees a block array it was not written for.
    content:
      openingImages.length === 0
        ? openingText
        : [{ type: "text" as const, text: openingText }, ...openingImages],
  };
  const hooks = createToolHooks(gate, options.tools);
  /**
   * The request as it last went out, kept so a refresh can replay it.
   *
   * Captured at the step because that is the only place the request exists in
   * the shape it was sent; a rebuild from the session's history is a different
   * prefix.
   */
  let lastSentRequest: SentRequest | undefined;
  const core = new AgentCore({
    initialState: { messages: options.history as readonly AgentMessage[] },
    // Absent means the kernel's own default, which is the same value the config
    // default carries — so a run that sets neither behaves exactly as it did
    // before these options had a reader.
    ...(options.steeringMode ? { steeringMode: options.steeringMode } : {}),
    ...(options.followUpMode ? { followUpMode: options.followUpMode } : {}),
    ...(options.retry ? { retry: options.retry } : {}),
    tools: adaptTools(options.tools, gate).map((tool) =>
      SEQUENTIAL_TOOLS.has(tool.name) ? { ...tool, executionMode: "sequential" as const } : tool,
    ),
    beforeToolCall: hooks.beforeToolCall,
    afterToolCall: hooks.afterToolCall,
    streamStep: async (messages, signal, request) => {
      // A new request replaces the old prefix even if it fails or reports no usage.
      if (lastSentRequest) options.cacheWarming?.noteRequest(0, lastSentRequest);
      lastSentRequest = undefined;
      let sentRequest: SentRequest | undefined;
      let inputTokens = 0;
      const step = await options.step(
        messages,
        signal,
        {
          onText: (delta) => channel.push({ type: "message.delta", role: "coder", delta }),
          onReasoning: (delta) => channel.push({ type: "reasoning.delta", role: "coder", delta }),
          onReplace: (text) => channel.push({ type: "message.replace", role: "coder", text }),
        },
        {
          allowTools: projection.stepCount < options.maxSteps,
          requestId: request?.requestId,
          // Kept so a refresh can replay it. Captured at the step, because that
          // is the only place the request exists in the shape it was sent.
          onRequestSent: (sent) => {
            sentRequest = sent;
            inputTokens = 0;
            if (sent.context) recordRequestContext(options.sessionId, sent.context);
          },
          onRequestUsage: (usage) => {
            const counted = usageFromProvider(usage);
            inputTokens = counted.promptTokens + counted.cacheReadTokens + counted.cacheWriteTokens;
            if (sentRequest?.context && getSessionUsage(options.sessionId).requestContext === sentRequest.context &&
              typeof usage.prompt_tokens === 'number' && Number.isFinite(usage.prompt_tokens) && usage.prompt_tokens >= 0 && Number.isFinite(inputTokens)) {
              recordRequestContext(options.sessionId, Object.freeze({ ...sentRequest.context, promptTokens: inputTokens }));
            }
          },
        },
      );
      if (!signal?.aborted && step.stopReason !== "error" && step.stopReason !== "aborted" && sentRequest && inputTokens > 0) {
        lastSentRequest = sentRequest;
        options.cacheWarming?.noteRequest(inputTokens, sentRequest);
      }
      return step;
    },
    shouldStopAfterStep: () => projection.stepCount >= options.maxSteps,
    prepareNextStep: options.compaction
      ? createCompactionStep(options.compaction.policy, {
          summarize: options.compaction.summarize,
          summarizeTurnPrefix: options.compaction.summarizeTurnPrefix,
          onCompact: options.compaction.onCompact,
          // One builder for both entry points, so a hook sees the same event
          // with the same reason whether the window filled up or the user asked.
          lifecycle: buildCompactionLifecycle({
            hooks: options.hooks,
            sessionId: options.sessionId,
            workspaceRoot: options.workspaceRoot,
            reason: options.compaction.reason ?? "threshold",
          }),
          reason: options.compaction.reason ?? "threshold",
        })
      : undefined,
  });

  const queues = core.pendingQueues;
  const queue = inputQueueControl([
    { lane: 'steering', queue: queues.steering, text: message => messageToText(message.content), replace: (message, text) => ({ ...message, content: text }) },
    { lane: 'followUp', queue: queues.followUps, text: message => messageToText(message.content), replace: (message, text) => ({ ...message, content: text }) },
  ]);
  core.subscribe(async (event: AgentLifecycleEvent, signal) => {
    if (event.type === "message_end" && event.message !== opening) persist(options.onMessage, event.message);
    for (const projected of projection.project(event)) channel.push(projected);
    if (event.type === 'turn_end' && options.checkpoint && runSubagent) {
      try { await options.checkpoint({ messages: core.state.messages, step: projection.stepCount,
        willContinue: Boolean(event.willContinue) && projection.stepCount < options.maxSteps,
        failed: signal.aborted || event.message.stopReason === 'error' || event.message.stopReason === 'aborted',
      }, runSubagent, signal); }
      catch { try { options.checkpointError?.('Checkpoint observer failed; the main turn continues without its advice.'); } catch { /* Observer reporting cannot change the main outcome. */ } }
    }
  });

  let overflowRecovered = false;
  const drive = async (): Promise<void> => {
    channel.push({
      type: "query.started",
      sessionId: options.sessionId,
      prompt: options.prompt,
      // Reported so a consumer of the event stream can find the transcript without
      // reconstructing the directory layout, which would make that layout part of
      // the contract by accident.
      ...(options.sessionPath !== undefined ? { sessionPath: options.sessionPath } : {}),
    });
    const started = await options.hooks.dispatch({
      eventName: "SessionStart",
      sessionId: options.sessionId,
      workspaceRoot: options.workspaceRoot,
      timestamp: new Date().toISOString(),
      resumed: options.history.length > 0,
    });
    if (started.decision === "block" || started.decision === "retry") {
      throw new Error(`SessionStart hook ${started.decision}: ${started.reason || started.feedback || "Prompt admission refused."}`);
    }
    if (options.signal.aborted) return;
    const submitted = await options.hooks.dispatch({
      eventName: "UserPromptSubmit",
      sessionId: options.sessionId,
      workspaceRoot: options.workspaceRoot,
      timestamp: new Date().toISOString(),
      prompt: options.prompt,
    });
    if (submitted.decision === "block" || submitted.decision === "retry") {
      throw new Error(`UserPromptSubmit hook ${submitted.decision}: ${submitted.reason || submitted.feedback || "Prompt admission refused."}`);
    }
    if (options.signal.aborted) return;
    const onAbort = (): void => core.abort();
    options.signal.addEventListener("abort", onAbort, { once: true });
    try {
      options.onPromptAccepted?.();
      await core.prompt(opening);
      // Input that arrived as the run was ending is still owed a run: the
      // kernel restarts from its queues rather than leaving them behind.
      while (!options.signal.aborted && ((await recoverOverflow()) || core.hasQueuedMessages())) {
        await core.continue();
      }
    } finally {
      options.signal.removeEventListener("abort", onAbort);
    }
    if (options.signal.aborted) return;
    await conclude();
  };

  /**
   * A provider that refused the context for its size gets one more chance:
   * the failed answer is dropped, the head condensed, and the step retried.
   *
   */
  const recoverOverflow = async (): Promise<boolean> => {
    const messages = core.state.messages;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant" || !isOverflowFailure(last) || !options.compaction) return false;
    if (overflowRecovered) return false;
    overflowRecovered = true;
    // The same operation the scheduled path uses, so the rescue cannot cut
    // somewhere the scheduled path would not have. It runs without the
    // threshold check standing in the way: the provider already refused the
    // request, so the context is over budget by definition, not by estimate.
    const kept = messages.slice(0, -1);
    const condensed = await condenseContext({
      messages: kept,
      policy: options.compaction.policy,
      summarize: options.compaction.summarize,
      summarizeTurnPrefix: options.compaction.summarizeTurnPrefix,
      signal: options.signal,
      force: true,
      // The rescue is a compaction like any other, and the only one whose reason
      // is `overflow`: a hook that watches for the context being cut has to see
      // this one, or the case that discards the most context is the one it never
      // hears about. `overflow` was a declared reason with no producer.
      lifecycle: buildCompactionLifecycle({
        hooks: options.hooks,
        sessionId: options.sessionId,
        workspaceRoot: options.workspaceRoot,
        reason: "overflow",
      }),
      lifecycleReason: "overflow",
    }).catch(error => { if (error instanceof ModelAdmissionError) throw error; return undefined; });
    // A decline here leaves the run reporting the overflow it already hit: the
    // engine judged that condensing would not make the context smaller, so
    // retrying the same request would fail the same way.
    if (!condensed || condensed.status === "declined") return false;
    const { plan } = condensed;
    options.compaction.onCompact({
      summary: condensed.summary,
      keptMessages: plan.keptMessages,
      tokensBefore: plan.tokensBefore,
    });
    core.state.messages = condensed.messages;
    return true;
  };

  /** Report how the run ended, in the terms the shell reads. */
  const conclude = async (): Promise<void> => {
    const outcome = concludeRun(core.state.messages, options.prompt, options.sessionId, projection.stepCount,
      projection.stepCount >= options.maxSteps && Boolean(core.state.messages.filter(message => message.role === 'assistant').at(-1)?.tool_calls?.length));
    if (outcome.kind === "failed") {
      await options.hooks.dispatch({
        eventName: "StopFailure",
        sessionId: options.sessionId,
        workspaceRoot: options.workspaceRoot,
        timestamp: new Date().toISOString(),
        turnsExecuted: projection.stepCount,
        error: outcome.error,
      });
      channel.push({ type: "query.failed", error: outcome.error, ...(outcome.admissionFailure ? { admissionFailure: outcome.admissionFailure } : {}) });
      return;
    }
    if (outcome.explained) {
      channel.push({ type: "message.delta", role: "coder", delta: outcome.finalOutput });
      options.onMessage({ role: "assistant", content: outcome.finalOutput });
    }
    await options.hooks.dispatch({
      eventName: "Stop",
      sessionId: options.sessionId,
      workspaceRoot: options.workspaceRoot,
      timestamp: new Date().toISOString(),
      turnsExecuted: projection.stepCount,
      finalOutput: outcome.finalOutput,
    });
    channel.push(outcome.completed);
  };

  void drive()
    .catch((error: unknown) => {
      if (options.signal.aborted) return;
      channel.push({ type: "query.failed", error: error instanceof Error ? error.message : String(error),
        ...(error instanceof ModelAdmissionError ? { admissionFailure: error.code } : {}) });
    })
    .finally(async () => {
      // The run is over, so the session is waiting on a person rather than on a
      // model. What that means for refreshing is the runner's decision.
      options.cacheWarming?.noteSettled();
      await options.hooks
        .dispatch({
          eventName: "SessionEnd",
          sessionId: options.sessionId,
          workspaceRoot: options.workspaceRoot,
          timestamp: new Date().toISOString(),
          turnsExecuted: projection.stepCount,
        })
        .catch(() => undefined);
      channel.close();
    });

  return {
    events: channel,
    queue,
    steer: (text, id) => {
      if (!text.trim()) return;
      core.steer({ role: "user", content: text }, id);
    },
    followUp: (text, id) => {
      if (!text.trim()) return;
      core.followUp({ role: "user", content: text }, id);
    },
    pending: () => ({ steering: queue.entries().filter(entry => entry.lane === 'steering').map(entry => entry.text),
      followUps: queue.entries().filter(entry => entry.lane === 'followUp').map(entry => entry.text) }),
    clearQueue: () => {
      const taken = queue.entries().map(entry => entry.text);
      core.clearAllQueues();
      return taken;
    },
  };
}

/**
 * Keep what the model saw or said. An assistant message that carried nothing —
 * an aborted or failed step — has no place in the conversation the next run
 * is built from.
 *
 * The step's bookkeeping (why it stopped, what went wrong) is stripped because
 * it describes the attempt, not the answer. The origin survives that strip: it
 * names which model produced the answer, and a later run still needs to know
 * that — a failure written by a retired model must not be mistaken for the
 * current model's once the model that wrote it is gone.
 */
function persist(onMessage: (message: SessionMessage) => void, message: AgentMessage): void {
  if (message.role === "assistant" && !message.content && !(message.tool_calls && message.tool_calls.length > 0)) return;
  if (message.role === "system") return;
  const { stopReason: _stopReason, errorMessage: _errorMessage, ...stored } = message;
  onMessage(stored);
}
