import { isRecord } from '../../../core/values/record.js';
import type { CompletionContentFragment } from '../../../turn/completion.js';

export function readContent(parts: readonly unknown[]): readonly CompletionContentFragment[] {
  const fragments: CompletionContentFragment[] = [];
  for (const part of parts) {
    if (typeof part === 'string') {
      if (part) fragments.push({ kind: 'text', text: part });
      continue;
    }
    if (!isRecord(part)) continue;
    if (part.type === 'text' && typeof part.text === 'string' && part.text) {
      fragments.push({ kind: 'text', text: part.text });
    } else if (part.type === 'thinking' && Array.isArray(part.thinking)) {
      let text = '';
      for (const segment of part.thinking) {
        if (isRecord(segment) && segment.type === 'text' && typeof segment.text === 'string') text += segment.text;
      }
      if (text) fragments.push({ kind: 'reasoning', text });
    }
  }
  return fragments;
}

export function projectContent(parts: readonly unknown[]): { text: string; reasoning: string } {
  let text = '', reasoning = '';
  for (const fragment of readContent(parts)) {
    if (fragment.kind === 'text') text += fragment.text;
    else reasoning += fragment.text;
  }
  return { text, reasoning };
}
