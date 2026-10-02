/** Quoting and escapes without expansion; an unfinished quoted argument stays literal. */
export function tokenizeCommandArgs(input: string): string[] {
  const args: string[] = [];
  let value = "";
  let start = -1;
  let quote: string | null = null;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (char === "\\" && quote !== "'") {
      const next = input[index + 1];
      if (next === undefined) throw new SyntaxError("Trailing escape in command arguments.");
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
      if (start >= 0) args.push(value);
      value = "";
      start = -1;
    } else {
      if (start < 0) start = index;
      value += char;
    }
  }
  // Preserve the whole unfinished argument, including its opening quote or
  // apostrophe. Do not split its tail again: it may contain option-like prose.
  if (start >= 0) args.push(quote ? input.slice(start) : value);
  return args;
}
