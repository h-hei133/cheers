import { runAgentLoop, runAgentLoopContinue, type AgentLoopConfig } from "./loop.js";
import { PendingQueue } from "./queue.js";
import { createAgentState, type AgentMessage, type AgentState, type InitialAgentState } from "./state.js";
import type { AgentEventListener } from "./events.js";
import type { AgentTool, AgentToolExecutionMode, ToolHooks } from "./tools.js";

export interface AgentCoreOptions {
  readonly initialState?: InitialAgentState;
  readonly tools?: readonly AgentTool[];
  readonly toolExecution?: AgentToolExecutionMode;
  readonly streamStep: AgentLoopConfig["streamStep"];
  readonly beforeToolCall?: ToolHooks["beforeToolCall"];
  readonly afterToolCall?: ToolHooks["afterToolCall"];
  readonly shouldStopAfterStep?: AgentLoopConfig["shouldStopAfterStep"];
  readonly prepareNextStep?: AgentLoopConfig["prepareNextStep"];
  readonly steeringMode?: "one-at-a-time" | "all";
  readonly followUpMode?: "one-at-a-time" | "all";
}

interface ActiveRun {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
  readonly reject: (reason?: unknown) => void;
  readonly abortController: AbortController;
}

export class AgentCore {
  private readonly internalState: AgentState;
  private readonly listeners = new Set<AgentEventListener>();
  private readonly steeringQueue: PendingQueue<AgentMessage>;
  private readonly followUpQueue: PendingQueue<AgentMessage>;
  private readonly options: AgentCoreOptions;
  private activeRun?: ActiveRun;
  private lastRun?: Promise<void>;

  constructor(options: AgentCoreOptions) {
    this.options = options;
    this.internalState = createAgentState(options.initialState);
    this.steeringQueue = new PendingQueue<AgentMessage>(options.steeringMode ?? "one-at-a-time");
    this.followUpQueue = new PendingQueue<AgentMessage>(options.followUpMode ?? "one-at-a-time");
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

  public async prompt(input: AgentMessage | readonly AgentMessage[]): Promise<void> {
    const messages = Array.isArray(input) ? [...input] : [input];
    await this.runPromptMessages(messages);
  }

  public async continue(): Promise<void> {
    if (this.activeRun) {
      throw new Error("Agent is already processing.");
    }
    const transcript = this.internalState.messages;
    const last = transcript[transcript.length - 1];
    if (!last && !this.hasQueuedMessages()) {
      throw new Error("Cannot continue: no messages in context");
    }
    if (!last || last.role === "assistant") {
      // After an aborted or stopped run the transcript may end on the
      // assistant; queued input is still actionable, so restart from it
      // instead of failing. Steering is drained first; only fall back to
      // follow-ups when no steering was waiting.
      const queuedSteering = this.steeringQueue.drain();
      if (queuedSteering.length > 0) {
        await this.runPromptMessages(queuedSteering, { skipInitialSteeringPoll: true });
        return;
      }
      const queuedFollowUps = this.followUpQueue.drain();
      if (queuedFollowUps.length > 0) {
        await this.runPromptMessages(queuedFollowUps);
        return;
      }
      throw new Error("Cannot continue from message role: assistant");
    }
    await this.runWithLifecycle(async (signal) => {
      await runAgentLoopContinue([...transcript], this.createLoopConfig(), (event) => this.processEvents(event), signal);
    });
  }

  private async runPromptMessages(
    messages: readonly AgentMessage[],
    options: { readonly skipInitialSteeringPoll?: boolean } = {},
  ): Promise<void> {
    await this.runWithLifecycle(async (signal) => {
      await runAgentLoop(
        [...messages],
        [...this.internalState.messages],
        this.createLoopConfig(),
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

  public steer(message: AgentMessage): void {
    this.steeringQueue.enqueue(message);
  }

  public followUp(message: AgentMessage): void {
    this.followUpQueue.enqueue(message);
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
      prepareNextStep: this.options.prepareNextStep,
      onContextReplaced: (messages) => {
        this.internalState.messages = [...messages];
      },
      streamStep: this.options.streamStep,
      getSteeringMessages: async () => this.steeringQueue.drain(),
      getFollowUpMessages: async () => this.followUpQueue.drain(),
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
