import type { ImageContent } from "../model-adapters/multimodal.js";
import { messageToText } from "../model-adapters/multimodal.js";
import { AgentCore } from "../core/agent/agent.js";
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
import { concludeRun, TurnProjection } from "./projection.js";
import { EventChannel } from "./stream.js";
import { isOverflowFailure, type StepFunction } from "./step.js";
import { adaptTools, createToolHooks, type ToolGateOptions } from "./tools.js";
import { getSessionUsage } from "../observability/usageTelemetry.js";
import type { SentRequest } from "../provider/request/sentRequest.js";
import type { SubagentRunner } from "../core/subagents/runner.js";
import type { DenyRule } from "../core/shell/approval/deny.js";
import type { CacheWarmingRunner } from "./cacheWarm.js";
import type { ToolDefinition } from "../tools/types.js";

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
  readonly sessionId: string;
  /** Where the session's files live, when the caller knows. Carried into the event stream. */
  readonly sessionPath?: string;
  readonly prompt: string;
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
   * How to run a subagent, when this session can delegate.
   *
   * Passed through to the tool layer, which reaches it from a tool's context.
   * Resolved by the caller because running a subagent needs the model side and
   * this layer's job is the conversation, not the provider.
   */
  readonly runSubagent?: SubagentRunner;
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
  steer(text: string): void;
  /** Deliver once the current work has stopped. */
  followUp(text: string): void;
  pending(): { readonly steering: readonly string[]; readonly followUps: readonly string[] };
  /** Take back everything not yet delivered. */
  clearQueue(): string[];
}

export interface TurnRun extends TurnInput {
  readonly events: AsyncIterable<QueryEvent>;
}

/** Tools whose calls must not interleave: each one changes what the next sees. */
const SEQUENTIAL_TOOLS = new Set(["bash", "write", "edit", "task", "browser"]);

