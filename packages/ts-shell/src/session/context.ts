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

/**
 * What a request carries besides the conversation: the instruction, and the
 * declarations of the tools the model may call.
 *
 * These travel as their own parameters rather than as messages, so an estimate
 * built from `messages` alone does not see them. On a cold start that is the
 * whole of what the request holds, and the number is not small: thirteen tool
 * declarations run to several thousand characters, which is more than the first
 * few exchanges of a conversation. Counting the conversation and calling it the
 * context under-reports by exactly that amount, and the under-report lands on
 * the compaction threshold — the one decision the number is used for.
 *
 * Both are measured as they are sent, so this stays right when the tool list or
 * the instruction changes size.
 */
export interface RequestOverhead {
  /** The system instruction as the request carries it. */
  readonly systemPrompt?: string;
  /** The tool declarations as the request carries them. */
  readonly tools?: readonly unknown[];
}

/**
 * Characters one request spends outside its messages.
 *
 * Kept separate from the token count because the callers that add it up want
 * characters: two overheads summed as tokens would each be rounded before being
 * added, and the rounding is what the total is supposed to avoid.
 */
export function overheadCharCount(overhead: RequestOverhead | undefined): number {
  if (!overhead) return 0;
  let chars = overhead.systemPrompt?.length ?? 0;
  if (overhead.tools && overhead.tools.length > 0) {
    chars += JSON.stringify(overhead.tools).length;
  }
  return chars;
}

/**
 * The conversation's tokens plus everything else the request carries.
 *
 * The form every caller that is asking "does this request fit" wants, so the
 * overhead is added in one place rather than at each threshold.
 */
export function estimateRequestTokens(
  messages: readonly AgentMessage[],
  overhead: RequestOverhead | undefined,
): number {
  const chars = messages.reduce((total, message) => total + messageCharCount(message), 0);
  return Math.ceil((chars + overheadCharCount(overhead)) / CHARS_PER_TOKEN);
}
