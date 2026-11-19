import { runAgentLoop, runAgentLoopContinue, type AgentLoopConfig } from "./loop.js";
import { PendingQueue } from "./queue.js";
import { createAgentState, type AgentMessage, type AgentState, type InitialAgentState } from "./state.js";
import type { AgentEventListener } from "./events.js";
import type { AgentTool, AgentToolExecutionMode, ToolHooks } from "./tools.js";
import { cancelRetryWait, type RetryPolicy } from "./retry.js";
import { captureCustomMessage, captureMessageHistory } from './custom.js';
import { lastContextMessageIndex, sameContext } from './context.js';

export interface AgentCoreOptions {
  readonly initialState?: InitialAgentState;
  readonly convertToLlm?: AgentLoopConfig['convertToLlm'];
  /** A function resolves the pool again for each batch, after discovery loaded tools. */
  readonly tools?: readonly AgentTool[] | (() => readonly AgentTool[]);
  readonly toolExecution?: AgentToolExecutionMode;
  readonly streamStep: AgentLoopConfig["streamStep"];
  readonly beforeToolCall?: ToolHooks["beforeToolCall"];
  readonly afterToolCall?: ToolHooks["afterToolCall"];
  readonly shouldStopAfterStep?: AgentLoopConfig["shouldStopAfterStep"];
  readonly toolsAllowedOnNextStep?: AgentLoopConfig["toolsAllowedOnNextStep"];
  readonly prepareNextStep?: AgentLoopConfig["prepareNextStep"];
  readonly prepareRequest?: AgentLoopConfig["prepareRequest"];
  readonly finishTurn?: AgentLoopConfig["finishTurn"];
  readonly steeringMode?: "one-at-a-time" | "all";
  readonly followUpMode?: "one-at-a-time" | "all";
  readonly drainInput?: (queue: PendingQueue<AgentMessage>, lane: 'steer' | 'followUp') => Promise<AgentMessage[]>;
  readonly commitInput?: AgentLoopConfig['commitInput'];
  readonly onStepStart?: AgentLoopConfig['onStepStart'];
  /**
   * How a failed step is retried, passed through to the loop unchanged.
   *
   * Absent leaves the loop's own default in place, so a core built without a
   * policy behaves as it did before this option existed.
   */
  readonly retry?: Partial<RetryPolicy>;
}

interface ActiveRun {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
  readonly reject: (reason?: unknown) => void;
  readonly abortController: AbortController;
}

interface PromptMessages {
  readonly messages: readonly AgentMessage[];
  readonly skipInitialSteeringPoll?: boolean;
  readonly skipInitialPreparation?: boolean;
}

export class AgentCore {
  private readonly internalState: AgentState;
  private readonly listeners = new Set<AgentEventListener>();
  private readonly steeringQueue: PendingQueue<AgentMessage>;
  private readonly followUpQueue: PendingQueue<AgentMessage>;
  public readonly pendingQueues: { readonly steering: PendingQueue<AgentMessage>; readonly followUps: PendingQueue<AgentMessage> };
  private readonly options: AgentCoreOptions;
  private activeRun?: ActiveRun;
  private lastRun?: Promise<void>;

  constructor(options: AgentCoreOptions) {
    this.options = { ...options };
    this.internalState = createAgentState(options.initialState);
    this.steeringQueue = new PendingQueue<AgentMessage>(options.steeringMode ?? "one-at-a-time");
    this.followUpQueue = new PendingQueue<AgentMessage>(options.followUpMode ?? "one-at-a-time");
    this.pendingQueues = { steering: this.steeringQueue, followUps: this.followUpQueue };
  }

  public get state(): AgentState {
    return this.internalState;
  }

