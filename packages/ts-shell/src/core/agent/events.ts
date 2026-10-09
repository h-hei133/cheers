import type { AgentMessage } from "./state.js";

export type AgentLifecycleEvent =
  | { readonly type: "agent_start" }
  | { readonly type: "agent_end"; readonly messages: readonly AgentMessage[] }
  | { readonly type: "turn_start" }
  | {
      readonly type: "turn_end";
      readonly willContinue?: boolean;
      readonly message: AgentMessage;
      readonly toolResults: readonly AgentMessage[];
    }
  /**
   * A failed step is about to be asked for again, after `delayMs`.
   *
   * Announced before the wait rather than after it so a surface can say why
   * nothing is happening yet — a silent pause during a backoff reads as a hang.
   */
  | {
      readonly type: "retry_scheduled";
      readonly attempt: number;
      readonly maxAttempts: number;
      readonly delayMs: number;
    }
  /** The wait is over and the step is being re-requested. */
  | { readonly type: "retry_attempt_start"; readonly attempt: number }
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
