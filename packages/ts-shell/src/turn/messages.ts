import { microcompactMessages } from '../core/query/microCompact.js';
import type { AgentMessage } from '../core/agent/state.js';
import { toChatMessages, type ChatMessage } from './prompt.js';

/** Identical source projection for dispatch and local preview. */
export function outgoingProjection(messages: readonly AgentMessage[], bridge: boolean) {
  const converted = toChatMessages(messages);
  const { messages: compacted, prunedCount } = microcompactMessages(converted, { keepRecentTurns: 3, maxOutputChars: 1000 });
  let result: ChatMessage[] = compacted;
  if (bridge) {
    result = [];
    for (const message of compacted) {
      if (message.role === 'user' && result.at(-1)?.role === 'tool') {
        result.push({ role: 'assistant', content: 'I have processed the tool results.' });
      }
      result.push(message);
    }
  }
  return {
    messages: result,
    sourceAligned: converted.length === messages.length && prunedCount === 0 && result.length === compacted.length,
  };
}

export function outgoingMessages(messages: readonly AgentMessage[], bridge: boolean): readonly ChatMessage[] {
  return outgoingProjection(messages, bridge).messages;
}

export const FINAL_STEP_MESSAGE =
  'You have reached the limit of steps you may take. You cannot call any more tools on this turn. ' +
  'Answer now with what you have: say what you did, what you found, and what remains unfinished.';

export function finalStepMessages(messages: readonly ChatMessage[], allowTools: boolean, hadTools: boolean): readonly ChatMessage[] {
  if (allowTools || !hadTools) return messages;
  return [...messages, { role: 'user', content: FINAL_STEP_MESSAGE }];
}

/** Whether a request history requires the selected model to understand tools. */
export function hasToolHistory(messages: readonly Pick<ChatMessage, 'role' | 'tool_calls'>[]): boolean {
  return messages.some(message =>
    message.role === 'tool' || (message.role === 'assistant' && (message.tool_calls?.length ?? 0) > 0),
  );
}

export const TOOL_HISTORY_UNSUPPORTED_MESSAGE =
  'The selected model does not support tool history. Start a new session or select a tool-capable model.';