  public subscribe(listener: AgentEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** A session may prepare this prompt before entry; queued restarts still prepare normally. */
  public async prompt(input: AgentMessage | readonly AgentMessage[], options: { readonly skipInitialPreparation?: boolean } = {}): Promise<void> {
    const messages = captureMessageHistory(Array.isArray(input) ? input : [input]);
    await this.runPromptMessages(() => ({ messages, ...options }));
  }

  public async continue(): Promise<void> {
    if (this.activeRun) {
      throw new Error("Agent is already processing.");
    }
    const transcript = this.internalState.messages;
    const last = transcript[lastContextMessageIndex(transcript)];
    if (!last && !this.hasQueuedMessages()) {
      throw new Error("Cannot continue: no messages in context");
    }
    if (!last || last.role === "assistant") {
      // After an aborted or stopped run the transcript may end on the
      // assistant; queued input is still actionable, so restart from it
      // instead of failing. Steering is drained first; only fall back to
      // follow-ups when no steering was waiting.
      if (!this.hasQueuedMessages()) throw new Error("Cannot continue from message role: assistant");
      await this.runPromptMessages(async config => {
        const steering = await config.getSteeringMessages?.() ?? [];
        if (steering.length) return { messages: steering, skipInitialSteeringPoll: true };
        const followUps = await config.getFollowUpMessages?.() ?? [];
        return followUps.length ? { messages: followUps } : undefined;
      });
      return;
    }
    await this.runWithLifecycle(async (signal) => {
      await runAgentLoopContinue([...transcript], this.createLoopConfig(), (event) => this.processEvents(event), signal);
    });
  }

  private async runPromptMessages(
    acquire: (config: AgentLoopConfig) => PromptMessages | Promise<PromptMessages | undefined>,
  ): Promise<void> {
    await this.runWithLifecycle(async (signal) => {
      const config = this.createLoopConfig();
      const input = await acquire(config);
      if (!input || signal.aborted) return;
      const { messages, ...options } = input;
      await runAgentLoop(
        [...messages],
        [...this.internalState.messages],
        config,
        (event) => this.processEvents(event),
        signal,
        options,
      );
    });
  }

  public setQueueMode(queue: "steering" | "followUp", mode: "one-at-a-time" | "all"): void {
    if (queue === "steering") {
      this.steeringQueue.mode = mode;
    } else {
      this.followUpQueue.mode = mode;
    }
  }

  public steer(message: AgentMessage, id?: string): void {
    this.steeringQueue.enqueue(captureCustomMessage(message), id);
  }

  public followUp(message: AgentMessage, id?: string): void {
    this.followUpQueue.enqueue(captureCustomMessage(message), id);
  }

  public clearAllQueues(): void {
    this.steeringQueue.clear();
    this.followUpQueue.clear();
  }

  public hasQueuedMessages(): boolean {
    return this.steeringQueue.hasItems() || this.followUpQueue.hasItems();
  }

  /**
   * Best-effort cancel: signals the run and returns immediately. Pair with
   * `waitForIdle()` to wait until the aborted turn has settled.
   */
  public abort(): void {
    this.activeRun?.abortController.abort();
  }

  /** Cancel only an existing retry wait; ordinary requests and queued input remain owned by the run. */
  public abortRetry(): void {
    cancelRetryWait(this.activeRun?.abortController.signal);
  }

  public waitForIdle(): Promise<void> {
    return this.activeRun?.promise ?? this.lastRun ?? Promise.resolve();
  }

  public reset(): void {
    if (this.activeRun) {
      throw new Error("Agent is already processing. Wait for completion before resetting.");
    }
    this.internalState.messages = [];
    this.internalState.isStreaming = false;
    this.internalState.streamingMessage = undefined;
    this.internalState.pendingToolCalls = new Set<string>();
    this.internalState.errorMessage = undefined;
    this.lastRun = undefined;
    this.clearAllQueues();
  }

  private createLoopConfig(): AgentLoopConfig {
    return {
      tools: this.options.tools,
      toolExecution: this.options.toolExecution,
      beforeToolCall: this.options.beforeToolCall,
      afterToolCall: this.options.afterToolCall,
      shouldStopAfterStep: this.options.shouldStopAfterStep,
      toolsAllowedOnNextStep: this.options.toolsAllowedOnNextStep,
      prepareNextStep: this.options.prepareNextStep,
      ...(this.options.convertToLlm ? { convertToLlm: this.options.convertToLlm } : {}),
      ...(this.options.prepareRequest ? { prepareRequest: this.options.prepareRequest } : {}),
      ...(this.options.finishTurn ? { finishTurn: this.options.finishTurn } : {}),
      ...(this.options.retry ? { retry: this.options.retry } : {}),
      onContextReplaced: (messages) => {
        this.internalState.messages = [...messages];
      },
      isContextCurrent: messages => sameContext(this.internalState.messages, messages),
      streamStep: this.options.streamStep,
      hasQueuedMessages: lane => (lane === 'steering' ? this.steeringQueue : this.followUpQueue).hasItems(),
      commitInput: this.options.commitInput,
      onStepStart: this.options.onStepStart,
      getSteeringMessages: async () => this.options.drainInput?.(this.steeringQueue, 'steer') ?? this.steeringQueue.drain(),
      getFollowUpMessages: async () => this.options.drainInput?.(this.followUpQueue, 'followUp') ?? this.followUpQueue.drain(),
    };
  }

  private async runWithLifecycle(executor: (signal: AbortSignal) => Promise<void>): Promise<void> {
    if (this.activeRun) {
      throw new Error("Agent is already processing.");
    }
    const abortController = new AbortController();
    let resolvePromise = (): void => {};
    let rejectPromise = (_reason?: unknown): void => {};
    const promise = new Promise<void>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });
    // Mark the rejection handled up front: waitForIdle() still surfaces it
    // to explicit awaiters, but callers that only await prompt() no longer
    // trigger an unhandledRejection warning.
    promise.catch(() => {});
    this.activeRun = { promise, resolve: resolvePromise, reject: rejectPromise, abortController };
    this.lastRun = promise;
    this.internalState.isStreaming = true;
    this.internalState.streamingMessage = undefined;
    this.internalState.errorMessage = undefined;
    try {
      await executor(abortController.signal);
    } catch (error) {
      try {
        await this.handleRunFailure(error, abortController.signal.aborted);
      } catch (fatal) {
        this.finishRun(fatal);
        throw fatal;
      }
    }
    this.finishRun();
  }

  private async handleRunFailure(error: unknown, aborted: boolean): Promise<void> {
    const failure: AgentMessage = {
      role: "assistant",
      content: "",
      stopReason: aborted ? "aborted" : "error",
      errorMessage: error instanceof Error ? error.message : String(error),
    };
    await this.processEvents({ type: "message_start", message: failure });
    await this.processEvents({ type: "message_end", message: failure });
    await this.processEvents({ type: "turn_end", message: failure, toolResults: [] });
    await this.processEvents({ type: "agent_end", messages: [...this.internalState.messages] });
  }

  private finishRun(error?: unknown): void {
    this.internalState.isStreaming = false;
    this.internalState.streamingMessage = undefined;
    this.internalState.pendingToolCalls = new Set<string>();
    const run = this.activeRun;
    this.activeRun = undefined;
    if (error !== undefined) {
      run?.reject(error);
    } else {
      run?.resolve();
    }
  }

  private async processEvents(event: Parameters<AgentEventListener>[0]): Promise<void> {
    switch (event.type) {
      case "message_start":
      case "message_update":
        this.internalState.streamingMessage = event.message;
        break;
      case "message_end":
        this.internalState.streamingMessage = undefined;
        this.internalState.messages.push(event.message);
        break;
      case "tool_execution_start": {
        const pending = new Set(this.internalState.pendingToolCalls);
        pending.add(event.toolCallId);
        this.internalState.pendingToolCalls = pending;
        break;
      }
      case "tool_execution_end": {
        const pending = new Set(this.internalState.pendingToolCalls);
        pending.delete(event.toolCallId);
        this.internalState.pendingToolCalls = pending;
        break;
      }
      case "turn_end":
        if (event.message.role === "assistant" && event.message.errorMessage) {
          this.internalState.errorMessage = event.message.errorMessage;
        }
        break;
      case "agent_end":
        this.internalState.streamingMessage = undefined;
        break;
      case "agent_start":
      case "turn_start":
      case "tool_execution_update":
        break;
    }
    const signal = this.activeRun?.abortController.signal;
    if (!signal) {
      throw new Error("Agent listener invoked outside active run");
    }
    for (const listener of this.listeners) {
      await listener(event, signal);
    }
  }
}
