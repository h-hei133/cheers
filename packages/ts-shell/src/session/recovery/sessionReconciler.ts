import type { SessionMessage } from "../schema/sessionMessage.js";

/**
 * Reconciles dangling or orphaned tool calls when recovering/resuming a crashed or interrupted session.
 *
 * If the last message is an assistant message with requested `tool_calls` that never received
 * corresponding `tool` result messages, this adds synthetic cancellation results so the
 * alternating conversation invariant required by Anthropic and OpenAI is preserved.
 */
export function reconcileDanglingToolCalls(
  messages: readonly SessionMessage[],
): SessionMessage[] {
  if (!messages || messages.length === 0) {
    return [];
  }

  const result: SessionMessage[] = [...messages];
  const lastIndex = result.length - 1;
  const lastMessage = result[lastIndex];

  if (
    lastMessage &&
    lastMessage.role === "assistant" &&
    Array.isArray(lastMessage.tool_calls) &&
    lastMessage.tool_calls.length > 0
  ) {
    // Check which tool calls were never completed
    const existingToolResultIds = new Set(
      result
        .filter((m) => m.role === "tool" && m.tool_call_id)
        .map((m) => m.tool_call_id!),
    );

    for (const toolCall of lastMessage.tool_calls) {
      if (!existingToolResultIds.has(toolCall.id)) {
        result.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: "Error: Tool execution was interrupted by process termination or user cancellation.",
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  return result;
}
