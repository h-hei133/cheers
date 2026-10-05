export interface ArgumentToken {
  readonly from: number;
  readonly to: number;
  readonly value: string;
  readonly quote: string | null;
}

/** Source ranges and decoded values, without expansion. */
export function scanCommandArgs(input: string, partial = false): ArgumentToken[] {
  const args: ArgumentToken[] = [];
  let value = "";
  let start = -1;
  let quote: string | null = null;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (char === "\\" && quote !== "'") {
      const next = input[index + 1];
      if (next === undefined) {
        if (!partial) throw new SyntaxError("Trailing escape in command arguments.");
        if (start < 0) start = index;
        value += char;
        break;
      }
      if (next === "\n") {
        index += 1;
        continue;
      }
      if (start < 0) start = index;
      if (quote === '"' && !['"', "\\", "$", "`"].includes(next)) {
        value += char;
      } else {
        value += next;
        index += 1;
      }
    } else if (quote) {
      if (char === quote) quote = null;
      else value += char;
    } else if (char === '"' || char === "'") {
      if (start < 0) start = index;
      quote = char;
    } else if (/\s/.test(char)) {
      if (start >= 0) args.push({ from: start, to: index, value, quote });
      value = "";
      start = -1;
    } else {
      if (start < 0) start = index;
      value += char;
    }
  }
  if (start >= 0) args.push({ from: start, to: input.length, value, quote });
  return args;
}

/** Quoting and escapes without expansion; an unfinished quoted argument stays literal. */
export function tokenizeCommandArgs(input: string): string[] {
  return scanCommandArgs(input).map(token => token.quote ? input.slice(token.from, token.to) : token.value);
}
