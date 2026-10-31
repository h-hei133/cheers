import { GptEncoding } from 'gpt-tokenizer/GptEncoding';
import cl100k from 'gpt-tokenizer/bpeRanks/cl100k_base';
import o200k from 'gpt-tokenizer/bpeRanks/o200k_base';
import { CHARS_PER_TOKEN } from '../../session/context.js';
import type { PromptCountMethod } from './model.js';

let current: { readonly encoding: 'cl100k_base' | 'o200k_base'; readonly counter: GptEncoding } | undefined;
const literalText = { disallowedSpecial: new Set<string>() };

/** Only an explicitly declared vocabulary selects a tokenizer; labels are not evidence. */
export function countRequestText(fragments: readonly string[], encoding: unknown): { tokens: number; method: PromptCountMethod } {
  if (encoding !== 'cl100k_base' && encoding !== 'o200k_base') {
    return { tokens: Math.ceil(fragments.reduce((total, fragment) => total + fragment.length, 0) / CHARS_PER_TOKEN),
      method: 'characters/3.5' };
  }
  if (current?.encoding !== encoding) {
    const counter = GptEncoding.getEncodingApi(encoding, () => encoding === 'cl100k_base' ? cl100k : o200k);
    // Retain one vocabulary, never request text or a growing merge cache.
    counter.setMergeCacheSize(0);
    current = { encoding, counter };
  }
  const counter = current.counter;
  return { tokens: fragments.reduce((total, fragment) => total + counter.countTokens(fragment, literalText), 0),
    method: encoding };
}