export function runTurn(options: TurnOptions): TurnRun {
  const channel = new EventChannel<QueryEvent>();
  const projection = new TurnProjection();
  const steering: string[] = [];
  const followUps: string[] = [];
  const gate: ToolGateOptions = {
    sessionId: options.sessionId,
    workspaceRoot: options.workspaceRoot,
    agentMode: options.agentMode,
    permissionScope: options.permissionScope,
    hooks: options.hooks,
    escalationPromptHandler: options.escalationPromptHandler,
    interactiveAsk: options.interactiveAsk,
    emit: (event) => channel.push(event),
    ...(options.commandEnv ? { commandEnv: options.commandEnv } : {}),
    ...(options.runSubagent ? { runSubagent: options.runSubagent } : {}),
    ...(options.denyRules ? { denyRules: options.denyRules } : {}),
  };
  const openingText = `${environmentLine(options.workspaceRoot, options.permissionScope)}\n\n${options.prompt}`;
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
  const hooks = createToolHooks(gate);
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
    streamStep: (messages, signal) =>
      options.step(
        messages,
        signal,
        {
          onText: (delta) => channel.push({ type: "message.delta", role: "coder", delta }),
          onReasoning: (delta) => channel.push({ type: "reasoning.delta", role: "coder", delta }),
          onReplace: (text) => channel.push({ type: "message.replace", role: "coder", text }),
        },
        {
          allowTools: projection.stepCount < options.maxSteps,
          // Kept so a refresh can replay it. Captured at the step, because that
          // is the only place the request exists in the shape it was sent.
          onRequestSent: (sent) => {
            lastSentRequest = sent;
          },
        },
      ),
    shouldStopAfterStep: () => projection.stepCount >= options.maxSteps,
    prepareNextStep: options.compaction
      ? createCompactionStep(options.compaction.policy, {
          summarize: options.compaction.summarize,
          summarizeTurnPrefix: options.compaction.summarizeTurnPrefix,
          onCompact: options.compaction.onCompact,
          lifecycle: {
            before: async (input) => {
              const decision = await options.hooks.dispatch({
                eventName: "PreCompact",
                sessionId: options.sessionId,
                workspaceRoot: options.workspaceRoot,
                timestamp: new Date().toISOString(),
                reason: options.compaction?.reason ?? "threshold",
                tokensBefore: input.tokensBefore,
                messageCount: input.messageCount,
              });
              return decision.decision !== "block";
            },
            after: async (input) => {
              await options.hooks.dispatch({
                eventName: "PostCompact",
                sessionId: options.sessionId,
                workspaceRoot: options.workspaceRoot,
                timestamp: new Date().toISOString(),
                reason: options.compaction?.reason ?? "threshold",
                summary: input.summary,
                keptMessages: input.keptMessages,
                tokensBefore: input.tokensBefore,
              });
            },
          },
          reason: options.compaction.reason ?? "threshold",
        })
      : undefined,
  });

  const forget = (list: string[], text: string): boolean => {
    const index = list.indexOf(text);
    if (index === -1) return false;
    list.splice(index, 1);
    return true;
  };

  core.subscribe((event: AgentLifecycleEvent) => {
    if (event.type === "message_start" && event.message.role === "user") {
      const text = messageToText(event.message.content);
      forget(steering, text) || forget(followUps, text);
    }
    if (event.type === "message_end" && event.message !== opening) persist(options.onMessage, event.message);
    // A step that reported usage is a request that completed, which is the only
    // moment a cache window starts.
    if (event.type === "turn_end") noteWarmingRequest();
    for (const projected of projection.project(event)) channel.push(projected);
  });

  // The turn is the only place that knows a request happened and how large it
  // was, so it is the only place that can tell the warmer when a window starts.
  // Reported from the usage the provider returned, not from an estimate: an
  // estimate of the wrong size would schedule the refresh against the wrong
  // window.
  const noteWarmingRequest = (): void => {
    if (!options.cacheWarming || !lastSentRequest) return;
    const usage = getSessionUsage(options.sessionId);
    if (usage.lastPromptTokens > 0) {
      options.cacheWarming.noteRequest(usage.lastPromptTokens, lastSentRequest);
    }
  };

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
    await options.hooks.dispatch({
      eventName: "SessionStart",
      sessionId: options.sessionId,
      workspaceRoot: options.workspaceRoot,
      timestamp: new Date().toISOString(),
      resumed: options.history.length > 0,
    });
    await options.hooks.dispatch({
      eventName: "UserPromptSubmit",
      sessionId: options.sessionId,
      workspaceRoot: options.workspaceRoot,
      timestamp: new Date().toISOString(),
      prompt: options.prompt,
    });
    if (options.signal.aborted) return;
    const onAbort = (): void => core.abort();
    options.signal.addEventListener("abort", onAbort, { once: true });
    try {
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
    }).catch(() => undefined);
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
    const outcome = concludeRun(core.state.messages, options.prompt, options.sessionId, projection.stepCount);
    if (outcome.kind === "failed") {
      await options.hooks.dispatch({
        eventName: "StopFailure",
        sessionId: options.sessionId,
        workspaceRoot: options.workspaceRoot,
        timestamp: new Date().toISOString(),
        turnsExecuted: projection.stepCount,
        error: outcome.error,
      });
      channel.push({ type: "query.failed", error: outcome.error });
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
      channel.push({ type: "query.failed", error: error instanceof Error ? error.message : String(error) });
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
    steer: (text) => {
      if (!text.trim()) return;
      steering.push(text);
      core.steer({ role: "user", content: text });
    },
    followUp: (text) => {
      if (!text.trim()) return;
      followUps.push(text);
      core.followUp({ role: "user", content: text });
    },
    pending: () => ({ steering: [...steering], followUps: [...followUps] }),
    clearQueue: () => {
      const taken = [...steering, ...followUps];
      steering.length = 0;
      followUps.length = 0;
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
