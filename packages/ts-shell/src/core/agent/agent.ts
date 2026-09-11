import { runAgentLoop, runAgentLoopContinue, type AgentLoopConfig } from "./loop.js";
import { PendingQueue } from "./queue.js";
import { createAgentState, type AgentMessage, type AgentState, type InitialAgentState } from "./state.js";
import type { AgentEventListener } from "./events.js";
import type { AgentTool, ToolHooks } from "./tools.js";

export interface AgentCoreOptions {
  readonly initialState?: InitialAgentState;
  readonly tools?: readonly AgentTool[];
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
  readonly abortController: AbortController;
}

export class AgentCore {
  private readonly internalState: AgentState;
  private readonly listeners = new Set<AgentEventListener>();
  private readonly steeringQueue: PendingQueue<AgentMessage>;
  private readonly followUpQueue: PendingQueue<AgentMessage>;
  private readonly options: AgentCoreOptions;
  private activeRun?: ActiveRun;

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
    await this.runWithLifecycle(async (signal) => {
      await runAgentLoop(messages, [...this.internalState.messages], this.createLoopConfig(), (event) => this.processEvents(event), signal);
    });
  }

  public async continue(): Promise<void> {
    if (this.activeRun) {
      throw new Error("Agent is already processing.");
    }
    const transcript = this.internalState.messages;
    const last = transcript[transcript.length - 1];
    if (!last) {
      throw new Error("Cannot continue: no messages in context");
    }
    if (last.role === "assistant") {
      throw new Error("Cannot continue from message role: assistant");
    }
    await this.runWithLifecycle(async (signal) => {
      await runAgentLoopContinue([...transcript], this.createLoopConfig(), (event) => this.processEvents(event), signal);
    });
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

  public abort(): void {
    this.activeRun?.abortController.abort();
  }

  public waitForIdle(): Promise<void> {
    return this.activeRun?.promise ?? Promise.resolve();
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
    this.clearAllQueues();
  }

  private createLoopConfig(): AgentLoopConfig {
    return {
      tools: this.options.tools,
      beforeToolCall: this.options.beforeToolCall,
      afterToolCall: this.options.afterToolCall,
      shouldStopAfterStep: this.options.shouldStopAfterStep,
      prepareNextStep: this.options.prepareNextStep,
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
    const promise = new Promise<void>((resolve) => {
      resolvePromise = resolve;
    });
    this.activeRun = { promise, resolve: resolvePromise, abortController };
    this.internalState.isStreaming = true;
    this.internalState.streamingMessage = undefined;
    this.internalState.errorMessage = undefined;
    try {
      await executor(abortController.signal);
    } catch (error) {
      await this.handleRunFailure(error, abortController.signal.aborted);
    } finally {
      this.finishRun();
    }
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
    await this.processEvents({ type: "agent_end", messages: [failure] });
  }

  private finishRun(): void {
    this.internalState.isStreaming = false;
    this.internalState.streamingMessage = undefined;
    this.internalState.pendingToolCalls = new Set<string>();
    this.activeRun?.resolve();
    this.activeRun = undefined;
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
