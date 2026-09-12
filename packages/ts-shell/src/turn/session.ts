import { AgentCore } from "../core/agent/agent.js";
import type { AgentLifecycleEvent } from "../core/agent/events.js";
import type { AgentMessage } from "../core/agent/state.js";
import type { HookDispatcher } from "../core/hooks/hookDispatcher.js";
import type { QueryEvent } from "../core/query/runtime/events.js";
import type { SessionMessage } from "../session/schema/sessionMessage.js";
import {
  applyCompaction,
  createCompactionStep,
  findCompactionCut,
  KEEP_RECENT_MESSAGES,
  type CompactionPolicy,
  type SummarizeHistory,
} from "../session/compaction.js";
import { estimateTokens } from "../session/context.js";
import { environmentLine } from "./prompt.js";
import { concludeRun, TurnProjection } from "./projection.js";
import { EventChannel } from "./stream.js";
import { isOverflowFailure, type StepFunction } from "./step.js";
import { adaptTools, createToolHooks, type ToolGateOptions } from "./tools.js";
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
  /** A checkpoint was written into the context; record it durably. */
  readonly onCompact: (input: { readonly summary: string; readonly keptMessages: number; readonly tokensBefore: number }) => void;
}

export interface TurnOptions {
  readonly sessionId: string;
  readonly prompt: string;
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
  };
  const opening: AgentMessage = {
    role: "user",
    content: `${environmentLine(options.workspaceRoot, options.permissionScope)}\n\n${options.prompt}`,
  };
  const hooks = createToolHooks(gate);
  const core = new AgentCore({
    initialState: { messages: options.history as readonly AgentMessage[] },
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
        { allowTools: projection.stepCount < options.maxSteps },
      ),
    shouldStopAfterStep: () => projection.stepCount >= options.maxSteps,
    prepareNextStep: options.compaction
      ? createCompactionStep(options.compaction.policy, options.compaction.summarize, undefined, options.compaction.onCompact)
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
      forget(steering, event.message.content) || forget(followUps, event.message.content);
    }
    if (event.type === "message_end" && event.message !== opening) persist(options.onMessage, event.message);
    for (const projected of projection.project(event)) channel.push(projected);
  });

  let overflowRecovered = false;
  const drive = async (): Promise<void> => {
    channel.push({ type: "query.started", sessionId: options.sessionId, prompt: options.prompt });
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
   */
  const recoverOverflow = async (): Promise<boolean> => {
    const messages = core.state.messages;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant" || !isOverflowFailure(last) || !options.compaction) return false;
    if (overflowRecovered) return false;
    overflowRecovered = true;
    const kept = messages.slice(0, -1);
    const cut = findCompactionCut(kept, options.compaction.policy.keepRecentMessages ?? KEEP_RECENT_MESSAGES);
    if (cut === undefined) return false;
    const summary = await options.compaction.summarize(kept.slice(0, cut), options.signal).catch(() => undefined);
    if (!summary) return false;
    const plan = { cut, keptMessages: kept.length - cut, tokensBefore: estimateTokens(kept) };
    options.compaction.onCompact({ summary, keptMessages: plan.keptMessages, tokensBefore: plan.tokensBefore });
    core.state.messages = applyCompaction(kept, plan, summary);
    return true;
  };

  /** Report how the run ended, in the terms the shell reads. */
  const conclude = async (): Promise<void> => {
    const outcome = concludeRun(core.state.messages, options.prompt, options.sessionId, projection.stepCount);
    if (outcome.kind === "failed") {
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
    .finally(() => channel.close());

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
 */
function persist(onMessage: (message: SessionMessage) => void, message: AgentMessage): void {
  if (message.role === "assistant" && !message.content && !(message.tool_calls && message.tool_calls.length > 0)) return;
  if (message.role === "system") return;
  const { stopReason: _stopReason, errorMessage: _errorMessage, ...stored } = message;
  onMessage(stored);
}
