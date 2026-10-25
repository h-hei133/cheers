import { microcompactMessages } from '../core/query/microCompact.js';
import type { AgentMessage } from '../core/agent/state.js';
import { toChatMessages, type ChatMessage } from './prompt.js';

/** Identical source projection for dispatch and local preview. */
export function outgoingMessages(messages: readonly AgentMessage[], bridge: boolean): readonly ChatMessage[] {
  const compacted = microcompactMessages(toChatMessages(messages), { keepRecentTurns: 3, maxOutputChars: 1000 }).messages;
  if (!bridge) return compacted;
  const result: ChatMessage[] = [];
  for (const message of compacted) {
    if (message.role === 'user' && result.at(-1)?.role === 'tool') {
      result.push({ role: 'assistant', content: 'I have processed the tool results.' });
    }
    result.push(message);
  }
  return result;
}

export function finalStepMessages(messages: readonly ChatMessage[], allowTools: boolean, hadTools: boolean): readonly ChatMessage[] {
  if (allowTools || !hadTools) return messages;
  return [...messages, { role: 'user', content:
    'You have reached the limit of steps you may take. You cannot call any more tools on this turn. ' +
    'Answer now with what you have: say what you did, what you found, and what remains unfinished.' }];
}
