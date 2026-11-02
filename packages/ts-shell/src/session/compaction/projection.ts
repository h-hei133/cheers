import type { AgentMessage } from '../../core/agent/state.js';
import { CHARS_PER_TOKEN } from '../context.js';

const TRUNCATION_MARKER = '\n\n[... truncated for summary ...]\n\n';

/** Move a cut inward so the projection never separates a UTF-16 surrogate pair. */
function textBoundary(text: string, index: number, direction: -1 | 1): number {
  const before = text.charCodeAt(index - 1);
  const after = text.charCodeAt(index);
  return before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff
    ? index + direction : index;
}

function clampText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const firstChars = textBoundary(text, 1, 1);
  const lastChars = text.length - textBoundary(text, text.length - 1, -1);
  const minimumChars = firstChars + lastChars;
  // Short results stay verbatim: a marker plus both ends would make them larger.
  if (text.length <= TRUNCATION_MARKER.length + minimumChars) return text;
  const keepChars = Math.max(minimumChars, maxChars - TRUNCATION_MARKER.length);
  const headChars = Math.max(firstChars, Math.min(Math.ceil(keepChars / 2), keepChars - lastChars));
  const headEnd = textBoundary(text, headChars, -1);
  const tailStart = textBoundary(text, text.length - (keepChars - headChars), 1);
  return text.slice(0, headEnd) + TRUNCATION_MARKER + text.slice(tailStart);
}

/** Calls, result identities, non-tool prose and images are fixed request overhead. */
function projectResults(messages: readonly AgentMessage[], fraction: number): readonly AgentMessage[] {
  return messages.map(message => {
    if (message.role !== 'tool') return message;
    if (typeof message.content === 'string') {
      const content = clampText(message.content, Math.floor(message.content.length * fraction));
      return content === message.content ? message : { ...message, content };
    }
    let changed = false;
    const content = message.content.map(block => {
      if (block.type !== 'text') return block;
      const text = clampText(block.text, Math.floor(block.text.length * fraction));
      if (text === block.text) return block;
      changed = true;
      return { ...block, text };
    });
    return changed ? { ...message, content } : message;
  });
}

/** Shrink only the summary projection, then recheck the complete request budget. */
export function clampToolResults(
  messages: readonly AgentMessage[],
  maxTokens: number,
  fits: (messages: readonly AgentMessage[]) => boolean,
): readonly AgentMessage[] | undefined {
  let textChars = 0;
  for (const message of messages) {
    if (message.role !== 'tool') continue;
    if (typeof message.content === 'string') textChars += message.content.length;
    else for (const block of message.content) if (block.type === 'text') textChars += block.text.length;
  }
  if (!textChars) return undefined;
  let projected = projectResults(messages, 0);
  // Even the minimal result projection must retain both ends and its loss marker.
  if (!fits(projected)) return undefined;
  let low = 0;
  let high = Math.min(textChars, Math.floor(maxTokens * CHARS_PER_TOKEN));
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const candidate = projectResults(messages, middle / textChars);
    if (fits(candidate)) { projected = candidate; low = middle; }
    else high = middle - 1;
  }
  return projected;
}
