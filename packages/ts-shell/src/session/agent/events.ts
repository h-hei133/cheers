import type { ToolExecutionResult } from "../../tools/types.js";

export type AgentEvent =
  | {
      readonly type: "agent_start";
      readonly sessionId: string;
      readonly projectRoot: string;
      readonly timestamp: string;
    }
  | {
      readonly type: "turn_start";
      readonly turnId: string;
      readonly prompt: string;
      readonly timestamp: string;
    }
  | {
      readonly type: "thinking_stream";
      readonly turnId: string;
      readonly delta: string;
    }
  | {
      readonly type: "tool_call";
      readonly toolCallId: string;
      readonly toolName: string;
      readonly argumentsSummary: string;
      readonly timestamp: string;
    }
  | {
      readonly type: "tool_result";
      readonly toolCallId: string;
      readonly toolName: string;
      readonly result: ToolExecutionResult;
      readonly timestamp: string;
    }
  | {
      readonly type: "turn_end";
      readonly turnId: string;
      readonly success: boolean;
      readonly timestamp: string;
    }
  | {
      readonly type: "agent_end";
      readonly sessionId: string;
      readonly status: "completed" | "error" | "cancelled";
      readonly timestamp: string;
    };

export interface AgentEventEmitter {
  emit(event: AgentEvent): void;
  subscribe(listener: (event: AgentEvent) => void): () => void;
}

export function createAgentEventEmitter(): AgentEventEmitter {
  const listeners = new Set<(event: AgentEvent) => void>();
  return {
    emit(event: AgentEvent) {
      const snapshot = Array.from(listeners);
      for (const listener of snapshot) {
        listener(event);
      }
    },
    subscribe(listener: (event: AgentEvent) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
