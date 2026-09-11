import type { AgentMessage } from "../core/agent/state.js";

export const CHARS_PER_TOKEN = 3.5;

export const DEFAULT_RESERVE_TOKENS = 8000;

export function estimateTokens(messages: readonly AgentMessage[]): number {
  let chars = 0;
  for (const message of messages) {
    chars += message.content?.length ?? 0;
    if (message.tool_call_id) {
      chars += message.tool_call_id.length;
    }
    const calls = message.tool_calls;
    if (calls) {
      for (const call of calls) {
        chars += call.id.length + call.function.name.length + call.function.arguments.length;
      }
    }
  }
  return Math.ceil(chars / CHARS_PER_TOKEN);
}
