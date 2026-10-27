import { promptCodeEnd } from './literal.js';

export interface PromptToken {
  readonly from: number;
  readonly to: number;
  readonly raw: string;
  readonly literal?: 'quote' | 'code' | 'escape';
  readonly quote?: { readonly from: number; readonly to: number; readonly closed: boolean };
}

function quoteSpanEnd(text: string, from: number, quote: string): number | undefined {
  let index = from + 1;
  while (index < text.length) {
    if (text[index] === '\\' && quote === '"') {
      index += Math.min(2, text.length - index);
      continue;
    }
    if (text[index] === quote && (quote === '"' || !/[A-Za-z0-9_]/.test(text[index + 1] ?? ''))) return index + 1;
    index++;
  }
  return undefined;
}

function competingSingleQuote(text: string, from: number, end: number): boolean {
  for (let index = from + 1; index < end - 1; index++) {
    if (text[index] === "'" && quoteSpanEnd(text, index, "'") === end) return true;
  }
  return false;
}

function quoteStartsSpan(text: string, index: number, from: number, quote: string, end: number | undefined): boolean {
  const previous = text[index - 1];
  if (quote === '"') return true;
  if (index === from || previous === undefined) {
    return end !== undefined
      && !/^'(?:tis|twas|twere|twill|twould|em|cause|cos|til|bout|round|nother|\d{2}s)\b/i.test(text.slice(index));
  }
  if (!/[A-Za-z0-9_]/.test(previous)) return true;
  // A word-adjacent apostrophe is normally a contraction or possessive. Treat
  // it as shell-style concatenation only after a complete option name, with a
  // real close that is not claimed by an inner apostrophe.
  return /^--?[A-Za-z0-9][A-Za-z0-9-]*$/.test(text.slice(from, index))
    && end !== undefined && !competingSingleQuote(text, index, end);
}

/** Scan only user source. Quoted prose and code never contribute invocations. */
export function promptTokens(text: string): PromptToken[] {
  const tokens: PromptToken[] = [];
  for (let index = 0; index < text.length;) {
    if (/\s/.test(text[index]!)) { index++; continue; }
    const from = index;
    let literal: PromptToken['literal'];
    let quote: PromptToken['quote'];
    while (index < text.length && !/\s/.test(text[index]!)) {
      const char = text[index]!;
      if (char === '\\') {
        literal ??= 'escape'; index += Math.min(2, text.length - index); continue;
      }
      if (char === '`' || char === '~' && text.startsWith('~~~', index)) {
        const end = promptCodeEnd(text, index);
        if (end !== undefined) { literal = 'code'; index = end; continue; }
      }
      const end = char === '"' || char === "'" ? quoteSpanEnd(text, index, char) : undefined;
      if ((char === '"' || char === "'") && quoteStartsSpan(text, index, from, char, end)) {
        literal ??= 'quote';
        quote ??= { from: index, to: end ?? text.length, closed: end !== undefined };
        index = end ?? text.length;
        continue;
      }
      index++;
    }
    tokens.push({ from, to: index, raw: text.slice(from, index), ...(literal ? { literal } : {}),
      ...(quote ? { quote } : {}) });
  }
  return tokens;
}

export function promptTokenAt(text: string, cursor: number): PromptToken | undefined {
  return promptTokens(text).find(token => token.from <= cursor && cursor <= token.to);
}

/** Removing markers preserves every other source character, including newlines. */
export function withoutPromptTokens(text: string, tokens: readonly Pick<PromptToken, 'from' | 'to'>[]): string {
  let result = '';
  let from = 0;
  for (const token of tokens) { result += text.slice(from, token.from); from = token.to; }
  return result + text.slice(from);
}
