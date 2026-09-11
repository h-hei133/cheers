import type { AgentMessage } from "./state.js";

export type AgentLifecycleEvent =
  | { readonly type: "agent_start" }
  | { readonly type: "agent_end"; readonly messages: readonly AgentMessage[] }
  | { readonly type: "turn_start" }
  | {
      readonly type: "turn_end";
      readonly message: AgentMessage;
      readonly toolResults: readonly AgentMessage[];
    }
  | { readonly type: "message_start"; readonly message: AgentMessage }
  /**
   * Streaming progress. Produced by the `streamStep` implementation pushing
   * partial text straight to the sink; the loop itself only emits whole
   * `message_start` / `message_end` pairs.
   */
  | { readonly type: "message_update"; readonly message: AgentMessage; readonly delta?: string }
  | { readonly type: "message_end"; readonly message: AgentMessage }
  | {
      readonly type: "tool_execution_start";
      readonly toolCallId: string;
      readonly toolName: string;
      readonly args: unknown;
    }
  | {
      readonly type: "tool_execution_update";
      readonly toolCallId: string;
      readonly toolName: string;
      readonly args: unknown;
      readonly partialResult: unknown;
    }
  | {
      readonly type: "tool_execution_end";
      readonly toolCallId: string;
      readonly toolName: string;
      readonly isError: boolean;
    };

export type AgentEventSink = (event: AgentLifecycleEvent) => Promise<void> | void;

export type AgentEventListener = (
  event: AgentLifecycleEvent,
  signal: AbortSignal,
) => Promise<void> | void;
