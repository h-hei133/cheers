export interface PromptToken {
  readonly from: number;
  readonly to: number;
  readonly raw: string;
  readonly literal?: 'quote' | 'code' | 'escape';
}

/** Scan only user source. Quoted prose and code never contribute invocations. */
export function promptTokens(text: string): PromptToken[] {
  const tokens: PromptToken[] = [];
  for (let index = 0; index < text.length;) {
    if (/\s/.test(text[index]!)) { index++; continue; }
    const from = index;
    let literal: PromptToken['literal'];
    while (index < text.length && !/\s/.test(text[index]!)) {
      const char = text[index]!;
      if (char === '\\') {
        literal ??= 'escape'; index += Math.min(2, text.length - index); continue;
      }
      if (char === '`' || (char === '~' && text.startsWith('~~~', index) && /^\s*$/.test(text.slice(text.lastIndexOf('\n', index - 1) + 1, index)))) {
        literal = 'code';
        const marker = /^(?:`+|~+)/.exec(text.slice(index))![0];
        const end = text.indexOf(marker, index + marker.length);
        index = end < 0 ? text.length : end + marker.length;
        continue;
      }
      if (index === from && (char === '"' || char === "'")) {
        literal = 'quote'; index++;
        while (index < text.length && text[index] !== char) {
          if (text[index] === '\\' && char === '"') index++;
          index++;
        }
        if (index < text.length) index++;
        continue;
      }
      index++;
    }
    tokens.push({ from, to: index, raw: text.slice(from, index), ...(literal ? { literal } : {}) });
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
