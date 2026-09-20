import type { AgentMessage } from "../core/agent/state.js";

export const CHARS_PER_TOKEN = 3.5;

export const DEFAULT_RESERVE_TOKENS = 8000;

/**
 * How many characters one message contributes to a request.
 *
 * Tool calls count: their ids, names and arguments travel on the wire exactly
 * like prose does, and a single call can carry more bytes than the message that
 * asked for it. A budget that only counted text would under-report the context
 * that a tool-heavy turn actually occupies.
 */
export function messageCharCount(message: AgentMessage): number {
  let chars = message.content?.length ?? 0;
  if (message.tool_call_id) {
    chars += message.tool_call_id.length;
  }
  for (const call of message.tool_calls ?? []) {
    chars += call.id.length + call.function.name.length + call.function.arguments.length;
  }
  return chars;
}

export function estimateTokens(messages: readonly AgentMessage[]): number {
  let chars = 0;
  for (const message of messages) {
    chars += messageCharCount(message);
  }
  return Math.ceil(chars / CHARS_PER_TOKEN);
}
