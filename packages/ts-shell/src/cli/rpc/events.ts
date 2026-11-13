import type { QueryEvent } from "../../core/query/runtime/events.js";
import type { ShellSessionRuntime } from "../../core/shell/sessionRuntime.js";
import { writeRawStdout } from "../../core/shell/outputGuard.js";

/** Translate an internal `QueryEvent` into a Pi-compatible RPC JSONL event frame when relevant. */
export function toRpcEvent(event: QueryEvent): Record<string, unknown> | undefined {
  switch (event.type) {
    case "query.started":
      return { type: "agent_start", sessionId: event.sessionId, prompt: event.prompt, ...(event.sessionPath ? { sessionPath: event.sessionPath } : {}) };
    case "turn.started":
      return { type: "turn_start", turn: event.turn, role: event.role };
    case "message.started":
      return { type: "message_start", message: { role: event.role, content: "" } };
    case "message.delta":
      return { type: "message_update", delta: event.delta, message: { role: event.role, content: event.delta } };
    case "reasoning.delta":
      return { type: "message_update", delta: event.delta, channel: "reasoning", message: { role: event.role, reasoning: { text: event.delta } } };
    case "message.replace":
      return { type: "message_update", text: event.text, message: { role: event.role, content: event.text } };
    case "message.finished":
      return { type: "message_end", message: { role: event.role } };
    case "tool.started":
      return { type: "tool_execution_start", toolCallId: event.taskId, toolName: event.toolName, args: event.args ?? {} };
    case "tool.output":
      return { type: "tool_execution_update", toolCallId: event.taskId, toolName: event.toolName, partialResult: event.chunk };
    case "tool.result":
      return {
        type: "tool_execution_end",
        toolCallId: event.taskId,
        toolName: event.toolName,
        result: event.output ?? "",
        isError: !event.success,
      };
    case "tool.settled":
      return { type: "tool_execution_settled", toolCallId: event.taskId, toolName: event.toolName, isError: !event.success };
    case "turn.completed":
      return { type: "turn_end", output: event.output };
    case "lifecycle.cancelled":
      return { type: "agent_end", status: "cancelled", reason: event.reason };
    case "query.completed":
      return { type: "agent_end", status: "completed", result: event.result };
    case "query.completed_unproven":
      return { type: "agent_end", status: "completed_unproven", result: event.result };
    case "query.failed":
      return { type: "agent_end", status: "failed", error: event.error };
    default:
      return undefined;
  }
}

/** Subscribe to `sessionRuntime` and emit RPC JSONL event frames onto stdout. */
export function attachRpcEventBridge(
  sessionRuntime: Pick<ShellSessionRuntime, "observeEvents">,
  writeLine: (line: string) => void = writeRawStdout,
): () => void {
  return sessionRuntime.observeEvents(event => {
    const rpcEvent = toRpcEvent(event);
    if (rpcEvent) writeLine(`${JSON.stringify(rpcEvent)}\n`);
  });
}
