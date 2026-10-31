import { createRequire } from 'node:module';
import { GptEncoding } from 'gpt-tokenizer/GptEncoding';
import { CHARS_PER_TOKEN } from '../../session/context.js';
import type { PromptCountMethod } from './model.js';

let current: { readonly encoding: 'cl100k_base' | 'o200k_base'; readonly counter: GptEncoding } | undefined;
const literalText = { disallowedSpecial: new Set<string>() };
const nativeRequire = createRequire(import.meta.url);

/** Literal require calls let Bun embed each table while keeping its initialization lazy. */
function ranks(encoding: 'cl100k_base' | 'o200k_base'): typeof import('gpt-tokenizer/bpeRanks/cl100k_base').default {
  return encoding === 'cl100k_base'
    ? (typeof require === 'function' ? require('gpt-tokenizer/bpeRanks/cl100k_base') : nativeRequire('gpt-tokenizer/bpeRanks/cl100k_base')).default
    : (typeof require === 'function' ? require('gpt-tokenizer/bpeRanks/o200k_base') : nativeRequire('gpt-tokenizer/bpeRanks/o200k_base')).default;
}

/** Only an explicitly declared vocabulary selects a tokenizer; labels are not evidence. */
export function countRequestText(fragments: readonly string[], encoding: unknown): { tokens: number; method: PromptCountMethod } {
  if (encoding !== 'cl100k_base' && encoding !== 'o200k_base') {
    return { tokens: Math.ceil(fragments.reduce((total, fragment) => total + fragment.length, 0) / CHARS_PER_TOKEN),
      method: 'characters/3.5' };
  }
  if (current?.encoding !== encoding) {
    const counter = GptEncoding.getEncodingApi(encoding, () => ranks(encoding));
    // Retain one encoder; loaded table modules never contain request text.
    counter.setMergeCacheSize(0);
    current = { encoding, counter };
  }
  const counter = current.counter;
  return { tokens: fragments.reduce((total, fragment) => total + counter.countTokens(fragment, literalText), 0),
    method: encoding };
}
